import { describe, expect, it } from "vitest";
import { exportStore, openStore, migrate } from "./db";
import { freshDb } from "./test-util";
import { createTask } from "./task";
import { getTask } from "./models";
import { seedBuiltinHolidays, holidayYears } from "./holiday";

describe("存储层", () => {
  it("迁移幂等：重复执行 user_version 不变", async () => {
    const db = await freshDb();
    migrate(db);
    const v = Number(db.exec("PRAGMA user_version")[0].values[0][0]);
    expect(v).toBe(9);
  });

  it("导出字节后重新打开数据仍在", async () => {
    const s1 = await openStore(null);
    const t = createTask(s1.db, { title: "持久化测试", type: "planned_dev", priority: "medium" });
    const bytes = exportStore(s1);
    expect(bytes.length).toBeGreaterThan(0);
    const s2 = await openStore(bytes);
    expect(getTask(s2.db, t.id)!.title).toBe("持久化测试");
  });

  it("首次使用导入内置节假日（2024-2026）", async () => {
    const db = await freshDb();
    expect(holidayYears(db)).toEqual([]);
    seedBuiltinHolidays(db);
    const years = holidayYears(db);
    expect(years).toEqual([2024, 2025, 2026]);
  });
});
