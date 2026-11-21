import { run, type Database } from "./db";
import { getSetting, setSetting } from "./settings";

export const DEMO_TASK_IDS_KEY = "demo_task_ids";
export const DEMO_ENTRY_IDS_KEY = "demo_entry_ids";
export const DEMO_PROJECT_IDS_KEY = "demo_project_ids";
export const DEMO_REPORT_IDS_KEY = "demo_report_ids";
export const DEMO_NOTE_IDS_KEY = "demo_note_ids";
export const DEMO_PLAN_DATES_KEY = "demo_plan_dates";

const LEGACY_CLEANUP_KEY = "demo_legacy_cleanup_v2";
const LEGACY_DEMO_CONTENT_PREFIXES = [
  "完成拆单规则梳理与方案设计",
  "核心规则引擎编码",
  "被线上问题打断",
  "拆单主流程编码联调",
  "联调修正边界场景",
  "回归测试与文档补全",
  "预发验证通过",
  "梳理现有指标口径",
  "定位到第三方网关抖动",
  "观察一天无复发",
  "修复样式并提测",
  "上线验证通过",
  "收集慢日志",
  "分析执行计划",
  "在影子库验证新索引效果",
  "参加架构评审会，评审订单服务拆分方案",
  "帮同事排查测试环境数据库连接问题",
];
const LEGACY_PLAN_TEXT =
  "1. 继续库存慢查询验证，视结果上索引\n2. 推进指标口径改造\n3. 跟进订单拆单重构发布";

export interface DemoSets {
  taskIds: number[];
  entryIds: number[];
  projectIds: number[];
  reportIds: number[];
  noteIds: number[];
  planDates: string[];
}

function numberIds(db: Database, key: string): number[] {
  try {
    const parsed: unknown = JSON.parse(getSetting(db, key) ?? "[]");
    return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
  } catch {
    return [];
  }
}

function stringIds(db: Database, key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(getSetting(db, key) ?? "[]");
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function readDemoSets(db: Database): DemoSets {
  return {
    taskIds: numberIds(db, DEMO_TASK_IDS_KEY),
    entryIds: numberIds(db, DEMO_ENTRY_IDS_KEY),
    projectIds: numberIds(db, DEMO_PROJECT_IDS_KEY),
    reportIds: numberIds(db, DEMO_REPORT_IDS_KEY),
    noteIds: numberIds(db, DEMO_NOTE_IDS_KEY),
    planDates: stringIds(db, DEMO_PLAN_DATES_KEY),
  };
}

export function writeDemoSets(
  db: Database,
  sets: Pick<DemoSets, "taskIds" | "entryIds" | "projectIds" | "reportIds" | "noteIds" | "planDates">
): void {
  setSetting(db, DEMO_TASK_IDS_KEY, JSON.stringify(sets.taskIds));
  setSetting(db, DEMO_ENTRY_IDS_KEY, JSON.stringify(sets.entryIds));
  setSetting(db, DEMO_PROJECT_IDS_KEY, JSON.stringify(sets.projectIds));
  setSetting(db, DEMO_REPORT_IDS_KEY, JSON.stringify(sets.reportIds));
  setSetting(db, DEMO_NOTE_IDS_KEY, JSON.stringify(sets.noteIds));
  setSetting(db, DEMO_PLAN_DATES_KEY, JSON.stringify(sets.planDates));
}

/**
 * 旧版本没有记录独立演示记录和演示计划日期，清除演示数据后会留下孤儿记录。
 * 这里只做一次精确内容清理，避免这些示例内容继续进入日详情和 AI 周报。
 */
export function cleanupLegacyDemoData(db: Database): void {
  if (getSetting(db, LEGACY_CLEANUP_KEY) === "1") return;

  const contentFilter = LEGACY_DEMO_CONTENT_PREFIXES.map(() => "content LIKE ?").join(" OR ");
  run(
    db,
    `DELETE FROM work_entry WHERE ${contentFilter}`,
    LEGACY_DEMO_CONTENT_PREFIXES.map((prefix) => `${prefix}%`)
  );

  run(db, "DELETE FROM daily_note WHERE plan_text = ?", [LEGACY_PLAN_TEXT]);
  run(
    db,
    `UPDATE work_entry
     SET task_id = NULL
     WHERE task_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM task WHERE task.id = work_entry.task_id)`
  );
  setSetting(db, LEGACY_CLEANUP_KEY, "1");
}
