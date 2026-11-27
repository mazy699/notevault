import type {
  Task,
  TaskPriority,
  TaskStatus,
  WorkEntry,
  Project,
} from "../types";
import { q, scalar, type Database } from "./db";

export const TASK_PRIORITIES: TaskPriority[] = ["high", "medium", "low"];
export const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "on_hold", "done", "cancelled"];

/** 周视图/日视图分组排序：排期开发在前，打断类在后 */
export const TYPE_ORDER: Record<string, number> = {
  planned_dev: 0,
  prod_issue: 1,
  daily_ops: 2,
  urgent_insert: 3,
};

export function taskTypeOrder(type: string): number {
  return TYPE_ORDER[type] ?? 100;
}

export interface TaskRow {
  id: number;
  title: string;
  description: string;
  type: string;
  priority: string;
  status: string;
  estimate_days: number | null;
  window_start: string | null;
  window_end: string | null;
  project_id: number | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  external_source: string | null;
  external_id: string | null;
  external_url: string | null;
  external_parent_key: string | null;
  external_parent_summary: string | null;
  external_updated: string | null;
  external_missing: number | null;
}

export interface ProjectRow {
  id: number;
  name: string;
  sort: number;
  created_at: string;
}

export interface EntryRow {
  id: number;
  task_id: number | null;
  entry_date: string;
  content: string;
  effort_hours: number | null;
  created_at: string;
  updated_at: string;
}

export function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    type: r.type,
    priority: r.priority as TaskPriority,
    status: r.status as TaskStatus,
    estimateDays: r.estimate_days,
    windowStart: r.window_start,
    windowEnd: r.window_end,
    projectId: r.project_id ?? 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    completedAt: r.completed_at,
    externalSource: r.external_source,
    externalId: r.external_id,
    externalUrl: r.external_url,
    externalParentKey: r.external_parent_key,
    externalParentSummary: r.external_parent_summary,
    externalUpdated: r.external_updated,
    externalMissing: Number(r.external_missing ?? 0) === 1,
  };
}

export function rowToProject(r: ProjectRow): Project {
  return {
    id: r.id,
    name: r.name,
    sort: r.sort,
    createdAt: r.created_at,
  };
}

export function rowToEntry(r: EntryRow): WorkEntry {
  return {
    id: r.id,
    taskId: r.task_id,
    entryDate: r.entry_date,
    content: r.content,
    effortHours: r.effort_hours,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** 任务维度自动统计口径：实际占用天数 = 有条目的天数；累计投入 = effort_hours 合计 */
export const STATS_SELECT = `
  (SELECT COUNT(DISTINCT w.entry_date) FROM work_entry w WHERE w.task_id = t.id) AS occupied_days,
  (SELECT SUM(w.effort_hours)      FROM work_entry w WHERE w.task_id = t.id) AS total_hours,
  (SELECT MAX(w.entry_date)        FROM work_entry w WHERE w.task_id = t.id) AS last_activity
`;

export function taskStats(
  db: Database,
  taskId: number
): { occupiedDays: number; totalHours: number | null; lastActivity: string | null } {
  const r = q<{
    occupied_days: number;
    total_hours: number | null;
    last_activity: string | null;
  }>(
    db,
    `SELECT
      (SELECT COUNT(DISTINCT w.entry_date) FROM work_entry w WHERE w.task_id = ?) AS occupied_days,
      (SELECT SUM(w.effort_hours)      FROM work_entry w WHERE w.task_id = ?) AS total_hours,
      (SELECT MAX(w.entry_date)        FROM work_entry w WHERE w.task_id = ?) AS last_activity`,
    [taskId, taskId, taskId]
  );
  return {
    occupiedDays: Number(r[0]?.occupied_days ?? 0),
    totalHours: r[0]?.total_hours ?? null,
    lastActivity: r[0]?.last_activity ?? null,
  };
}

export function getTask(db: Database, id: number): Task | null {
  const rows = q<TaskRow>(db, "SELECT * FROM task WHERE id = ?", [id]);
  return rows.length ? rowToTask(rows[0]) : null;
}

export function getEntry(db: Database, id: number): WorkEntry {
  const rows = q<EntryRow>(db, "SELECT * FROM work_entry WHERE id = ?", [id]);
  if (!rows.length) throw new Error(`工作条目不存在: ${id}`);
  return rowToEntry(rows[0]);
}

export function nextId(db: Database): number {
  return Number(scalar(db, "SELECT seq FROM sqlite_sequence WHERE name='work_entry'") ?? 0) + 1;
}
