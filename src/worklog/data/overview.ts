import { q, type Database } from "./db";
import { addDaysStr, monthAdd, monthFirst, todayStr, weekMonday } from "./dates";
import { dayMeta } from "./workday";
import { getTask, taskStats, taskTypeOrder } from "./models";
import type { Chip, DayMeta, MonthOverview, TaskRow, WeekMatrix } from "../types";

/**
 * 周视图行收录规则（需求文档 §5.1）：
 * 1. 本周有工作条目的任务（必收）
 * 2. 状态为 待开始/进行中/搁置 且期望时间窗与本周有交集
 * 3. 进行中且最近 21 天内有条目（避免周视图遗漏正在推进、但本周尚未动工的任务）
 * 4. 进行中且本周内新建、尚无条目
 * 5. 外部任务（Jira 同步）进行中且时间窗在本周前 14 天内过期（逾期未完，需在周视图继续可见）
 */
export function weekMatrix(db: Database, dateStr: string): WeekMatrix {
  const monday = weekMonday(dateStr);
  const days: DayMeta[] = [];
  for (let i = 0; i < 7; i++) days.push(dayMeta(db, addDaysStr(monday, i)));
  const dates = days.map((d) => d.date);
  const min = dates[0];
  const max = dates[6];
  const today = todayStr();
  const cutoff = addDaysStr(today, -21);
  const overdueCutoff = addDaysStr(today, -14);

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
        OR (t.external_source IS NOT NULL AND t.external_missing = 0
            AND t.status IN ('todo','in_progress')
            AND t.window_end IS NOT NULL
            AND t.window_end < ? AND t.window_end >= ?)
     ORDER BY t.id`,
    [...dates, max, min, cutoff, `${cutoff} 00:00:00`, min, overdueCutoff]
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

  return { weekStart: monday, days, rows };
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

  // 外部任务（Jira 同步）"纯计划"条：按 duedate 落到当天，尚无当天条目也可见（虚线计划样式）
  const planRows = q<{
    id: number;
    title: string;
    type: string;
    status: string;
    window_end: string;
    external_missing: number | null;
  }>(
    db,
    `SELECT id, title, type, status, window_end, external_missing FROM task
     WHERE external_source IS NOT NULL AND window_end IS NOT NULL
       AND window_end >= ? AND window_end < ?
       AND status IN ('todo','in_progress','on_hold')
       AND NOT EXISTS (SELECT 1 FROM work_entry w WHERE w.task_id = task.id AND w.entry_date = task.window_end)`,
    [first, nextMonth]
  );
  for (const r of planRows) {
    const list = chipsByDate.get(r.window_end) ?? [];
    list.push({
      taskId: Number(r.id),
      title: r.title,
      type: r.type as Chip["type"],
      status: r.status as Chip["status"],
      planned: true,
      overdue: r.window_end < today && Number(r.external_missing ?? 0) === 0,
    });
    chipsByDate.set(r.window_end, list);
  }

  const monthDays = days
    .filter((d) => d.date >= first && d.date < nextMonth)
    .map((d) => ({ date: d.date, chips: chipsByDate.get(d.date) ?? [] }));

  return { gridStart, days, monthDays, workdays, workdaysElapsed };
}
