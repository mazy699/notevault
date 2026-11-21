import { q, type Database } from "./db";
import { addDaysStr, weekMonday } from "./dates";
import { weekMatrix } from "./overview";
import { taskStats } from "./models";
import { isWorkday } from "./workday";
import { readDemoSets, type DemoSets } from "./demo";
import { listTaskTypes } from "./task-types";
import type { AiConfig, WeeklyReportStats } from "../types";

/** OpenAI 兼容协议默认提示词模板；ai.json 的 promptTemplate 可覆盖（需含 {{DATA}}） */
export const DEFAULT_WEEKLY_TEMPLATE = `你是一名严谨的研发周报助手。根据下方一名开发者本周（{{START}} ~ {{END}}）的工作记录与统计，输出一份简短周报。

输出使用 Markdown，结构固定为以下四节，不要添加其他章节：
## 本周完成
## 进行中
## 打断与风险
## 下周计划

要求：
- 只依据给出的记录归纳，不要编造内容；
- 每条不超过两行，能引用数字（天数、投入）就引用；
- "打断与风险"里概括线上/紧急事务对排期的影响；
- "下周计划"只基于进行中任务的合理延续，不要发明新任务。

【统计】本周共 {{WORKDAYS}} 个工作日（按法定节假日口径）。
【工作记录】
{{DATA}}`;

export const DEFAULT_WEEKLY_SUMMARY_TEMPLATE = `请根据下面的研发周报明细，润色成一段约 80-120 个中文字符、适合直接复制的周报摘要。

要求：
- 不带任务编号、项目编号、Markdown 标题或列表符号；
- 归并同类事项，突出完成结果、进行中的重点和下周计划；
- 保持事实准确，不添加明细中没有的内容；
- 只输出一段自然、流畅的中文。

【周报明细】
{{DETAIL}}`;

export interface AiFileConfig {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  promptTemplate?: string;
}

/** 合并 setting 与 ai.json：文件中非空字段优先，返回被覆盖的字段名 */
export function resolveAiConfig(
  settings: (key: string) => string | null,
  file: AiFileConfig | null
): AiConfig & { overrides: string[]; promptTemplate?: string } {
  const overrides: string[] = [];
  const SETTING_KEYS = { baseUrl: "ai_base_url", apiKey: "ai_api_key", model: "ai_model" } as const;
  const pick = (field: keyof typeof SETTING_KEYS, fileValue: string | undefined): string => {
    if (fileValue != null && fileValue.trim() !== "") {
      overrides.push(field);
      return fileValue.trim();
    }
    return settings(SETTING_KEYS[field]) ?? "";
  };
  return {
    baseUrl: pick("baseUrl", file?.baseUrl),
    apiKey: pick("apiKey", file?.apiKey),
    model: pick("model", file?.model),
    promptTemplate: file?.promptTemplate?.trim() || undefined,
    overrides,
  };
}

export interface WeeklyData {
  start: string;
  end: string;
  workdays: number;
  dataText: string;
}

interface WeeklyEntryRow {
  entry_date: string;
  content: string;
  effort_hours: number | null;
  task_id: number | null;
  title: string | null;
  type: string | null;
  status: string | null;
  estimate_days: number | null;
  project_name: string | null;
}

const ENTRY_CAP = 200;
const TOTAL_CAP = 14000;

function loadWeeklyRows(
  db: Database,
  start: string,
  end: string,
  demo: DemoSets = readDemoSets(db)
): WeeklyEntryRow[] {
  const where = ["e.entry_date >= ?", "e.entry_date <= ?"];
  const params: unknown[] = [start, end];

  if (demo.entryIds.length) {
    where.push(`e.id NOT IN (${demo.entryIds.map(() => "?").join(",")})`);
    params.push(...demo.entryIds);
  }
  if (demo.taskIds.length) {
    where.push(`(e.task_id IS NULL OR e.task_id NOT IN (${demo.taskIds.map(() => "?").join(",")}))`);
    params.push(...demo.taskIds);
  }

  return q<WeeklyEntryRow>(
    db,
    `SELECT e.entry_date, e.content, e.effort_hours, e.task_id,
            t.title, t.type, t.status, t.estimate_days, p.name AS project_name
     FROM work_entry e
     LEFT JOIN task t ON t.id = e.task_id
     LEFT JOIN project p ON p.id = t.project_id
     WHERE ${where.join(" AND ")}
     ORDER BY e.entry_date, e.id`,
    params
  );
}

