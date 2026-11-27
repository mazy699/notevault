import { describe, expect, it } from "vitest";
import { q, run, type Database } from "../db";
import { freshDb } from "../test-util";
import { insertEntryRaw } from "../task";
import { nowStr } from "../dates";
import { applyJiraSync } from "./engine";
import type { MappedJiraIssue } from "./types";

interface TaskDbRow {
  id: number;
  title: string;
  status: string;
  type: string;
  priority: string;
  estimate_days: number | null;
  window_start: string | null;
  window_end: string | null;
  project_id: number | null;
  completed_at: string | null;
  external_source: string | null;
  external_id: string | null;
  external_url: string | null;
  external_parent_key: string | null;
  external_parent_summary: string | null;
  external_status: string | null;
  external_updated: string | null;
  external_synced_at: string | null;
  external_missing: number;
}

function mapped(over: Partial<MappedJiraIssue> = {}): MappedJiraIssue {
  return {
    externalSource: "jira",
    externalId: "PROJ-1",
    externalUrl: "https://jira.example.com/browse/PROJ-1",
    externalParentKey: "PROJ-100",
    externalParentSummary: "父 Story",
    externalStatus: "In Progress",
    externalUpdated: "2026-11-27T10:00:00.000+0800",
    title: "任务一",
    description: "描述",
    status: "in_progress",
    priority: "medium",
    estimateDays: 1,
    windowStart: "2026-12-01",
    windowEnd: "2026-12-01",
    type: "planned_dev",
    projectName: "PROJ · 订单系统",
    ...over,
  };
}

function rows(db: Database): TaskDbRow[] {
  return q<TaskDbRow>(db, "SELECT * FROM task ORDER BY id");
}

function byExternal(db: Database, id: string): TaskDbRow {
  const row = rows(db).find((r) => r.external_id === id);
  if (!row) throw new Error(`missing ${id}`);
  return row;
}

describe("Jira 幂等写入", () => {
  it("首次同步创建任务、自动建项目、写入外部字段", async () => {
    const db = await freshDb();
    const r = applyJiraSync(db, [mapped(), mapped({ externalId: "PROJ-2", title: "任务二" })], {
      full: true,
    });
    expect(r).toMatchObject({ created: 2, updated: 0, skipped: 0, missing: 0 });

    const list = rows(db);
    expect(list).toHaveLength(2);
    const first = list[0];
    expect(first.external_source).toBe("jira");
    expect(first.external_id).toBe("PROJ-1");
    expect(first.external_url).toBe("https://jira.example.com/browse/PROJ-1");
    expect(first.external_parent_key).toBe("PROJ-100");
    expect(first.external_parent_summary).toBe("父 Story");
    expect(first.external_status).toBe("In Progress");
    expect(first.external_missing).toBe(0);
    expect(first.project_id).not.toBeNull();
    expect(first.project_id).not.toBe(1);
  });

  it("重复同步同一 updated 不产生重复任务", async () => {
    const db = await freshDb();
    applyJiraSync(db, [mapped(), mapped({ externalId: "PROJ-2" })], { full: true });
    const r = applyJiraSync(db, [mapped(), mapped({ externalId: "PROJ-2" })], { full: false });
    expect(r).toMatchObject({ created: 0, updated: 0, skipped: 2 });
    expect(rows(db)).toHaveLength(2);
  });

  it("updated 变化时更新字段，但保留本地工作记录", async () => {
    const db = await freshDb();
    applyJiraSync(db, [mapped()], { full: true });
    const task = byExternal(db, "PROJ-1");
    insertEntryRaw(db, task.id, "2026-11-27", "已经做了一些事", 2, nowStr());

    const r = applyJiraSync(
      db,
      [
        mapped({
          title: "任务一（改名）",
          status: "done",
          externalStatus: "Done",
          externalUpdated: "2026-11-27T11:00:00.000+0800",
        }),
      ],
      { full: false }
    );
    expect(r).toMatchObject({ updated: 1, created: 0 });
    const after = byExternal(db, "PROJ-1");
    expect(after.title).toBe("任务一（改名）");
    expect(after.status).toBe("done");
    expect(after.completed_at).not.toBeNull();
    expect(q<{ n: number }>(db, "SELECT COUNT(*) AS n FROM work_entry")[0].n).toBe(1);
  });

  it("全量同步把结果中消失的任务标记为缺失，但不删除", async () => {
    const db = await freshDb();
    applyJiraSync(db, [mapped(), mapped({ externalId: "PROJ-2" })], { full: true });
    const r = applyJiraSync(db, [mapped()], { full: true });
    expect(r.missing).toBe(1);
    const gone = byExternal(db, "PROJ-2");
    expect(gone.external_missing).toBe(1);
    expect(rows(db)).toHaveLength(2);
  });

  it("全量结果为空时不标记缺失，避免 JQL 写错清空视图", async () => {
    const db = await freshDb();
    applyJiraSync(db, [mapped()], { full: true });
    const r = applyJiraSync(db, [], { full: true });
    expect(r.missing).toBe(0);
    expect(byExternal(db, "PROJ-1").external_missing).toBe(0);
  });

  it("任务重新出现时清除缺失标记", async () => {
    const db = await freshDb();
    applyJiraSync(db, [mapped(), mapped({ externalId: "PROJ-2" })], { full: true });
    applyJiraSync(db, [mapped()], { full: true });
    expect(byExternal(db, "PROJ-2").external_missing).toBe(1);

    applyJiraSync(
      db,
      [mapped(), mapped({ externalId: "PROJ-2", externalUpdated: "2026-11-27T12:00:00.000+0800" })],
      { full: true }
    );
    expect(byExternal(db, "PROJ-2").external_missing).toBe(0);
  });

  it("本地时间窗、类型、项目不被同步覆盖", async () => {
    const db = await freshDb();
    applyJiraSync(db, [mapped()], { full: true });
    const task = byExternal(db, "PROJ-1");
    run(db, "UPDATE task SET window_start='2026-11-01', window_end='2026-11-05', type='prod_issue', project_id=1 WHERE id=?", [task.id]);

    applyJiraSync(
      db,
      [
        mapped({
          windowStart: "2026-12-20",
          windowEnd: "2026-12-20",
          type: "planned_dev",
          projectName: "OTHER · 另一个项目",
          externalUpdated: "2026-11-27T13:00:00.000+0800",
        }),
      ],
      { full: false }
    );
    const after = byExternal(db, "PROJ-1");
    expect(after.window_start).toBe("2026-11-01");
    expect(after.window_end).toBe("2026-11-05");
    expect(after.type).toBe("prod_issue");
    expect(after.project_id).toBe(1);
  });

  it("唯一索引保证并发/重复导入也不会产生重复行", async () => {
    const db = await freshDb();
    applyJiraSync(db, [mapped()], { full: true });
    expect(() => {
      run(
        db,
        `INSERT INTO task (title, description, type, priority, status, created_at, updated_at, external_source, external_id)
         VALUES ('dup','','planned_dev','medium','todo','2026-11-27','2026-11-27','jira','PROJ-1')`
      );
    }).toThrow();
  });
});
