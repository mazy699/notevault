import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { freshDb } from "./test-util";
import {
  createEntry,
  removeEntry,
  updateEntry,
  type CreateEntryInput,
} from "./entry";
import {
  createTask,
  deleteTask,
  getTaskDetail,
  listTasks,
  setTaskStatus,
  updateTask,
} from "./task";
import { getTask, taskStats } from "./models";
import type { CreateTaskInput } from "../types";

const BASE: CreateTaskInput = {
  title: "开发XX功能",
  type: "planned_dev",
  priority: "medium",
  estimateDays: 3,
};

describe("任务与条目业务规则", () => {
  let db: Database;
  beforeAll(async () => {
    db = await freshDb();
  });

  it("创建任务默认待开始", () => {
    const t = createTask(db, BASE);
    expect(t.status).toBe("todo");
    expect(t.estimateDays).toBe(3);
  });

  it("快速创建携带今日条目 → 直接进行中", () => {
    const t = createTask(db, {
      ...BASE,
      title: "排查线上报错",
      type: "prod_issue",
      priority: "high",
      todayEntryContent: "定位到 NPE 栈",
      todayEntryHours: 3.5,
    });
    expect(t.status).toBe("in_progress");
    expect(taskStats(db, t.id).occupiedDays).toBe(1);
    expect(taskStats(db, t.id).totalHours).toBe(3.5);
  });

  it("快速创建携带今日工时需在 0~24 小时之间", () => {
    expect(() =>
      createTask(db, { ...BASE, todayEntryContent: "无效工时", todayEntryHours: 25 })
    ).toThrow("今日投入");
  });

  it("首条工作条目自动流转进行中", () => {
    const t = createTask(db, BASE);
    createEntry(db, { taskId: t.id, entryDate: "2026-09-18", content: "完成方案设计", effortHours: 2 });
    expect(getTask(db, t.id)!.status).toBe("in_progress");
  });

  it("条目校验：空内容/坏日期/非法投入量", () => {
    const t = createTask(db, BASE);
    const mk = (o: Partial<CreateEntryInput>): CreateEntryInput => ({
      taskId: t.id,
      entryDate: "2026-09-18",
      content: "x",
      effortHours: null,
      ...o,
    });
    expect(() => createEntry(db, mk({ content: "   " }))).toThrow();
    expect(() => createEntry(db, mk({ entryDate: "2026-9-18" }))).toThrow();
    expect(() => createEntry(db, mk({ effortHours: 0 }))).toThrow();
    expect(() => createEntry(db, mk({ effortHours: 30 }))).toThrow();
  });

  it("条目可改日期（补记）与内容，可删除", () => {
    const t = createTask(db, BASE);
    const e = createEntry(db, { taskId: t.id, entryDate: "2026-09-18", content: "草稿", effortHours: null });
    const u = updateEntry(db, e.id, { entryDate: "2026-09-17", content: "补记完成", effortHours: 1.5 });
    expect(u.entryDate).toBe("2026-09-17");
    expect(u.effortHours).toBe(1.5);
    removeEntry(db, e.id);
    expect(taskStats(db, t.id).occupiedDays).toBe(0);
  });

  it("完成任务记录完成时间，撤销后清除", () => {
    const t = createTask(db, BASE);
    const done = setTaskStatus(db, t.id, "done");
    expect(done.completedAt).not.toBeNull();
    const back = setTaskStatus(db, t.id, "in_progress");
    expect(back.completedAt).toBeNull();
  });

  it("updateTask 保留创建时间并同步完成时间", () => {
    const t = createTask(db, BASE);
    const updated = updateTask(db, { ...t, status: "done", title: "开发XX功能（改）" });
    expect(updated.title).toBe("开发XX功能（改）");
    expect(updated.completedAt).not.toBeNull();
    expect(updated.createdAt).toBe(t.createdAt);
  });

  it("软删除归档，硬删除级联删条目", () => {
    const a = createTask(db, BASE);
    createEntry(db, { taskId: a.id, entryDate: "2026-09-18", content: "x", effortHours: null });
    deleteTask(db, a.id, false);
    expect(getTask(db, a.id)!.status).toBe("cancelled");

    const b = createTask(db, BASE);
    createEntry(db, { taskId: b.id, entryDate: "2026-09-18", content: "y", effortHours: null });
    deleteTask(db, b.id, true);
    expect(getTask(db, b.id)).toBeNull();
    expect(taskStats(db, b.id).occupiedDays).toBe(0);
  });

  it("列表过滤：类型/关键词/状态，统计口径正确", () => {
    const a = createTask(db, { ...BASE, title: "开发导出功能" });
    const b = createTask(db, { ...BASE, title: "日常运维巡检", type: "daily_ops", priority: "high" });
    createEntry(db, { taskId: a.id, entryDate: "2026-09-18", content: "编码", effortHours: 4 });
    createEntry(db, { taskId: a.id, entryDate: "2026-09-18", content: "联调", effortHours: null });

    const withStats = listTasks(db, {}).find((x) => x.id === a.id)!;
    expect(withStats.occupiedDays).toBe(1);
    expect(withStats.totalHours).toBe(4);
    expect(withStats.lastActivity).toBe("2026-09-18");

    expect(listTasks(db, { type: "daily_ops" }).map((x) => x.id)).toEqual([b.id]);
    expect(listTasks(db, { search: "导出" }).map((x) => x.id)).toEqual([a.id]);
    expect(listTasks(db, { status: "todo" }).length).toBeGreaterThanOrEqual(2);
  });

  it("任务详情按日期倒序分组", () => {
    const t = createTask(db, BASE);
    createEntry(db, { taskId: t.id, entryDate: "2026-09-16", content: "day1", effortHours: null });
    createEntry(db, { taskId: t.id, entryDate: "2026-09-18", content: "day3", effortHours: null });
    createEntry(db, { taskId: t.id, entryDate: "2026-09-16", content: "day1b", effortHours: null });
    const detail = getTaskDetail(db, t.id);
    expect(detail.days.map((d) => d.date)).toEqual(["2026-09-18", "2026-09-16"]);
    expect(detail.days[1].entries.length).toBe(2);
  });
});
