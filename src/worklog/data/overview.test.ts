import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { freshDb } from "./test-util";
import { importHolidays } from "./holiday";
import { HOLIDAY_CN_2026 } from "./holiday-data";
import { createEntry } from "./entry";
import { createTask } from "./task";
import { monthOverview, weekMatrix } from "./overview";
import { isWorkday } from "./workday";
import { addDaysStr, todayStr, weekdayCN } from "./dates";
import type { CreateTaskInput } from "../types";

const BASE: CreateTaskInput = { title: "任务", type: "planned_dev", priority: "medium", estimateDays: 3 };

describe("周视图矩阵与月视图", () => {
  let db: Database;
  beforeAll(async () => {
    db = await freshDb();
  });

  it("色块只涂实际有条目的日期，中间自然断开", () => {
    const a = createTask(db, { ...BASE, title: "三天开发被两次打断" });
    createEntry(db, { taskId: a.id, entryDate: "2026-09-14", content: "day1", effortHours: 8 });
    createEntry(db, { taskId: a.id, entryDate: "2026-09-17", content: "day2", effortHours: 4 });

    const m = weekMatrix(db, "2026-09-16");
    expect(m.weekStart).toBe("2026-09-14");
    const row = m.rows.find((r) => r.task.id === a.id)!;
    expect(row.cells.map((c) => c.date)).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]);
    expect(row.cells.filter((c) => c.entries.length > 0).map((c) => c.date)).toEqual([
      "2026-09-14",
      "2026-09-17",
    ]);
    expect(row.occupiedDays).toBe(2);
    expect(row.totalHours).toBe(12);
    expect(row.cells[0].entries[0].snippet).toBe("day1");
  });

  it("时间窗内的待开始任务也出现在周视图", () => {
    const b = createTask(db, {
      ...BASE,
      title: "下周要排的任务",
      windowStart: "2026-09-14",
      windowEnd: "2026-09-18",
    });
    const m = weekMatrix(db, "2026-09-16");
    const row = m.rows.find((r) => r.task.id === b.id)!;
    expect(row.window).toEqual({ start: "2026-09-14", end: "2026-09-18" });
    expect(row.cells.every((c) => c.entries.length === 0)).toBe(true);
  });

  it("沉睡的进行中任务不出现，近期活跃的出现（相对今天）", () => {
    const stale = createTask(db, { ...BASE, title: "很久没动" });
    createEntry(db, {
      taskId: stale.id,
      entryDate: addDaysStr(todayStr(), -40),
      content: "早期记录",
      effortHours: null,
    });
    const active = createTask(db, { ...BASE, title: "最近在推进" });
    createEntry(db, {
      taskId: active.id,
      entryDate: addDaysStr(todayStr(), -5),
      content: "近期记录",
      effortHours: null,
    });
    const m = weekMatrix(db, todayStr());
    expect(m.rows.find((r) => r.task.id === stale.id)).toBeUndefined();
    expect(m.rows.find((r) => r.task.id === active.id)).toBeDefined();
  });

  it("月视图：42 格网格、周一开头、chips 只在当月", () => {
    // 使用远离其他用例相对日期的固定月份，避免依赖于运行日期
    const a = createTask(db, { ...BASE, title: "开发A" });
    createEntry(db, { taskId: a.id, entryDate: "2026-11-15", content: "x", effortHours: null });
    const o = monthOverview(db, "2026-11-16");
    expect(o.days.length).toBe(42);
    expect(weekdayCN(o.gridStart)).toBe("周一");
    const day = o.monthDays.find((d) => d.date === "2026-11-15")!;
    expect(day.chips.length).toBe(1);
    expect(day.chips[0].taskId).toBe(a.id);
    expect(o.monthDays.every((d) => d.date >= "2026-11-01" && d.date <= "2026-11-30")).toBe(true);
  });

  it("月视图工作日统计：与节假日口径一致，国庆月工作日显著偏少", () => {
    const y = importHolidays(db, HOLIDAY_CN_2026);
    expect(y.years).toEqual([2026]);
    const sep = monthOverview(db, "2026-09-16");
    let manual = 0;
    for (let d = "2026-09-01"; d <= "2026-09-30"; d = addDaysStr(d, 1)) {
      if (isWorkday(db, d)) manual++;
    }
    expect(sep.workdays).toBe(manual);
    // 当月：已过工作日 <= 全月工作日，且包含今天
    expect(sep.workdaysElapsed).toBeLessThanOrEqual(sep.workdays);
    const oct = monthOverview(db, "2026-10-05");
    let octManual = 0;
    for (let d = "2026-10-01"; d <= "2026-10-31"; d = addDaysStr(d, 1)) {
      if (isWorkday(db, d)) octManual++;
    }
    expect(oct.workdays).toBe(octManual);
    // 10 月有国庆长假，工作日应明显少于 9 月
    expect(oct.workdays).toBeLessThan(sep.workdays);
  });
});
