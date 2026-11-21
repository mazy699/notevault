import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { freshDb } from "./test-util";
import {
  createTaskType,
  deleteTaskType,
  listTaskTypes,
  normalizeLegacyTaskTypes,
  updateTaskType,
} from "./task-types";
import { createTask, deleteTask } from "./task";

describe("自定义任务类型", () => {
  let db: Database;
  beforeAll(async () => {
    db = await freshDb();
  });

  it("默认包含日常运维，研究排查历史值迁移为线上/排查", () => {
    expect(listTaskTypes(db).map((item) => item.id)).toContain("daily_ops");
    db.run(
      `INSERT INTO task (title, description, type, priority, status, created_at, updated_at, project_id)
       VALUES ('旧调查任务', '', 'investigation', 'medium', 'todo', '2026-09-01 09:00:00', '2026-09-01 09:00:00', 1)`
    );
    normalizeLegacyTaskTypes(db);
    const type = db.exec("SELECT type FROM task WHERE title = '旧调查任务'")[0].values[0][0];
    expect(type).toBe("prod_issue");
  });

  it("新增、编辑、使用和删除自定义类型", () => {
    const created = createTaskType(db, "客户支持", "#0ea5e9");
    expect(created.builtin).toBe(false);
    expect(listTaskTypes(db).some((item) => item.id === created.id && item.label === "客户支持")).toBe(true);

    const updated = updateTaskType(db, created.id, "客户支持/工单", "#0284c7");
    expect(updated.label).toBe("客户支持/工单");

    const task = createTask(db, {
      title: "处理客户工单",
      type: created.id,
      priority: "medium",
    });
    expect(task.type).toBe(created.id);
    expect(() => deleteTaskType(db, created.id)).toThrow("仍被 1 个任务使用");

    deleteTask(db, task.id, true);
    deleteTaskType(db, created.id);
    expect(listTaskTypes(db).some((item) => item.id === created.id)).toBe(false);
  });
});
