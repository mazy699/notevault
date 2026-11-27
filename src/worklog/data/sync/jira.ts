import type { JiraConfigView } from "../../../../shared/types";
import type { TaskPriority, TaskStatus } from "../../types";
import type {
  JiraIssue,
  JiraSearchResponse,
  JiraTestResult,
  JiraTransport,
  MappedJiraIssue,
} from "./types";

const FIELDS = [
  "summary",
  "description",
  "status",
  "priority",
  "issuetype",
  "project",
  "parent",
  "duedate",
  "timeoriginalestimate",
  "updated",
].join(",");

const PAGE_SIZE = 50;
const MAX_PAGES = 20;
const HOURS_PER_DAY = 8;

export function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** 从上次同步时间生成 JQL 增量窗口（向前重叠 5 分钟，抵消时钟偏差） */
export function sinceFromLast(last: string | null, overlapMinutes = 5): string | null {
  if (!last) return null;
  const d = new Date(last.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return null;
  d.setMinutes(d.getMinutes() - overlapMinutes);
  const p = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 给 JQL 追加 updated 增量条件。
 * JQL 允许用户自定义 ORDER BY，这里把条件插在 ORDER BY 之前。
 */
export function withUpdated(jql: string, since: string | null): string {
  const text = (jql ?? "").trim();
  if (!since) return text;
  const m = /\border\s+by\b/i.exec(text);
  const base = (m ? text.slice(0, m.index) : text).trim();
  const order = m ? text.slice(m.index) : "ORDER BY updated ASC";
  return `${base} AND updated >= "${since}" ${order}`;
}

export function mapStatus(category: string | undefined, name: string | undefined): TaskStatus {
  const n = (name ?? "").toLowerCase();
  if (/block|hold|暂停|阻塞|等待|挂起/.test(n)) return "on_hold";
  if (category === "done") return "done";
  if (category === "indeterminate") return "in_progress";
  return "todo";
}

export function mapPriority(name: string | undefined): TaskPriority {
  const n = (name ?? "").toLowerCase();
  if (/highest|high|blocker|critical|urgent|紧急|高/.test(n)) return "high";
  if (/lowest|low|minor|trivial|低/.test(n)) return "low";
  return "medium";
}

export function estimateDays(seconds: number | null | undefined): number | null {
  const s = Number(seconds ?? 0);
  if (!Number.isFinite(s) || s <= 0) return null;
  const days = Math.round((s / (HOURS_PER_DAY * 3600)) * 2) / 2;
  return Math.min(100, Math.max(0.5, days));
}

/** Jira Cloud v3 的 description 是 ADF；这里做最小降级，保证导入后仍可读 */
export function adfToText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as {
    type?: string;
    text?: string;
    content?: unknown[];
    attrs?: { level?: number };
  };
  if (n.type === "text") return n.text ?? "";
  if (n.type === "hardBreak") return "\n";
  const inner = Array.isArray(n.content) ? n.content.map(adfToText).join("") : "";
  switch (n.type) {
    case "paragraph":
      return inner + "\n\n";
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(n.attrs?.level ?? 1)));
      return "#".repeat(level) + " " + inner + "\n\n";
    }
    case "bulletList":
    case "orderedList":
      return inner + "\n";
    case "listItem":
      return "- " + inner.trim() + "\n";
    case "codeBlock":
      return "```\n" + inner + "\n```\n";
    case "blockquote":
      return "> " + inner.trim() + "\n";
    default:
      return inner;
  }
}

function descriptionText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") return adfToText(value).trim();
  return "";
}

function projectNameOf(issue: JiraIssue): string {
  const key = issue.fields?.project?.key ?? "";
  const name = issue.fields?.project?.name ?? "";
  const label = key && name ? `${key} · ${name}` : key || name || "Jira";
  return label.slice(0, 50);
}

function issueTypeOf(issue: JiraIssue): string {
  const type = issue.fields?.issuetype;
  if (type?.subtask) return "planned_dev";
  if (/bug/i.test(type?.name ?? "")) return "prod_issue";
  return "planned_dev";
}

export function mapIssue(issue: JiraIssue, baseUrl: string): MappedJiraIssue {
  const f = issue.fields ?? {};
  const key = (issue.key ?? "").trim();
  const due = typeof f.duedate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f.duedate) ? f.duedate : null;
  return {
    externalSource: "jira",
    externalId: key,
    externalUrl: `${baseUrl.replace(/\/+$/, "")}/browse/${encodeURIComponent(key)}`,
    externalParentKey: f.parent?.key ?? null,
    externalParentSummary: f.parent?.fields?.summary ?? null,
    externalStatus: f.status?.name ?? null,
    externalUpdated: f.updated ?? null,
    title: (f.summary ?? "").trim() || key || "(无标题)",
    description: descriptionText(f.description),
    status: mapStatus(f.status?.statusCategory?.key, f.status?.name),
    priority: mapPriority(f.priority?.name),
    estimateDays: estimateDays(f.timeoriginalestimate),
    windowStart: due,
    windowEnd: due,
    type: issueTypeOf(issue),
    projectName: projectNameOf(issue),
  };
}

