/**
 * Jira 同步（Phase 1：只读导入）。
 * - 配置存 setting 表：jira_config（不含 token）/ jira_token / jira_last_sync
 * - HTTP 走宿主代理（wl_ai_proxy 垫片），规避 WebView/浏览器 CORS；目标域名仅限配置的 baseUrl
 * - 全量分页拉取 + 以 (external_source='jira', external_id) 幂等 upsert；重复同步不产生重复任务
 * - JQL 结果中消失的 issue 仅标记 external_missing，绝不删除本地任务与工作条目
 * - 错误信息统一脱敏（不含 token）
 */
import { inTxn, q, run, scalar, type Database } from "./db";
import { getSetting, setSetting } from "./settings";
import { nowStr } from "./dates";
import { createProject } from "./project";
import type {
  JiraConfig,
  JiraConfigInput,
  JiraConfigView,
  JiraSyncResult,
  JiraSyncStatus,
  JiraTestResult,
  TaskPriority,
  TaskStatus,
} from "../types";

const CONFIG_KEY = "jira_config";
const TOKEN_KEY = "jira_token";
const STATUS_KEY = "jira_last_sync";

const PAGE_SIZE = 50;
/** 分页上限：2000 条 issue，防 JQL 写错导致失控拉取 */
const MAX_PAGES = 40;
const FIELDS = [
  "summary",
  "description",
  "status",
  "duedate",
  "timeoriginalestimate",
  "priority",
  "project",
  "issuetype",
  "parent",
  "updated",
];
/** 描述落地上限（字符），防止异常大字段撑爆本地库 */
const DESCRIPTION_MAX = 20000;

/** 默认 JQL：分配给我的子任务 + Bug（可在设置页改成任意 JQL） */
export const DEFAULT_JIRA_JQL = "assignee = currentUser() AND issuetype in (Sub-task, Bug) ORDER BY updated ASC";

export function normalizeJiraConfig(input: Partial<JiraConfigInput> | null | undefined): JiraConfig {
  const baseUrl = String(input?.baseUrl ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\/.+/i.test(baseUrl)) throw new Error("Jira 地址必须是 http(s) 地址");
  const authType = input?.authType === "basic" ? "basic" : "pat";
  const jql = String(input?.jql ?? "").trim() || DEFAULT_JIRA_JQL;
  let interval = Number(input?.intervalMinutes);
  if (!Number.isFinite(interval)) interval = 15;
  interval = Math.min(1440, Math.max(5, Math.round(interval)));
  return {
    baseUrl,
    authType,
    email: String(input?.email ?? "").trim(),
    jql,
    intervalMinutes: interval,
    enabled: input?.enabled === true,
  };
}

/** 保存配置；token 非空时更新，留空表示保持旧值 */
export function saveJiraConfig(db: Database, input: JiraConfigInput): void {
  const cfg = normalizeJiraConfig(input);
  setSetting(db, CONFIG_KEY, JSON.stringify(cfg));
  const token = String(input.token ?? "").trim();
  if (token) setSetting(db, TOKEN_KEY, token);
}

/** 读取配置；从未配置时返回默认模板（供设置页填充） */
export function getJiraConfigView(db: Database): JiraConfigView {
  const raw = getSetting(db, CONFIG_KEY);
  let config: JiraConfig | null = null;
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        // 归一化但跳过 baseUrl 校验（历史数据可能不完整）
        try {
          config = normalizeJiraConfig(parsed as Partial<JiraConfigInput>);
        } catch {
          config = null;
        }
      }
    } catch {
      config = null;
    }
  }
  return {
    config:
      config ?? {
        baseUrl: "",
        authType: "pat",
        email: "",
        jql: DEFAULT_JIRA_JQL,
        intervalMinutes: 15,
        enabled: false,
      },
    hasToken: Boolean((getSetting(db, TOKEN_KEY) ?? "").trim()),
  };
}

function loadConfigAndToken(db: Database): { cfg: JiraConfig; token: string } {
  const { config } = getJiraConfigView(db);
  if (!config.baseUrl) throw new Error("尚未配置 Jira 地址：请到 设置 → Jira 同步 填写");
  const token = (getSetting(db, TOKEN_KEY) ?? "").trim();
  if (!token) throw new Error("尚未配置 Jira Token：请到 设置 → Jira 同步 填写");
  if (config.authType === "basic" && !config.email) {
    throw new Error("邮箱 + API Token 认证需要填写登录邮箱");
  }
  return { cfg: config, token };
}

