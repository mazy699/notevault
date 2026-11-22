import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { freshDb } from "./test-util";
import { run } from "./db";
import { importHolidays } from "./holiday";
import { HOLIDAY_CN_2026 } from "./holiday-data";
import { dayMeta, isWorkday, previousWorkday } from "./workday";
import { q } from "./db";

describe("工作日口径", () => {
  let db: Database;
  beforeAll(async () => {
    db = await freshDb();
    importHolidays(db, HOLIDAY_CN_2026);
  });

  it("普通周一上班、周六休息", () => {
    expect(isWorkday(db, "2026-09-14")).toBe(true);
    expect(isWorkday(db, "2026-09-19")).toBe(false);
  });

  it("法定假日标节日名放假，调休周末标班补班", () => {
    const meta = dayMeta(db, "2026-10-01");
    expect(meta.isWorkday).toBe(false);
    expect(meta.isOffTag).toBe(true);
    expect(meta.tag).toBeTruthy();

    const makeup = q<{ date: string }>(
      db,
      "SELECT date FROM holiday WHERE is_workday = 1 AND strftime('%w', date) IN ('0','6') LIMIT 1"
    );
    expect(makeup.length).toBeGreaterThan(0);
    const m = dayMeta(db, makeup[0].date);
    expect(m.isWorkday).toBe(true);
    expect(m.tag).toBe("班");
    expect(m.isOffTag).toBe(false);
  });

  it("previousWorkday 跳过假日与调休补班", async () => {
    const db2 = await freshDb();
    // 2030-05-01 周三放假；2030-05-04 周六调休补班
    run(db2, "INSERT INTO holiday (date, name, is_workday) VALUES ('2030-05-01','劳动节',0)");
    run(db2, "INSERT INTO holiday (date, name, is_workday) VALUES ('2030-05-04','青年节调休',1)");
    expect(previousWorkday(db2, "2030-05-02")).toBe("2030-04-30");
    expect(previousWorkday(db2, "2030-05-05")).toBe("2030-05-04");
    expect(previousWorkday(db2, "2030-05-06")).toBe("2030-05-04");
    // 无任何节假日数据时跳过普通周末
    const db3 = await freshDb();
    expect(previousWorkday(db3, "2026-09-21")).toBe("2026-09-18");
  });
});
