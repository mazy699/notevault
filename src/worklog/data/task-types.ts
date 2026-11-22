import { run, scalar, type Database } from "./db";
import { getSetting, setSetting } from "./settings";
import type { TaskTypeDefinition } from "../types";

const CUSTOM_TASK_TYPES_KEY = "custom_task_types";

export const BUILTIN_TASK_TYPES: TaskTypeDefinition[] = [
  { id: "planned_dev", label: "排期开发", color: "#3b82f6", order: 0, builtin: true },
  { id: "prod_issue", label: "线上/排查", color: "#f59e0b", order: 1, builtin: true },
  { id: "daily_ops", label: "日常运维", color: "#14b8a6", order: 2, builtin: true },
  { id: "urgent_insert", label: "紧急插入", color: "#ef4444", order: 3, builtin: true },
];

const FALLBACK_COLOR = "#64748b";

function customTaskTypes(db: Database): TaskTypeDefinition[] {
  try {
    const parsed: unknown = JSON.parse(getSetting(db, CUSTOM_TASK_TYPES_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .map((item, index) => ({
        id: String(item.id ?? ""),
        label: String(item.label ?? "").trim(),
        color: normalizeColor(String(item.color ?? FALLBACK_COLOR)),
        order: Number.isFinite(Number(item.order)) ? Number(item.order) : 100 + index,
        builtin: false,
      }))
      .filter((item) => item.id.startsWith("custom_") && item.label);
  } catch {
    return [];
  }
}

function normalizeColor(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : FALLBACK_COLOR;
}

export function listTaskTypes(db: Database): TaskTypeDefinition[] {
  return [...BUILTIN_TASK_TYPES, ...customTaskTypes(db)].sort(
    (a, b) => a.order - b.order || a.label.localeCompare(b.label, "zh-CN")
  );
}

export function getTaskType(db: Database, id: string): TaskTypeDefinition | null {
  return listTaskTypes(db).find((item) => item.id === id) ?? null;
}

export function assertTaskType(db: Database, id: string): void {
  if (!getTaskType(db, id)) throw new Error(`非法任务类型: ${id}`);
}

export function createTaskType(db: Database, label: string, color: string): TaskTypeDefinition {
  const name = label.trim();
  if (!name) throw new Error("任务类型名称不能为空");
  if (name.length > 20) throw new Error("任务类型名称不能超过 20 个字符");
  const existing = listTaskTypes(db);
  if (existing.some((item) => item.label.toLowerCase() === name.toLowerCase())) {
    throw new Error("任务类型名称已存在");
  }

  const custom = customTaskTypes(db);
  const item: TaskTypeDefinition = {
    id: `custom_${Date.now().toString(36)}_${custom.length + 1}`,
    label: name,
    color: normalizeColor(color),
    order: Math.max(...existing.map((entry) => entry.order), 99) + 1,
    builtin: false,
  };
  setSetting(db, CUSTOM_TASK_TYPES_KEY, JSON.stringify([...custom, item]));
  return item;
}

export function updateTaskType(db: Database, id: string, label: string, color: string): TaskTypeDefinition {
  const current = customTaskTypes(db).find((item) => item.id === id);
  if (!current) throw new Error("只能编辑自定义任务类型");
  const name = label.trim();
  if (!name) throw new Error("任务类型名称不能为空");
  if (name.length > 20) throw new Error("任务类型名称不能超过 20 个字符");
  if (
    listTaskTypes(db).some(
      (item) => item.id !== id && item.label.toLowerCase() === name.toLowerCase()
    )
  ) {
    throw new Error("任务类型名称已存在");
  }
  const updated: TaskTypeDefinition = { ...current, label: name, color: normalizeColor(color) };
  setSetting(
    db,
    CUSTOM_TASK_TYPES_KEY,
    JSON.stringify(customTaskTypes(db).map((item) => (item.id === id ? updated : item)))
  );
  return updated;
}

export function deleteTaskType(db: Database, id: string): void {
  const current = customTaskTypes(db).find((item) => item.id === id);
  if (!current) throw new Error("只能删除自定义任务类型");
  const used = Number(scalar(db, "SELECT COUNT(*) FROM task WHERE type = ?", [id]) ?? 0);
  if (used > 0) throw new Error(`该类型仍被 ${used} 个任务使用，不能删除`);
  setSetting(
    db,
    CUSTOM_TASK_TYPES_KEY,
    JSON.stringify(customTaskTypes(db).filter((item) => item.id !== id))
  );
  if (getSetting(db, "quick_default_type") === id) {
    setSetting(db, "quick_default_type", "urgent_insert");
  }
}

/** 兼容旧版本：调查排查统一合并到线上/排查。 */
export function normalizeLegacyTaskTypes(db: Database): void {
  run(db, "UPDATE task SET type = 'prod_issue' WHERE type = 'investigation'");
  if (getSetting(db, "quick_default_type") === "investigation") {
    setSetting(db, "quick_default_type", "prod_issue");
  }
}
