import type { TaskPriority, TaskStatus, TaskType, TaskTypeDefinition } from "../types";

export const DEFAULT_TASK_TYPES: TaskTypeDefinition[] = [
  { id: "planned_dev", label: "排期开发", color: "#3b82f6", order: 0, builtin: true },
  { id: "prod_issue", label: "线上/排查", color: "#f59e0b", order: 1, builtin: true },
  { id: "daily_ops", label: "日常运维", color: "#14b8a6", order: 2, builtin: true },
  { id: "urgent_insert", label: "紧急插入", color: "#ef4444", order: 3, builtin: true },
];

export const TYPE_COLORS: Record<string, string> = {
  planned_dev: "#3b82f6",
  urgent_insert: "#ef4444",
  prod_issue: "#f59e0b",
  daily_ops: "#14b8a6",
};

export const TYPE_LABELS: Record<string, string> = {
  planned_dev: "排期开发",
  urgent_insert: "紧急插入",
  prod_issue: "线上/排查",
  daily_ops: "日常运维",
};

export const TYPE_ORDER: string[] = ["planned_dev", "prod_issue", "daily_ops", "urgent_insert"];

export function taskTypeLabel(types: TaskTypeDefinition[], type: TaskType): string {
  return types.find((item) => item.id === type)?.label ?? TYPE_LABELS[type] ?? type;
}

export function taskTypeColor(types: TaskTypeDefinition[], type: TaskType): string {
  return types.find((item) => item.id === type)?.color ?? TYPE_COLORS[type] ?? "#64748b";
}

export function taskTypeOptions(types: TaskTypeDefinition[]): { value: string; label: string }[] {
  return types.map((item) => ({ value: item.id, label: item.label }));
}

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "待开始",
  in_progress: "进行中",
  on_hold: "搁置",
  done: "已完成",
  cancelled: "已取消",
};

export const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: "#94a3b8",
  in_progress: "#2563eb",
  on_hold: "#d97706",
  done: "#16a34a",
  cancelled: "#9ca3af",
};

export function rgba(hex: string, alpha: number): string {
  const v = hex.replace("#", "");
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 自绘 Select 组件的选项集 */
export const TYPE_OPTIONS = taskTypeOptions(DEFAULT_TASK_TYPES);
export const PRIORITY_OPTIONS = (Object.keys(PRIORITY_LABELS) as TaskPriority[]).map((p) => ({
  value: p,
  label: PRIORITY_LABELS[p],
}));
export const STATUS_OPTIONS = (Object.keys(STATUS_LABELS) as TaskStatus[]).map((s) => ({
  value: s,
  label: STATUS_LABELS[s],
}));
