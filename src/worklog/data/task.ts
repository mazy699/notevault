import { inTxn, lastId, q, run, type Database } from "./db";
import { isDateStr, nowStr, todayStr } from "./dates";
import {
  rowToTask,
  rowToEntry,
  taskStats,
  getTask,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type EntryRow,
  type TaskRow,
} from "./models";
import { assertTaskType } from "./task-types";
import { projectExists } from "./project";
import {
  DEFAULT_PROJECT_ID,
  type CreateTaskInput,
  type Task,
  type TaskDetailData,
  type TaskListFilter,
  type TaskWithStats,
  type WorkEntry,
} from "../types";

function assertEnum(value: string, allowed: string[], label: string): void {
  if (!allowed.includes(value)) throw new Error(`非法${label}: ${value}`);
}

function assertDate(value: string | null | undefined, label: string): void {
  if (value == null) return;
  if (!isDateStr(value)) throw new Error(`无效${label}: ${value}`);
}

function assertProject(db: Database, projectId: number | null | undefined): number {
  const pid = projectId ?? DEFAULT_PROJECT_ID;
  if (!projectExists(db, pid)) throw new Error(`项目不存在: ${pid}`);
  return pid;
}

export function createTask(db: Database, input: CreateTaskInput): Task {
  const title = (input.title ?? "").trim();
  if (!title) throw new Error("标题不能为空");
  assertTaskType(db, input.type);
  assertEnum(input.priority, TASK_PRIORITIES, "优先级");
  assertDate(input.windowStart, "时间窗开始");
  assertDate(input.windowEnd, "时间窗结束");
  if (input.estimateDays != null && !(input.estimateDays > 0 && input.estimateDays <= 100)) {
    throw new Error("预估工作量应为 0~100 之间的工作日数");
  }
  if (
    input.todayEntryHours != null &&
    !(Number(input.todayEntryHours) > 0 && Number(input.todayEntryHours) <= 24)
  ) {
    throw new Error("今日投入应为 0~24 之间的小时数");
  }
  const now = nowStr();
  const projectId = assertProject(db, input.projectId);
  let newId = 0;
  inTxn(db, () => {
    run(
      db,
      `INSERT INTO task (title, description, type, priority, status, estimate_days, window_start, window_end, project_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?)`,
      [
        title,
        input.description ?? "",
        input.type,
        input.priority,
        input.estimateDays ?? null,
        input.windowStart ?? null,
        input.windowEnd ?? null,
        projectId,
        now,
        now,
      ]
    );
    newId = lastId(db);
    if (input.todayEntryContent && input.todayEntryContent.trim()) {
      insertEntryRaw(
        db,
        newId,
        todayStr(),
        input.todayEntryContent,
        input.todayEntryHours ?? null,
        now
      );
      run(db, "UPDATE task SET status = 'in_progress', updated_at = ? WHERE id = ?", [now, newId]);
    }
  });
  const created = getTask(db, newId);
  if (!created) throw new Error("任务创建失败");
  return created;
}

export function updateTask(db: Database, task: Task): Task {
  const existing = getTask(db, task.id);
  if (!existing) throw new Error(`任务不存在: ${task.id}`);
  const title = (task.title ?? "").trim();
  if (!title) throw new Error("标题不能为空");
  assertTaskType(db, task.type);
  assertEnum(task.priority, TASK_PRIORITIES, "优先级");
  assertEnum(task.status, TASK_STATUSES, "任务状态");
  assertDate(task.windowStart, "时间窗开始");
  assertDate(task.windowEnd, "时间窗结束");
  if (task.estimateDays != null && !(task.estimateDays > 0 && task.estimateDays <= 100)) {
    throw new Error("预估工作量应为 0~100 之间的工作日数");
  }
  const now = nowStr();
  const projectId = assertProject(db, task.projectId);
  const completedAt =
    task.status === "done" ? existing.completedAt ?? now : null;
  run(
    db,
    `UPDATE task SET title=?, description=?, type=?, priority=?, status=?, estimate_days=?, window_start=?, window_end=?, project_id=?, updated_at=?, completed_at=?
     WHERE id=?`,
    [
      title,
      task.description ?? "",
      task.type,
      task.priority,
      task.status,
      task.estimateDays ?? null,
      task.windowStart ?? null,
      task.windowEnd ?? null,
      projectId,
      now,
      completedAt,
      task.id,
    ]
  );
  return getTask(db, task.id)!;
}

