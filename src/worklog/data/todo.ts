import { lastId, q, run, type Database } from "./db";
import { nowStr } from "./dates";
import type { Todo, TodoStatus, TodoUpdateInput } from "../types";

interface TodoRow {
  id: number;
  content: string;
  detail: string;
  status: string;
  linked_task_id: number | null;
  linked_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToTodo(row: TodoRow): Todo {
  return {
    id: Number(row.id),
    content: row.content,
    detail: row.detail ?? "",
    status:
      row.status === "done" || row.status === "converted" ? row.status : "open",
    linkedTaskId: row.linked_task_id == null ? null : Number(row.linked_task_id),
    linkedAt: row.linked_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function cleanContent(content: string): string {
  const value = (content ?? "").trim();
  if (!value) throw new Error("待办内容不能为空");
  if (value.length > 200) throw new Error("待办标题不能超过 200 个字符");
  return value;
}

function cleanDetail(detail: string): string {
  const value = detail ?? "";
  if (value.length > 5000) throw new Error("待办详情不能超过 5000 个字符");
  return value;
}

export function appendTodosToDescription(description: string, todos: Todo[]): string {
  const section = `来自待办箱：\n${todos
    .map((todo) => {
      const detail = todo.detail.trim();
      return detail
        ? `- ${todo.content}\n${detail
            .split("\n")
            .map((line) => `  ${line}`)
            .join("\n")}`
        : `- ${todo.content}`;
    })
    .join("\n")}`;
  const current = description.trim();
  return current ? `${current}\n\n${section}` : section;
}

export function listTodos(db: Database): Todo[] {
  return q<TodoRow>(
    db,
    `SELECT * FROM todo
     ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, updated_at DESC, id DESC`
  ).map(rowToTodo);
}

export function getTodo(db: Database, id: number): Todo | null {
  const rows = q<TodoRow>(db, "SELECT * FROM todo WHERE id = ?", [id]);
  return rows.length ? rowToTodo(rows[0]) : null;
}

export function createTodo(db: Database, content: string): Todo {
  const now = nowStr();
  run(db, "INSERT INTO todo (content, detail, status, created_at, updated_at) VALUES (?, '', 'open', ?, ?)", [
    cleanContent(content),
    now,
    now,
  ]);
  const created = getTodo(db, lastId(db));
  if (!created) throw new Error("待办创建失败");
  return created;
}

export function updateTodo(db: Database, id: number, input: TodoUpdateInput): Todo {
  if (!getTodo(db, id)) throw new Error(`待办不存在: ${id}`);
  run(db, "UPDATE todo SET content = ?, detail = ?, updated_at = ? WHERE id = ?", [
    cleanContent(input.content),
    cleanDetail(input.detail),
    nowStr(),
    id,
  ]);
  return getTodo(db, id)!;
}

export function setTodoStatus(db: Database, id: number, status: TodoStatus): Todo {
  if (status !== "open" && status !== "done") throw new Error(`非法待办状态: ${status}`);
  if (!getTodo(db, id)) throw new Error(`待办不存在: ${id}`);
  run(db, "UPDATE todo SET status = ?, updated_at = ? WHERE id = ?", [status, nowStr(), id]);
  return getTodo(db, id)!;
}

export function toggleTodo(db: Database, id: number): Todo {
  const todo = getTodo(db, id);
  if (!todo) throw new Error(`待办不存在: ${id}`);
  if (todo.status === "converted") throw new Error("已转入任务的待办不能改回待处理");
  return setTodoStatus(db, id, todo.status === "open" ? "done" : "open");
}

export function deleteTodo(db: Database, id: number): void {
  run(db, "DELETE FROM todo WHERE id = ?", [id]);
}

export function deleteTodos(db: Database, ids: number[]): number {
  const unique = [...new Set(ids.map(Number).filter(Number.isFinite))];
  if (!unique.length) return 0;
  const placeholders = unique.map(() => "?").join(",");
  run(db, `DELETE FROM todo WHERE id IN (${placeholders})`, unique);
  return unique.length;
}

export function linkTodosToTask(db: Database, ids: number[], taskId: number): number {
  const unique = [...new Set(ids.map(Number).filter(Number.isFinite))];
  if (!unique.length) return 0;
  const now = nowStr();
  const placeholders = unique.map(() => "?").join(",");
  run(
    db,
    `UPDATE todo
     SET status = 'converted', linked_task_id = ?, linked_at = ?, updated_at = ?
     WHERE id IN (${placeholders})`,
    [taskId, now, now, ...unique]
  );
  return unique.length;
}
