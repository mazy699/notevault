import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { freshDb } from "./test-util";
import { createEntry } from "./entry";
import { getDayLog, getNote, upsertNote } from "./daylog";
import { cleanupLegacyDemoData } from "./demo";
import { run } from "./db";

describe("演示数据遗留清理", () => {
  let db: Database;
  beforeAll(async () => {
    db = await freshDb();
  });

  it("清除旧版遗留的独立记录和当日计划，同时保留真实记录", () => {
    createEntry(db, {
      taskId: null,
      entryDate: "2026-09-16",
      content: "参加架构评审会，评审订单服务拆分方案",
      effortHours: 2,
    });
    createEntry(db, {
      taskId: null,
      entryDate: "2026-09-16",
      content: "真实独立记录",
      effortHours: 1,
    });
    db.run("PRAGMA foreign_keys = OFF");
    run(
      db,
      `INSERT INTO work_entry (task_id, entry_date, content, effort_hours, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [9998, "2026-09-16", "上线验证通过（旧演示）", 2, "2026-09-16 09:00:00", "2026-09-16 09:00:00"]
    );
    run(
      db,
      `INSERT INTO work_entry (task_id, entry_date, content, effort_hours, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [9999, "2026-09-16", "真实孤立任务记录", 1, "2026-09-16 10:00:00", "2026-09-16 10:00:00"]
    );
    db.run("PRAGMA foreign_keys = ON");
    upsertNote(
      db,
      "2026-09-16",
      "1. 继续库存慢查询验证，视结果上索引\n2. 推进指标口径改造\n3. 跟进订单拆单重构发布"
    );

    cleanupLegacyDemoData(db);

    const log = getDayLog(db, "2026-09-16");
    expect(log.groups).toHaveLength(1);
    const contents = log.groups[0].entries.map((entry) => entry.content);
    expect(contents).toHaveLength(2);
    expect(contents).toEqual(expect.arrayContaining(["真实独立记录", "真实孤立任务记录"]));
    expect(getNote(db, "2026-09-16")).toBe("");
  });
});
