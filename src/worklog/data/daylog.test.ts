import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { freshDb } from "./test-util";
import { createEntry } from "./entry";
import { createTask } from "./task";
import { getDayLog, getNote, upsertNote } from "./daylog";
import { run } from "./db";
import type { CreateTaskInput } from "../types";

const BASE: CreateTaskInput = { title: "任务", type: "planned_dev", priority: "medium" };

describe("每日日志聚合", () => {
  let db: Database;
  beforeAll(async () => {
    db = await freshDb();
  });

  it("按任务分组，排期在前打断在后，独立记录最后", () => {
    const a = createTask(db, { ...BASE, title: "排期任务A" });
    const b = createTask(db, { ...BASE, title: "紧急插入B", type: "urgent_insert" });
    createEntry(db, { taskId: b.id, entryDate: "2026-09-18", content: "b1", effortHours: null });
    createEntry(db, { taskId: a.id, entryDate: "2026-09-18", content: "a1", effortHours: null });
    createEntry(db, { taskId: null, entryDate: "2026-09-18", content: "开了半天会", effortHours: null });

    const log = getDayLog(db, "2026-09-18");
    expect(log.groups.length).toBe(3);
    expect(log.groups[0].task!.id).toBe(a.id);
    expect(log.groups[1].task!.id).toBe(b.id);
    expect(log.groups[2].task).toBeNull();
    expect(log.groups[2].entries[0].content).toBe("开了半天会");
  });

  it("每日计划 upsert 与读取", () => {
    upsertNote(db, "2026-09-18", "推进A任务");
    expect(getNote(db, "2026-09-18")).toBe("推进A任务");
    upsertNote(db, "2026-09-18", "改为推进B");
    expect(getNote(db, "2026-09-18")).toBe("改为推进B");
    expect(getDayLog(db, "2026-09-18").plan).toBe("改为推进B");
  });

  it("任务已不存在时，孤立工作记录按独立记录返回而不是抛错", () => {
    db.run("PRAGMA foreign_keys = OFF");
    run(
      db,
      `INSERT INTO work_entry (task_id, entry_date, content, effort_hours, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [9999, "2026-09-20", "孤立记录", 1, "2026-09-20 09:00:00", "2026-09-20 09:00:00"]
    );
    db.run("PRAGMA foreign_keys = ON");

    const log = getDayLog(db, "2026-09-20");
    expect(log.groups).toHaveLength(1);
    expect(log.groups[0].task).toBeNull();
    expect(log.groups[0].entries[0].content).toBe("孤立记录");
  });
});
