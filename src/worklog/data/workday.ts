import { q, type Database } from "./db";
import { addDays, parseStr, toStr, weekdayCN } from "./dates";
import type { DayMeta } from "../types";

interface HolidayRow {
  name: string;
  is_workday: number;
}

/** 某日是否上班：holiday 表优先，其次周一至周五 */
export function isWorkday(db: Database, date: string): boolean {
  const rows = q<HolidayRow>(db, "SELECT name, is_workday FROM holiday WHERE date = ?", [date]);
  if (rows.length) return rows[0].is_workday === 1;
  const wd = parseStr(date).getDay();
  return wd >= 1 && wd <= 5;
}

/** 日历元信息：法定假日标节日名，调休补班的周末标"班" */
export function dayMeta(db: Database, date: string): DayMeta {
  const rows = q<HolidayRow>(db, "SELECT name, is_workday FROM holiday WHERE date = ?", [date]);
  const weekday = weekdayCN(date);
  if (rows.length) {
    if (rows[0].is_workday === 1) {
      return { date, weekday, isWorkday: true, tag: "班", isOffTag: false };
    }
    return { date, weekday, isWorkday: false, tag: rows[0].name, isOffTag: true };
  }
  const wd = parseStr(date).getDay();
  return { date, weekday, isWorkday: wd >= 1 && wd <= 5, tag: null, isOffTag: false };
}

/** 上一工作日：从 date 前一天开始回溯，跳过周末与法定假日（晨会页用） */
export function previousWorkday(db: Database, date: string): string {
  let d = addDays(parseStr(date), -1);
  for (let i = 0; i < 60; i++) {
    const s = toStr(d);
    if (isWorkday(db, s)) return s;
    d = addDays(d, -1);
  }
  throw new Error("60 天内找不到工作日，请检查节假日数据");
}
