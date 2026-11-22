import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { freshDb } from "./test-util";
import {
  createTodo,
  deleteTodos,
  appendTodosToDescription,
  linkTodosToTask,
  listTodos,
  toggleTodo,
  updateTodo,
} from "./todo";
import { createTask } from "./task";

describe("待办箱", () => {
  let db: Database;
  beforeAll(async () => {
    db = await freshDb();
  });

  it("创建、编辑、完成、恢复和批量删除", () => {
    const first = createTodo(db, "确认接口文档");
    const second = createTodo(db, "补充异常场景");
    expect(listTodos(db).map((item) => item.id)).toEqual([second.id, first.id]);

    const updated = updateTodo(db, first.id, {
      content: "确认最新接口文档",
      detail: "重点确认错误码和重试策略",
    });
    expect(updated.content).toBe("确认最新接口文档");
    expect(updated.detail).toContain("重试策略");

    expect(toggleTodo(db, first.id).status).toBe("done");
    expect(toggleTodo(db, first.id).status).toBe("open");

    expect(deleteTodos(db, [first.id, second.id])).toBe(2);
    expect(listTodos(db)).toEqual([]);
  });

  it("拒绝空内容和超长内容", () => {
    expect(() => createTodo(db, "   ")).toThrow("不能为空");
    expect(() => createTodo(db, "x".repeat(201))).toThrow("200");
  });

  it("追加到已有任务描述时保留原内容", () => {
    const todos = [createTodo(db, "加入任务的事项A"), createTodo(db, "加入任务的事项B")];
    updateTodo(db, todos[0].id, {
      content: todos[0].content,
      detail: "补充说明A",
    });
    todos[0] = { ...todos[0], detail: "补充说明A" };
    const description = appendTodosToDescription("已有任务背景", todos);
    expect(description).toContain("已有任务背景");
    expect(description).toContain("- 加入任务的事项A");
    expect(description).toContain("- 加入任务的事项B");
    expect(description).toContain("补充说明A");
    deleteTodos(db, todos.map((item) => item.id));
  });

  it("转入任务后保留待办并记录关联", () => {
    const todo = createTodo(db, "关联任务测试");
    const task = createTask(db, {
      title: "关联目标任务",
      type: "planned_dev",
      priority: "medium",
    });
    expect(linkTodosToTask(db, [todo.id], task.id)).toBe(1);
    const linked = listTodos(db).find((item) => item.id === todo.id)!;
    expect(linked.status).toBe("converted");
    expect(linked.linkedTaskId).toBe(task.id);
    expect(linked.linkedAt).not.toBeNull();
    deleteTodos(db, [todo.id]);
  });
});