function parseJiraError(body: string): string {
  try {
    const data = JSON.parse(body) as JiraSearchResponse;
    const msgs = [...(data.errorMessages ?? []), ...Object.values(data.errors ?? {})];
    if (msgs.length) return msgs.join("；");
  } catch {
    /* 非 JSON 错误体 */
  }
  return "";
}

export function httpMessage(status: number, body: string): string {
  const detail = parseJiraError(body);
  if (status === 401) return "认证失败（401）：请检查邮箱 / API Token 或 PAT 是否有效";
  if (status === 403) return "权限不足（403）：当前账号无权访问该 Jira 资源";
  if (status === 404) return "地址或接口不存在（404）：请确认 Jira 地址（含 context path）";
  if (status === 410) return "接口已下线（410）：请确认 Jira 版本与搜索接口";
  if (status === 429) return "请求过于频繁（429）：请调大同步间隔后重试";
  return `Jira 返回 ${status}${detail ? `：${detail}` : ""}`;
}

async function searchAll(
  transport: JiraTransport,
  jql: string,
  fields = FIELDS
): Promise<JiraIssue[]> {
  const out: JiraIssue[] = [];
  let startAt = 0;
  let total = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const path =
      `/rest/api/2/search?jql=${encodeURIComponent(jql)}` +
      `&startAt=${startAt}&maxResults=${PAGE_SIZE}` +
      `&fields=${encodeURIComponent(fields)}`;
    const res = await transport.request({ path });
    if (res.status !== 200) throw new Error(httpMessage(res.status, res.body));
    let data: JiraSearchResponse;
    try {
      data = JSON.parse(res.body) as JiraSearchResponse;
    } catch {
      throw new Error("Jira 返回的不是合法 JSON");
    }
    const issues = data.issues ?? [];
    out.push(...issues);
    total = Number(data.total ?? out.length);
    if (issues.length === 0 || out.length >= total) break;
    startAt += issues.length;
  }
  // 超过分页上限时中止，避免全量同步把没拉到的任务误标为“已消失”
  if (out.length < total) {
    throw new Error(`JQL 结果超过 ${MAX_PAGES * PAGE_SIZE} 条，请缩小 JQL 范围后重试`);
  }
  return out;
}

/**
 * 拉取需要同步的 issue：
 * 1) 配置的主 JQL（默认：我负责的子任务 + Bug）
 * 2) 可选：我负责的 Story 下的全部子任务（两段式，兼容子任务未指派给我的情况）
 */
export async function fetchIssues(
  transport: JiraTransport,
  cfg: JiraConfigView,
  opts: { since: string | null }
): Promise<{ issues: JiraIssue[]; warnings: string[] }> {
  const warnings: string[] = [];
  const byKey = new Map<string, JiraIssue>();

  for (const issue of await searchAll(transport, withUpdated(cfg.jql, opts.since))) {
    if (issue.key) byKey.set(issue.key, issue);
  }

  if (cfg.includeStorySubtasks) {
    try {
      // Story 列表不按 updated 过滤：否则“Story 未变、子任务刚更新”的增量会被漏掉
      const stories = await searchAll(
        transport,
        "assignee = currentUser() AND issuetype = Story ORDER BY updated ASC",
        "summary"
      );
      const keys = [...new Set(stories.map((s) => s.key).filter(Boolean))];
      for (let i = 0; i < keys.length; i += 50) {
        const batch = keys.slice(i, i + 50);
        const jql = withUpdated(`parent in (${batch.join(", ")})`, opts.since);
        for (const issue of await searchAll(transport, jql)) {
          if (issue.key && !byKey.has(issue.key)) byKey.set(issue.key, issue);
        }
      }
    } catch (e) {
      // 子任务补充查询失败不应让主同步整体失败（如旧版 Jira 不支持 parent in）
      warnings.push(`“我负责的 Story 下的子任务”补充同步失败：${errText(e)}`);
    }
  }

  return { issues: [...byKey.values()], warnings };
}

export async function testConnection(transport: JiraTransport): Promise<JiraTestResult> {
  try {
    const res = await transport.request({ path: "/rest/api/2/myself" });
    if (res.status === 200) {
      let user = "";
      try {
        const data = JSON.parse(res.body) as {
          displayName?: string;
          name?: string;
          emailAddress?: string;
        };
        user = data.displayName || data.name || data.emailAddress || "";
      } catch {
        /* 忽略解析失败 */
      }
      return { ok: true, message: user ? `连接正常：${user}` : "连接正常", user };
    }
    return { ok: false, message: httpMessage(res.status, res.body) };
  } catch (e) {
    return { ok: false, message: errText(e) };
  }
}
