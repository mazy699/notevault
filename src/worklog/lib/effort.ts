export interface EffortOption {
  label: string;
  v: number;
}

export const EFFORT_OPTIONS: EffortOption[] = [
  { label: "0.5小时", v: 0.5 },
  { label: "1小时", v: 1 },
  { label: "2小时", v: 2 },
  { label: "半天（4h）", v: 4 },
  { label: "一天（8h）", v: 8 },
];

export type EffortBucket = "light" | "mid" | "dark";

/** 色块深浅分档：未填=标准；<2h=浅；>6h=深（需求文档 §9.2） */
export function effortBucket(h: number | null | undefined): EffortBucket {
  if (h == null) return "mid";
  if (h < 2) return "light";
  if (h > 6) return "dark";
  return "mid";
}

export const EFFORT_ALPHA: Record<EffortBucket, number> = {
  light: 0.35,
  mid: 0.8,
  dark: 1,
};

export const EFFORT_ALPHA_DARK: Record<EffortBucket, number> = {
  light: 0.45,
  mid: 0.72,
  dark: 0.92,
};

export function fmtHours(h: number | null | undefined): string {
  if (h == null) return "";
  if (h % 8 === 0) return `${h / 8}天`;
  return `${h}h`;
}
