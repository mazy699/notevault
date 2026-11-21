import { q, scalar, run, type Database } from "./db";
import { isDateStr, nowStr } from "./dates";
import { rowToEntry, rowToTask, taskTypeOrder, type EntryRow, type TaskRow } from "./models";
import type { DayLog, EntryGroup, WorkEntry } from "../types";

export function getDayLog(db: Database, date: string): DayLog {
  if (!isDateStr(date)) throw new Error(`无效日期: ${date}`);
  const entries = q<EntryRow>(
    db,
    "SELECT * FROM work_entry WHERE entry_date = ? ORDER BY created_at, id",
    [date]
  ).map(rowToEntry);
  const plan = String(scalar(db, "SELECT plan_text FROM daily_note WHERE date = ?", [date]) ?? "");

  const byTask = new Map<number, WorkEntry[]>();
  const independent: WorkEntry[] = [];
  for (const e of entries) {
    if (e.taskId === null) independent.push(e);
    else {
      const list = byTask.get(e.taskId) ?? [];
      list.push(e);
      byTask.set(e.taskId, list);
    }
  }

  const taskIds = [...byTask.keys()];
  const tasks = taskIds.length
    ? q<TaskRow>(db, `SELECT * FROM task WHERE id IN (${taskIds.map(() => "?").join(",")})`, taskIds).map(rowToTask)
    : [];
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  const taskGroups: EntryGroup[] = [];
  for (const id of taskIds) {
    const task = taskById.get(id);
    const entries = byTask.get(id)!;
    if (task) taskGroups.push({ task, entries });
    else independent.push(...entries);
  }
  taskGroups.sort(
    (a, b) =>
      taskTypeOrder(a.task!.type) - taskTypeOrder(b.task!.type) ||
      (a.task!.id - b.task!.id)
  );

  const groups: EntryGroup[] = [...taskGroups];
  if (independent.length) groups.push({ task: null, entries: independent });

  return { date, plan, groups };
}

export function upsertNote(db: Database, date: string, planText: string): void {
  if (!isDateStr(date)) throw new Error(`无效日期: ${date}`);
  const now = nowStr();
  run(
    db,
    `INSERT INTO daily_note (date, plan_text, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET plan_text = excluded.plan_text, updated_at = excluded.updated_at`,
    [date, planText, now, now]
  );
}

export function getNote(db: Database, date: string): string {
  return String(scalar(db, "SELECT plan_text FROM daily_note WHERE date = ?", [date]) ?? "");
}