export function getJiraSyncStatus(db: Database): JiraSyncStatus {
  const raw = getSetting(db, STATUS_KEY);
  if (!raw) return { lastSyncAt: null, lastResult: null, lastError: null, lastCount: null };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const p = parsed as Partial<JiraSyncStatus>;
      return {
        lastSyncAt: typeof p.lastSyncAt === "string" ? p.lastSyncAt : null,
        lastResult: p.lastResult === "ok" || p.lastResult === "error" ? p.lastResult : null,
        lastError: typeof p.lastError === "string" ? p.lastError : null,
        lastCount: Number.isFinite(Number(p.lastCount)) ? Number(p.lastCount) : null,
      };
    }
  } catch {
    /* 忽略损坏状态 */
  }
  return { lastSyncAt: null, lastResult: null, lastError: null, lastCount: null };
}

export function saveSyncStatus(db: Database, status: JiraSyncStatus): void {
  setSetting(db, STATUS_KEY, JSON.stringify(status));
}

/** 错误脱敏：任何对外信息都不包含 token */
export function sanitizeJiraError(db: Database, e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const token = (getSetting(db, TOKEN_KEY) ?? "").trim();
  return token ? msg.split(token).join("***") : msg;
}

// ---------------- HTTP ----------------

interface JiraIssue {
  key: string;
  fields: Record<string, unknown>;
}

