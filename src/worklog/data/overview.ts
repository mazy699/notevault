import { q, type Database } from "./db";
import { addDaysStr, monthAdd, monthFirst, todayStr, weekMonday } from "./dates";
import { dayMeta } from "./workday";
import { getTask, rowToTask, taskStats, taskTypeOrder, type TaskRow as DbTaskRow } from "./models";
import type { Chip, DayMeta, MonthOverview, TaskRow, WeekMatrix } from "../types";

/**
 * 周视图行收录规则（需求文档 §5.1）：
 * 1. 本周有工作条目的任务（必收）
 * 2. 状态为 待开始/进行中/搁置 且期望时间窗与本周有交集
 * 3. 进行中且最近 21 天内有条目（避免周视图遗漏正在推进、但本周尚未动工的任务）
 */
export function weekMatrix(db: Database, dateStr: string): WeekMatrix {
  const monday = weekMonday(dateStr);
  const days: DayMeta[] = [];
  for (let i = 0; i < 7; i++) days.push(dayMeta(db, addDaysStr(monday, i)));
  const dates = days.map((d) => d.date);
  const min = dates[0];
  const max = dates[6];
  const cutoff = addDaysStr(todayStr(), -21);

  const placeholders = dates.map(() => "?").join(",");
  const ids = q<{ id: number }>(
    db,
    `SELECT DISTINCT t.id FROM task t
     LEFT JOIN work_entry e ON e.task_id = t.id AND e.entry_date IN (${placeholders})
     WHERE e.id IS NOT NULL
        OR (t.status IN ('todo','in_progress','on_hold')
            AND t.window_start IS NOT NULL AND t.window_end IS NOT NULL
            AND t.window_start <= ? AND t.window_end >= ?)
        OR (t.status = 'in_progress'
            AND EXISTS (SELECT 1 FROM work_entry w WHERE w.task_id = t.id AND w.entry_date >= ?))
        OR (t.status = 'in_progress' AND t.created_at >= ?
            AND NOT EXISTS (SELECT 1 FROM work_entry w WHERE w.task_id = t.id))
     ORDER BY t.id`,
    [...dates, max, min, cutoff, `${cutoff} 00:00:00`]
  ).map((r) => Number(r.id));

  const rows: TaskRow[] = [];
  for (const id of ids) {
    const task = getTask(db, id);
    if (!task) continue;
    const stats = taskStats(db, id);
    const cells = dates.map((d) => ({ date: d, entries: entrySummaries(db, id, d) }));
    const active = task.status !== "done" && task.status !== "cancelled";
    const window =
      active && task.windowStart && task.windowEnd
        ? { start: task.windowStart, end: task.windowEnd }
        : null;
    rows.push({
      task,
      occupiedDays: stats.occupiedDays,
      totalHours: stats.totalHours,
      lastActivity: stats.lastActivity,
      cells,
      window,
    });
  }

  rows.sort(
    (a, b) =>
      taskTypeOrder(a.task.type) - taskTypeOrder(b.task.type) ||
      (b.lastActivity ?? "").localeCompare(a.lastActivity ?? "") ||
      b.task.id - a.task.id
  );

  // 外部来源、尚未排期（无时间窗）的待办：单独成区，不挤进甘特矩阵
  const rowIds = new Set(ids);
  const externalUnscheduled = q<DbTaskRow>(
    db,
    `SELECT * FROM task
     WHERE external_source IS NOT NULL
       AND external_missing = 0
       AND status IN ('todo','in_progress','on_hold')
       AND (window_start IS NULL OR window_end IS NULL)
     ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, id DESC`
  )
    .map(rowToTask)
    .filter((task) => !rowIds.has(task.id));

  return { weekStart: monday, days, rows, externalUnscheduled };
}

function entrySummaries(db: Database, taskId: number, date: string) {
  return q<{ id: number; content: string; effort_hours: number | null }>(
    db,
    "SELECT id, content, effort_hours FROM work_entry WHERE task_id = ? AND entry_date = ? ORDER BY created_at, id",
    [taskId, date]
  ).map((r) => ({
    id: Number(r.id),
    snippet: r.content.replace(/\s+/g, " ").slice(0, 80),
    effortHours: r.effort_hours,
  }));
}

export function monthOverview(db: Database, monthAnyDay: string): MonthOverview {
  const first = monthFirst(monthAnyDay);
  const gridStart = weekMonday(first);
  const nextMonth = monthAdd(first, 1);

  const days: DayMeta[] = [];
  for (let i = 0; i < 42; i++) days.push(dayMeta(db, addDaysStr(gridStart, i)));

  // 工作日统计：当月工作日数 + 已过工作日数（节假日口径）
  const today = todayStr();
  let workdays = 0;
  let workdaysElapsed = 0;
  for (const d of days) {
    if (d.date >= first && d.date < nextMonth && d.isWorkday) {
      workdays++;
      if (d.date <= today) workdaysElapsed++;
    }
  }

  const rows = q<{ entry_date: string; id: number; title: string; type: string; status: string }>(
    db,
    `SELECT DISTINCT e.entry_date, t.id, t.title, t.type, t.status
     FROM work_entry e JOIN task t ON t.id = e.task_id
     WHERE e.entry_date >= ? AND e.entry_date < ?
     ORDER BY e.entry_date, t.id`,
    [first, nextMonth]
  );

  const chipsByDate = new Map<string, Chip[]>();
  for (const r of rows) {
    const list = chipsByDate.get(r.entry_date) ?? [];
    list.push({
      taskId: Number(r.id),
      title: r.title,
      type: r.type as Chip["type"],
      status: r.status as Chip["status"],
    });
    chipsByDate.set(r.entry_date, list);
  }

  // 外部来源的计划层：按外部截止日期落在当天；当天已有记录的任务不重复显示
  const planRows = q<{
    id: number;
    title: string;
    type: string;
    status: string;
    external_source: string;
    external_id: string | null;
    external_missing: number;
    window_end: string;
  }>(
    db,
    `SELECT id, title, type, status, external_source, external_id, external_missing, window_end
     FROM task
     WHERE external_source IS NOT NULL
       AND external_missing = 0
       AND status IN ('todo','in_progress','on_hold')
       AND window_end IS NOT NULL
       AND window_end >= ? AND window_end < ?
     ORDER BY window_end, CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, id`,
    [first, nextMonth]
  );
  const plansByDate = new Map<string, Chip[]>();
  for (const r of planRows) {
    const date = r.window_end;
    const recorded = chipsByDate.get(date) ?? [];
    if (recorded.some((c) => c.taskId === Number(r.id))) continue;
    const list = plansByDate.get(date) ?? [];
    list.push({
      taskId: Number(r.id),
      title: r.title,
      type: r.type as Chip["type"],
      status: r.status as Chip["status"],
      planned: true,
      externalSource: r.external_source as Chip["externalSource"],
      externalId: r.external_id,
      externalMissing: Number(r.external_missing) === 1,
    });
    plansByDate.set(date, list);
  }

  const monthDays = days
    .filter((d) => d.date >= first && d.date < nextMonth)
    .map((d) => ({
      date: d.date,
      chips: chipsByDate.get(d.date) ?? [],
      plans: plansByDate.get(d.date) ?? [],
    }));

  return { gridStart, days, monthDays, workdays, workdaysElapsed };
}