export function setTaskStatus(db: Database, taskId: number, status: string): Task {
  assertEnum(status, TASK_STATUSES, "任务状态");
  const existing = getTask(db, taskId);
  if (!existing) throw new Error(`任务不存在: ${taskId}`);
  const now = nowStr();
  const completedAt = status === "done" ? existing.completedAt ?? now : null;
  run(db, "UPDATE task SET status = ?, updated_at = ?, completed_at = ? WHERE id = ?", [
    status,
    now,
    completedAt,
    taskId,
  ]);
  return getTask(db, taskId)!;
}

/** 软删除：置为 cancelled 归档（默认）；hard=true 物理删除并级联删除条目 */
export function deleteTask(db: Database, taskId: number, hard: boolean): void {
  if (!getTask(db, taskId)) throw new Error(`任务不存在: ${taskId}`);
  if (hard) {
    inTxn(db, () => {
      run(db, "DELETE FROM work_entry WHERE task_id = ?", [taskId]);
      run(db, "DELETE FROM task WHERE id = ?", [taskId]);
    });
  } else {
    run(db, "UPDATE task SET status = 'cancelled', updated_at = ? WHERE id = ?", [nowStr(), taskId]);
  }
}

export function listTasks(db: Database, filter: TaskListFilter = {}): TaskWithStats[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status) {
    where.push("t.status = ?");
    params.push(filter.status);
  }
  if (filter.type) {
    where.push("t.type = ?");
    params.push(filter.type);
  }
  if (filter.projectId != null) {
    where.push("t.project_id = ?");
    params.push(filter.projectId);
  }
  if (filter.search && filter.search.trim()) {
    where.push("(t.title LIKE ? OR t.description LIKE ?)");
    const kw = `%${filter.search.trim()}%`;
    params.push(kw, kw);
  }
  const rows = q<TaskRow & { occupied_days: number; total_hours: number | null; last_activity: string | null }>(
    db,
    `SELECT t.*, 
      (SELECT COUNT(DISTINCT w.entry_date) FROM work_entry w WHERE w.task_id = t.id) AS occupied_days,
      (SELECT SUM(w.effort_hours)      FROM work_entry w WHERE w.task_id = t.id) AS total_hours,
      (SELECT MAX(w.entry_date)        FROM work_entry w WHERE w.task_id = t.id) AS last_activity
     FROM task t
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY CASE t.status
        WHEN 'in_progress' THEN 0 WHEN 'todo' THEN 1 WHEN 'on_hold' THEN 2 WHEN 'done' THEN 3 ELSE 4 END,
      COALESCE(last_activity, '') DESC, t.id DESC`,
    params
  );
  return rows.map((r) => ({
    ...rowToTask(r),
    occupiedDays: Number(r.occupied_days ?? 0),
    totalHours: r.total_hours,
    lastActivity: r.last_activity,
  }));
}

export function getTaskDetail(db: Database, taskId: number): TaskDetailData {
  const task = getTask(db, taskId);
  if (!task) throw new Error(`任务不存在: ${taskId}`);
  const stats = taskStats(db, taskId);
  const rows = q<EntryRow>(
    db,
    "SELECT * FROM work_entry WHERE task_id = ? ORDER BY entry_date DESC, created_at ASC, id ASC",
    [taskId]
  );
  const byDate = new Map<string, WorkEntry[]>();
  for (const r of rows) {
    const entry = rowToEntry(r);
    const list = byDate.get(entry.entryDate) ?? [];
    list.push(entry);
    byDate.set(entry.entryDate, list);
  }
  const days = [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, entries]) => ({ date, entries }));
  return { task, stats, days };
}

/** 业务规则：任务产生首条工作条目时，自动从"待开始"流转为"进行中" */
export function autoTransitionOnEntry(db: Database, taskId: number, now: string): void {
  const task = getTask(db, taskId);
  if (!task) throw new Error(`任务不存在: ${taskId}`);
  if (task.status === "todo") {
    run(db, "UPDATE task SET status = 'in_progress', updated_at = ? WHERE id = ?", [now, taskId]);
  }
}

export function insertEntryRaw(
  db: Database,
  taskId: number | null,
  entryDate: string,
  content: string,
  effortHours: number | null,
  now: string
): number {
  run(
    db,
    `INSERT INTO work_entry (task_id, entry_date, content, effort_hours, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [taskId, entryDate, content, effortHours, now, now]
  );
  return lastId(db);
}