async function jiraFetchJson(
  fetchImpl: typeof fetch,
  url: string,
  headers: Record<string, string>,
  body?: string
): Promise<unknown> {
  const res = await fetchImpl(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = "";
    try {
      const j: unknown = JSON.parse(text);
      if (j && typeof j === "object") {
        const o = j as { errorMessages?: unknown; message?: unknown };
        if (Array.isArray(o.errorMessages) && o.errorMessages.length) detail = o.errorMessages.map(String).join("; ");
        else if (typeof o.message === "string") detail = o.message;
      }
    } catch {
      /* 非 JSON 响应体 */
    }
    throw new Error(`Jira 请求失败（HTTP ${res.status}）${detail ? `：${detail.slice(0, 200)}` : ""}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Jira 返回内容不是合法 JSON");
  }
}

function authHeaders(cfg: JiraConfig, token: string): Record<string, string> {
  if (cfg.authType === "basic") {
    return { Authorization: `Basic ${btoa(`${cfg.email}:${token}`)}` };
  }
  return { Authorization: `Bearer ${token}` };
}

/** Cloud（*.atlassian.net）用 API 3，自建 Server/DC 用 API 2 */
function apiVersionOf(cfg: JiraConfig): 2 | 3 {
  return /atlassian\.net/i.test(cfg.baseUrl) ? 3 : 2;
}

/** 全量分页拉取（全量 + 幂等 upsert，同时保证消失标记准确；个人任务量级下代价可忽略） */
async function fetchAllIssues(fetchImpl: typeof fetch, cfg: JiraConfig, token: string): Promise<JiraIssue[]> {
  const headers = authHeaders(cfg, token);
  const issues: JiraIssue[] = [];
  const ver = apiVersionOf(cfg);
  if (ver === 3) {
    // Cloud：POST /rest/api/3/search/jql，nextPageToken 翻页
    let nextPageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const body: Record<string, unknown> = { jql: cfg.jql, maxResults: PAGE_SIZE, fields: FIELDS };
      if (nextPageToken) body.nextPageToken = nextPageToken;
      const data = (await jiraFetchJson(fetchImpl, `${cfg.baseUrl}/rest/api/3/search/jql`, headers, JSON.stringify(body))) as {
        issues?: JiraIssue[];
        nextPageToken?: string;
      };
      const batch = Array.isArray(data.issues) ? data.issues : [];
      issues.push(...batch);
      if (!data.nextPageToken || batch.length === 0) break;
      nextPageToken = data.nextPageToken;
    }
  } else {
    // Server/DC：POST /rest/api/2/search，startAt 翻页
    let startAt = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const body = { jql: cfg.jql, startAt, maxResults: PAGE_SIZE, fields: FIELDS };
      const data = (await jiraFetchJson(fetchImpl, `${cfg.baseUrl}/rest/api/2/search`, headers, JSON.stringify(body))) as {
        issues?: JiraIssue[];
        startAt?: number;
        total?: number;
      };
      const batch = Array.isArray(data.issues) ? data.issues : [];
      issues.push(...batch);
      const total = Number(data.total ?? issues.length);
      if (batch.length === 0 || issues.length >= total) break;
      startAt = Number(data.startAt ?? startAt) + batch.length;
    }
  }
  return issues;
}

// ---------------- 字段映射 ----------------

export interface MappedJiraTask {
  externalId: string;
  title: string;
  description: string;
  /** 未知状态映射为 null：更新时保留本地状态 */
  status: TaskStatus | null;
  estimateDays: number | null;
  windowStart: string | null;
  windowEnd: string | null;
  priority: TaskPriority;
  projectName: string;
  externalUrl: string;
  parentKey: string | null;
  parentSummary: string | null;
  externalUpdated: string | null;
  jiraType: string;
}

function mapJiraStatus(status: unknown): TaskStatus | null {
  const cat = (status as { statusCategory?: { key?: string } } | null)?.statusCategory?.key;
  if (cat === "done") return "done";
  if (cat === "indeterminate") return "in_progress";
  if (cat === "new") return "todo";
  return null;
}

const PRIORITY_HIGH = ["highest", "high", "blocker", "critical", "最高", "高", "紧急"];
const PRIORITY_LOW = ["lowest", "low", "最低", "低"];

function mapJiraPriority(priority: unknown): TaskPriority {
  const name = String((priority as { name?: string } | null)?.name ?? "")
    .trim()
    .toLowerCase();
  if (PRIORITY_HIGH.includes(name)) return "high";
  if (PRIORITY_LOW.includes(name)) return "low";
  return "medium";
}

/** timeoriginalestimate（秒）→ 工作日数（8h/天，1 位小数，0.5~100） */
function estimateDaysFromSeconds(seconds: unknown): number | null {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return null;
  const days = Math.round((s / 3600 / 8) * 10) / 10;
  if (days < 0.5) return 0.5;
  return Math.min(100, days);
}

/** 描述：Server/DC 为 wiki 文本直接落地；Cloud 为 ADF 对象，抽取纯文本 */
function extractDescription(desc: unknown): string {
  if (typeof desc === "string") return desc.slice(0, DESCRIPTION_MAX);
  if (desc && typeof desc === "object") return adfToText(desc).slice(0, DESCRIPTION_MAX);
  return "";
}

function adfToText(node: unknown): string {
  if (node == null || typeof node !== "object") return "";
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (typeof n.text === "string") return n.text;
  if (!Array.isArray(n.content)) return "";
  const inner = n.content.map(adfToText).join("");
  if (n.type === "paragraph" || n.type === "heading" || n.type === "blockquote") return `${inner}\n`;
  return inner;
}

/** Jira 类型 → 本地内置类型（Bug/故障 → 线上排查；其余 → 排期开发） */
function pickTaskType(jiraType: string): string {
  return /bug|缺陷|故障|线上/i.test(jiraType) ? "prod_issue" : "planned_dev";
}

export function mapJiraIssue(issue: JiraIssue, cfg: JiraConfig): MappedJiraTask | null {
  const f = (issue.fields ?? {}) as Record<string, unknown>;
  const key = String(issue.key ?? "").trim();
  if (!key) return null;
  const due = typeof f.duedate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f.duedate) ? f.duedate : null;
  const parent = (f.parent ?? null) as { key?: string; fields?: { summary?: string } } | null;
  const project = (f.project ?? null) as { key?: string; name?: string } | null;
  const jiraType = String((f.issuetype as { name?: string } | undefined)?.name ?? "");
  const summary = String(f.summary ?? "").trim() || key;
  return {
    externalId: key,
    title: summary,
    description: extractDescription(f.description),
    status: mapJiraStatus(f.status),
    estimateDays: estimateDaysFromSeconds(f.timeoriginalestimate),
    windowStart: due,
    windowEnd: due,
    priority: mapJiraPriority(f.priority),
    projectName: String(project?.name ?? project?.key ?? "").trim() || "Jira",
    externalUrl: `${cfg.baseUrl}/browse/${key}`,
    parentKey: parent?.key ? String(parent.key) : null,
    parentSummary: parent?.fields?.summary ? String(parent.fields.summary) : null,
    externalUpdated: typeof f.updated === "string" ? f.updated : null,
    jiraType,
  };
}

// ---------------- upsert / 同步 ----------------

/** 按项目名取本地项目 id，不存在则自动创建（名称截断 50 字符） */
function resolveProject(db: Database, name: string): number {
  const trimmed = name.trim().slice(0, 50) || "Jira";
  const rows = q<{ id: number }>(db, "SELECT id FROM project WHERE name = ?", [trimmed]);
  if (rows.length) return Number(rows[0].id);
  return createProject(db, trimmed).id;
}

type UpsertOutcome = "created" | "updated" | "unchanged";

function upsertJiraTask(db: Database, m: MappedJiraTask): UpsertOutcome {
  const now = nowStr();
  const existing = q<{ id: number; completed_at: string | null; status: string; external_updated: string | null; external_missing: number | null }>(
    db,
    "SELECT id, completed_at, status, external_updated, external_missing FROM task WHERE external_source = 'jira' AND external_id = ?",
    [m.externalId]
  );
  const projectId = resolveProject(db, m.projectName);
  return inTxn(db, () => {
    if (existing.length) {
      const ex = existing[0];
      if (ex.external_updated != null && ex.external_updated === m.externalUpdated) {
        // Jira 侧无变化：仅补清"源缺失"标记，不覆盖本地编辑
        if (Number(ex.external_missing ?? 0) === 1) {
          run(db, "UPDATE task SET external_missing = 0 WHERE id = ?", [Number(ex.id)]);
        }
        return "unchanged";
      }
      const status = m.status ?? (ex.status as TaskStatus);
      const completedAt = status === "done" ? ex.completed_at ?? now : null;
      run(
        db,
        `UPDATE task SET title=?, description=?, status=?, estimate_days=?, window_start=?, window_end=?, priority=?,
         project_id=?, external_url=?, external_parent_key=?, external_parent_summary=?, external_updated=?,
         external_missing=0, completed_at=?, updated_at=? WHERE id=?`,
        [
          m.title,
          m.description,
          status,
          m.estimateDays,
          m.windowStart,
          m.windowEnd,
          m.priority,
          projectId,
          m.externalUrl,
          m.parentKey,
          m.parentSummary,
          m.externalUpdated,
          completedAt,
          now,
          Number(ex.id),
        ]
      );
      return "updated";
    }
    const status = m.status ?? "todo";
    run(
      db,
      `INSERT INTO task (title, description, type, priority, status, estimate_days, window_start, window_end, project_id,
        external_source, external_id, external_url, external_parent_key, external_parent_summary, external_updated,
        external_missing, created_at, updated_at, completed_at)
       VALUES (?,?,?,?,?,?,?,?,?, 'jira', ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [
        m.title,
        m.description,
        pickTaskType(m.jiraType),
        m.priority,
        status,
        m.estimateDays,
        m.windowStart,
        m.windowEnd,
        projectId,
        m.externalId,
        m.externalUrl,
        m.parentKey,
        m.parentSummary,
        m.externalUpdated,
        now,
        now,
        status === "done" ? now : null,
      ]
    );
    return "created";
  });
}

