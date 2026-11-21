// 日期工具：全程本地时区，"天"统一为 'yyyy-MM-dd' 字符串
const WD = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function toStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseStr(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d || Number.isNaN(new Date(y, m - 1, d).getTime())) {
    throw new Error(`无效日期: ${s}`);
  }
  return new Date(y, m - 1, d);
}

export function isDateStr(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseStr(s).getTime());
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function addDaysStr(s: string, n: number): string {
  return toStr(addDays(parseStr(s), n));
}

export function weekdayCN(s: string): string {
  return WD[parseStr(s).getDay()];
}

/** 该日期所在周的周一 */
export function weekMonday(s: string): string {
  const d = parseStr(s);
  return toStr(addDays(d, -((d.getDay() + 6) % 7)));
}

export function monthFirst(s: string): string {
  return `${s.slice(0, 7)}-01`;
}

export function monthAdd(s: string, n: number): string {
  const d = parseStr(s);
  return toStr(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

export function todayStr(): string {
  return toStr(new Date());
}

export function nowStr(): string {
  const d = new Date();
  return `${toStr(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 文件名时间戳：20260919-083000 */
export function stamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
