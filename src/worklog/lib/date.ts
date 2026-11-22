// 与主进程 dates.ts 同口径的日期工具（渲染层使用）

export function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function toStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseStr(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDaysStr(s: string, n: number): string {
  const d = parseStr(s);
  d.setDate(d.getDate() + n);
  return toStr(d);
}

export function weekMonday(s: string): string {
  const d = parseStr(s);
  return toStr(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)));
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

const WD = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function weekdayCN(s: string): string {
  return WD[parseStr(s).getDay()];
}

export function fmtDateCN(s: string): string {
  const d = parseStr(s);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function monthTitle(s: string): string {
  const d = parseStr(s);
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`;
}

/** 月视图 42 格（含前后月溢出），周一开头 */
export function monthGrid42(monthFirstDay: string): string[] {
  const start = weekMonday(monthFirstDay);
  return Array.from({ length: 42 }, (_, i) => addDaysStr(start, i));
}