/** JQL 结果中消失的 issue 标记 external_missing（保留数据，不删除） */
function markMissingTasks(db: Database, keys: Set<string>): number {
  const now = nowStr();
  if (keys.size === 0) {
    run(db, "UPDATE task SET external_missing = 1, updated_at = ? WHERE external_source = 'jira' AND external_missing = 0", [now]);
  } else {
    const ph = [...keys].map(() => "?").join(",");
    run(
      db,
      `UPDATE task SET external_missing = 1, updated_at = ? WHERE external_source = 'jira' AND external_missing = 0 AND external_id NOT IN (${ph})`,
      [now, ...keys]
    );
  }
  return Number(scalar(db, "SELECT changes()") ?? 0);
}

/** 全量同步：拉取 → 映射 → upsert → 消失标记 → 记录状态。失败时记录失败状态（脱敏）后抛错。 */
export async function syncJiraTasks(db: Database, fetchImpl: typeof fetch): Promise<JiraSyncResult> {
  try {
    const { cfg, token } = loadConfigAndToken(db);
    const issues = await fetchAllIssues(fetchImpl, cfg, token);
    let created = 0;
    let updated = 0;
    const keys = new Set<string>();
    for (const issue of issues) {
      const m = mapJiraIssue(issue, cfg);
      if (!m) continue;
      keys.add(m.externalId);
      const outcome = upsertJiraTask(db, m);
      if (outcome === "created") created++;
      else if (outcome === "updated") updated++;
    }
    const markedMissing = markMissingTasks(db, keys);
    saveSyncStatus(db, {
      lastSyncAt: nowStr(),
      lastResult: "ok",
      lastError: null,
      lastCount: issues.length,
    });
    return { created, updated, markedMissing, totalIssues: issues.length };
  } catch (e) {
    const msg = sanitizeJiraError(db, e);
    saveSyncStatus(db, {
      lastSyncAt: nowStr(),
      lastResult: "error",
      lastError: msg,
      lastCount: null,
    });
    throw new Error(msg);
  }
}

/** 测试连接（可用设置页当前输入值测试，token 留空时用已保存的） */
export async function testJiraConnection(
  db: Database,
  fetchImpl: typeof fetch,
  input?: Partial<JiraConfigInput> | null
): Promise<JiraTestResult> {
  try {
    let cfg: JiraConfig;
    let token: string;
    if (input && String(input.baseUrl ?? "").trim()) {
      cfg = normalizeJiraConfig(input);
      token = String(input.token ?? "").trim() || (getSetting(db, TOKEN_KEY) ?? "").trim();
    } else {
      const loaded = loadConfigAndToken(db);
      cfg = loaded.cfg;
      token = loaded.token;
    }
    const ver = apiVersionOf(cfg);
    const data = (await jiraFetchJson(fetchImpl, `${cfg.baseUrl}/rest/api/${ver}/myself`, authHeaders(cfg, token))) as {
      displayName?: string;
      name?: string;
    };
    return { ok: true, message: `连接成功：${data.displayName || data.name || "当前用户"}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
