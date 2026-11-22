import { describe, expect, it } from "vitest";
import { parseHolidayJson, importHolidays, holidayYears } from "./holiday";
import { HOLIDAY_CN_2025, HOLIDAY_CN_2026 } from "./holiday-data";
import { freshDb } from "./test-util";

describe("节假日数据", () => {
  it("解析 holiday-cn 格式：isOffDay 映射为 isWorkday 反值", () => {
    const p = parseHolidayJson(HOLIDAY_CN_2025);
    expect(p.year).toBe(2025);
    const first = p.entries[0];
    expect(first.name).toBe("元旦");
    expect(first.isWorkday).toBe(false);
    expect(p.entries.some((e) => e.isWorkday)).toBe(true);
  });

  it("解析自有格式 isWorkday 字段", () => {
    const p = parseHolidayJson(
      '{"year":2027,"days":[{"date":"2027-01-01","name":"元旦","isWorkday":false},{"date":"2027-01-09","name":"元旦调休","isWorkday":true}]}'
    );
    expect(p.year).toBe(2027);
    expect(p.entries[1].isWorkday).toBe(true);
  });

  it("非法 JSON 与缺字段报错", () => {
    expect(() => parseHolidayJson("not json")).toThrow();
    expect(() => parseHolidayJson('{"foo":1}')).toThrow();
    expect(() => parseHolidayJson('{"year":2026,"days":[]}')).toThrow();
  });

  it("按年覆盖导入：同年前数据被替换", async () => {
    const db = await freshDb();
    const r1 = importHolidays(db, HOLIDAY_CN_2026);
    expect(r1.years).toEqual([2026]);
    expect(r1.imported).toBeGreaterThan(30);
    const count1 = holidayYears(db);
    importHolidays(db, HOLIDAY_CN_2026);
    expect(holidayYears(db)).toEqual(count1);
    importHolidays(db, HOLIDAY_CN_2025);
    expect(holidayYears(db).sort()).toEqual([2025, 2026]);
  });
});
