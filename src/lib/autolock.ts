/**
 * 密码库自动上锁：设置值解析与空闲判定（纯函数，便于单测）。
 * 口径：minutes <= 0 表示关闭自动上锁；持久化值非法时回退默认 30 分钟。
 */
export const DEFAULT_AUTOLOCK_MINUTES = 30;
export const AUTOLOCK_SETTING_KEY = "pw_autolock_minutes";
export const AUTOLOCK_MAX_MINUTES = 1440;

/** 解析持久化设置：空/非法 → 默认 30；0 → 关闭；其余收敛到 1..1440 整数 */
export function parseAutoLockMinutes(raw: string | null | undefined): number {
  if (raw === null || raw === undefined || raw.trim() === "") return DEFAULT_AUTOLOCK_MINUTES;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_AUTOLOCK_MINUTES;
  if (n <= 0) return 0;
  return Math.min(AUTOLOCK_MAX_MINUTES, Math.max(1, Math.round(n)));
}

/** 把用户输入收敛为合法分钟数（0 = 关闭）。非法输入返回 null 表示保持原值 */
export function normalizeAutoLockMinutes(input: number): number | null {
  if (!Number.isFinite(input)) return null;
  if (input <= 0) return 0;
  return Math.min(AUTOLOCK_MAX_MINUTES, Math.max(1, Math.round(input)));
}

/** 空闲是否已达到自动上锁阈值（minutes <= 0 表示关闭） */
export function isIdleExpired(lastActiveMs: number, nowMs: number, minutes: number): boolean {
  if (minutes <= 0) return false;
  return nowMs - lastActiveMs >= minutes * 60_000;
}

/** 人读描述：0 → 关闭，否则 "N 分钟" */
export function describeAutoLock(minutes: number): string {
  return minutes <= 0 ? "关闭" : `${minutes} 分钟`;
}