/** 汇总一周数据为提示词数据段：按任务分组条目 + 统计 + 独立记录 + 未动的进行中任务 */
export function buildWeeklyReportData(
  db: Database,
  dateStr: string,
  demo: DemoSets = readDemoSets(db)
): WeeklyData {
  const monday = weekMonday(dateStr);
  const start = monday;
  const end = addDaysStr(monday, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDaysStr(monday, i));

  const rows = loadWeeklyRows(db, start, end, demo);
  const typeLabels = new Map(listTaskTypes(db).map((item) => [item.id, item.label]));

  const sections: string[] = [];
  const byTask = new Map<number | -1, typeof rows>();
  for (const r of rows) {
    const key = r.task_id ?? -1;
    const list = byTask.get(key) ?? [];
    list.push(r);
    byTask.set(key, list);
  }

  let interruptionCount = 0;
  for (const [taskId, list] of byTask) {
    const first = list[0];
    const datesOfTask = new Set(list.map((r) => r.entry_date));
    const totalHours = list.reduce((a, b) => a + (b.effort_hours ?? 0), 0);
    if (taskId === -1) {
      const lines = list.map((r) => `- ${r.entry_date.slice(5)}: ${r.content.replace(/\s+/g, " ").slice(0, ENTRY_CAP)}`);
      sections.push(`### 独立记录（不挂任务）\n${lines.join("\n")}`);
      continue;
    }
    if (first.type === "urgent_insert" || first.type === "prod_issue") interruptionCount++;
    const estimate = first.estimate_days != null ? `预估 ${first.estimate_days} 天` : "未预估";
    sections.push(
      `### 任务：${first.title}（项目：${first.project_name ?? "默认项目"}｜类型：${typeLabels.get(first.type ?? "") ?? first.type ?? "未知"}｜状态：${first.status}｜${estimate} / 实际占用 ${datesOfTask.size} 天｜本周投入 ${totalHours}h）\n` +
        list
          .map((r) => `- ${r.entry_date.slice(5)}: ${r.content.replace(/\s+/g, " ").slice(0, ENTRY_CAP)}`)
          .join("\n")
    );
  }

  // 进行中/搁置但本周没有任何记录的任务（周计划延续的上下文）
  const idle = weekMatrix(db, dateStr).rows.filter(
    (r) =>
      !demo.taskIds.includes(r.task.id) &&
      (r.task.status === "in_progress" || r.task.status === "on_hold") &&
      r.cells.every((c) => c.entries.length === 0)
  );
  if (idle.length) {
    sections.push(
      `### 进行中/搁置但本周无记录的任务\n` +
        idle
          .map((r) => {
            const st = taskStats(db, r.task.id);
            return `- ${r.task.title}（状态：${r.task.status}｜累计占用 ${st.occupiedDays} 天｜最近活动 ${st.lastActivity ?? "无"}）`;
          })
          .join("\n")
    );
  }

  let dataText = sections.join("\n\n");
  if (dataText.length > TOTAL_CAP) {
    dataText = dataText.slice(0, TOTAL_CAP) + "\n（更早日志因长度限制已省略）";
  }

  const workdays = days.filter((d) => isWorkday(db, d)).length;

  return { start, end, workdays, dataText };
}

