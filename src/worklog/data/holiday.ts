import { inTxn, q, run, type Database } from "./db";
import { isDateStr } from "./dates";
import { HOLIDAY_CN_2024, HOLIDAY_CN_2025, HOLIDAY_CN_2026 } from "./holiday-data";
import type { ImportReport } from "../types";

/** 兼容两种格式：自有格式 {year, days:[{date,name,isWorkday}]} 与 holiday-cn 格式 {year, days:[{date,name,isOffDay}]} */
export function parseHolidayJson(text: string): { year: number; entries: { date: string; name: string; isWorkday: boolean }[] } {
  let data: { year?: unknown; days?: unknown };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("不是合法的 JSON 文件");
  }
  if (!data || !Array.isArray(data.days) || data.days.length === 0) {
    throw new Error("JSON 缺少非空的 days 数组");
  }
  const entries = (data.days as { name?: unknown; date?: unknown; isWorkday?: unknown; isOffDay?: unknown }[]).map((d) => {
    if (!isDateStr(d.date)) throw new Error(`无效日期: ${String(d.date)}`);
    const isWorkday = typeof d.isWorkday === "boolean" ? d.isWorkday : d.isOffDay === false;
    return { date: d.date, name: String(d.name ?? "节假日"), isWorkday };
  });
  const year = Number(data.year) || Number(entries[0].date.slice(0, 4));
  return { year, entries };
}

/** 按年覆盖导入：同年旧数据先删再插 */
export function importHolidays(db: Database, text: string): ImportReport {
  const parsed = parseHolidayJson(text);
  inTxn(db, () => {
    run(db, "DELETE FROM holiday WHERE date >= ? AND date <= ?", [
      `${parsed.year}-01-01`,
      `${parsed.year}-12-31`,
    ]);
    for (const e of parsed.entries) {
      run(db, "INSERT INTO holiday (date, name, is_workday) VALUES (?, ?, ?)", [
        e.date,
        e.name,
        e.isWorkday ? 1 : 0,
      ]);
    }
  });
  return { imported: parsed.entries.length, years: [parsed.year] };
}

export function holidayYears(db: Database): number[] {
  return q<{ y: number }>(db, "SELECT DISTINCT substr(date, 1, 4) AS y FROM holiday ORDER BY y").map((r) =>
    Number(r.y)
  );
}

const BUILTIN = [HOLIDAY_CN_2024, HOLIDAY_CN_2025, HOLIDAY_CN_2026];

/** 首次启动且库内无节假日数据时，导入内置数据 */
export function seedBuiltinHolidays(db: Database): void {
  if (holidayYears(db).length > 0) return;
  for (const json of BUILTIN) importHolidays(db, json);
}