export function buildWeeklyReportStats(
  db: Database,
  dateStr: string,
  demo: DemoSets = readDemoSets(db)
): WeeklyReportStats {
  const monday = weekMonday(dateStr);
  const start = monday;
  const end = addDaysStr(monday, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDaysStr(monday, i));
  const rows = loadWeeklyRows(db, start, end, demo);

  const taskIds = new Set<number>();
  const completedIds = new Set<number>();
  const interruptionIds = new Set<number>();
  const activeDays = new Set<string>();
  let totalHours = 0;
  let independentCount = 0;

  for (const row of rows) {
    activeDays.add(row.entry_date);
    totalHours += row.effort_hours ?? 0;
    if (row.task_id == null) {
      independentCount++;
      continue;
    }
    taskIds.add(row.task_id);
    if (row.status === "done") completedIds.add(row.task_id);
    if (row.type === "urgent_insert" || row.type === "prod_issue") interruptionIds.add(row.task_id);
  }

  return {
    start,
    end,
    workdays: days.filter((d) => isWorkday(db, d)).length,
    activeDays: activeDays.size,
    taskCount: taskIds.size,
    completedCount: completedIds.size,
    interruptionCount: interruptionIds.size,
    entryCount: rows.length,
    independentCount,
    totalHours: Number(totalHours.toFixed(1)),
  };
}

export function buildWeeklyPrompt(
  template: string,
  start: string,
  end: string,
  workdays: number,
  dataText: string
): string {
  return template
    .replaceAll("{{START}}", start)
    .replaceAll("{{END}}", end)
    .replaceAll("{{WORKDAYS}}", String(workdays))
    .replaceAll("{{DATA}}", dataText);
}

export function buildWeeklySummaryPrompt(template: string, detail: string): string {
  return template.replaceAll("{{DETAIL}}", detail);
}

export function mapHttpError(status: number, body: string): string {
  const snippet = body.slice(0, 200);
  if (status === 401 || status === 403) return `鉴权失败（${status}）：请检查 API Key 是否正确。${snippet}`;
  if (status === 404) return `404：接口地址或模型名可能不正确。${snippet}`;
  if (status === 429) return `429：请求被限流或额度不足。${snippet}`;
  return `请求失败（HTTP ${status}）：${snippet}`;
}

type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;

type ChatCfg = Pick<AiConfig, "baseUrl" | "apiKey" | "model">;

/** OpenAI 兼容 chat/completions 调用（非流式）；fetchImpl 可注入用于测试 */
export async function chatCompletion(
  cfg: ChatCfg,
  messages: { role: string; content: string }[],
  options: { timeoutMs?: number; maxTokens?: number; temperature?: number; fetchImpl?: FetchImpl } = {}
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 60000);
  try {
    const res = await fetchImpl(`${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        stream: false,
        temperature: options.temperature ?? 0.3,
        ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
      }),
    });
    const bodyText = await res.text();
    if (!res.ok) throw new Error(mapHttpError(res.status, bodyText));
    let parsed: { choices?: { message?: { content?: string } }[] };
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      throw new Error(`返回的不是合法 JSON：${bodyText.slice(0, 200)}`);
    }
    const content = parsed.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) throw new Error("模型未返回内容，请检查模型名是否正确");
    return content;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("请求超时：服务商响应过慢或地址不可达");
    }
    if (e instanceof TypeError) {
      throw new Error(`网络错误：无法连接 ${cfg.baseUrl}（检查地址/代理/内网可达性）`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** 测试连接用的样例内容（ai_mock=1 时替代真实调用） */
export const MOCK_WEEKLY_REPORT = `## 本周完成
- 订单拆单逻辑重构完成回归测试并通过预发验证（本周投入 16h）
- 线上支付回调超时告警定位为第三方网关抖动，已关闭

## 进行中
- 指标口径统一改造：完成现有口径差异清单（预估 3 天，已占用 1 天）
- 库存流水表慢查询：新索引在影子库验证中

## 打断与风险
- 本周出现 2 次打断类事务（1 次线上问题 + 1 次紧急样式修复），合计占用约 1.5 个工作日
- 订单拆单重构已超出预估 2 天，主要原因为中途插入的线上排查

## 下周计划
- 发布订单拆单重构并观察一周
- 推进指标口径统一改造至联调
- 库存索引视验证结果上线`;

export const MOCK_WEEKLY_SUMMARY =
  "本周完成订单拆单重构的回归测试与预发验证，并处理线上支付回调超时和紧急样式修复；当前指标口径改造、库存索引验证仍在推进。下周将发布订单拆单重构，推进指标口径联调，并根据验证结果安排索引上线。";
