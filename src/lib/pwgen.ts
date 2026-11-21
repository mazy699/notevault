/**
 * 密码生成器：CSPRNG（crypto.getRandomValues）、字符类保证、排除字符、避免重复。
 * 纯函数、无 DOM 依赖，供密码工作台使用。
 */

export interface PwGenOpts {
  /** 密码长度（8-128） */
  length: number;
  upper: boolean;
  lower: boolean;
  digits: boolean;
  symbols: boolean;
  /** 排除字符集（逐字符从候选池剔除） */
  excludeChars: string;
}

export const DEFAULT_EXCLUDE_CHARS = "O0oIl1|`'\"";

/** 四类字符基础池 */
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{};:,.<>?/~";

/** 生成器默认配置 */
export const DEFAULT_GEN_OPTS: PwGenOpts = {
  length: 20,
  upper: true,
  lower: true,
  digits: true,
  symbols: true,
  excludeChars: DEFAULT_EXCLUDE_CHARS,
};

/** CSPRNG 均匀取 [0, n) */
function randInt(n: number): number {
  // 拒绝采样避免模偏差
  const max = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  let v = 0;
  do {
    crypto.getRandomValues(buf);
    v = buf[0];
  } while (v >= max);
  return v % n;
}

function pick(pool: string): string {
  return pool.charAt(randInt(pool.length));
}

/** Fisher-Yates 洗牌 */
function shuffle(chars: string[]): string[] {
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars;
}

/** 按规则构建候选池（剔除排除字符），返回各类剩余池；null 表示该类被排除字符清空 */
function buildPools(opts: PwGenOpts): { pools: string[]; all: string } {
  const ex = new Set(opts.excludeChars.split(""));
  const mk = (base: string): string | null => {
    const kept = [...base].filter((c) => !ex.has(c)).join("");
    return kept.length > 0 ? kept : null;
  };
  const pools: string[] = [];
  const add = (enabled: boolean, base: string) => {
    if (!enabled) return;
    const kept = mk(base);
    if (kept) pools.push(kept);
  };
  add(opts.upper, UPPER);
  add(opts.lower, LOWER);
  add(opts.digits, DIGITS);
  add(opts.symbols, SYMBOLS);
  return { pools, all: pools.join("") };
}

/**
 * 生成密码：
 * - 保证每个启用的字符类至少出现一次（先放置代表，再随机填充，最后洗牌）；
 * - excludePasswords 中的密码（如条目当前密码与最近历史）自动避让，最多重试 80 次。
 */
export function generatePassword(opts: PwGenOpts, excludePasswords: string[] = []): string {
  const { pools, all } = buildPools(opts);
  if (pools.length === 0 || all.length === 0) {
    throw new Error("候选字符集为空：请至少启用一个字符类，且不要用排除字符清空它");
  }
  const length = Math.max(4, Math.min(128, Math.round(opts.length)));
  const excluded = new Set(excludePasswords.filter(Boolean));
  let fallback = "";
  for (let attempt = 0; attempt < 80; attempt++) {
    const chars: string[] = [];
    // 每个启用类先放一个，保证覆盖
    for (const p of pools) chars.push(pick(p));
    while (chars.length < length) chars.push(pick(all));
    shuffle(chars);
    const pw = chars.slice(0, length).join("");
    if (attempt === 0) fallback = pw;
    if (!excluded.has(pw)) return pw;
  }
  // 80 次都撞（概率极低，仅当排除集与候选空间几乎重合）：返回最后一次
  return fallback;
}

/**
 * 估算密码熵（bits）：按实际使用的字符类别合成池大小 × 长度。
 * 简化模型：不感知字典/重复模式，仅作强度参考。
 */
export function estimateEntropyBits(password: string): number {
  if (!password) return 0;
  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/[0-9]/.test(password)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(password)) pool += 33;
  if (pool <= 1 || password.length === 0) return 0;
  return Math.round(password.length * Math.log2(pool));
}

export type StrengthLabel = "弱" | "中" | "强" | "极强";

/** 强度评级：<40 弱，<60 中，<80 强，≥80 极强 */
export function strengthInfo(password: string): { bits: number; label: StrengthLabel; cssVar: string } {
  const bits = estimateEntropyBits(password);
  if (bits < 40) return { bits, label: "弱", cssVar: "var(--err)" };
  if (bits < 60) return { bits, label: "中", cssVar: "var(--warn)" };
  if (bits < 80) return { bits, label: "强", cssVar: "var(--ok)" };
  return { bits, label: "极强", cssVar: "var(--accent-text)" };
}

/** 便捷：按常见公司场景生成（默认 20 位、含全部字符类、排除易混淆字符） */
export function generateDefault(excludePasswords: string[] = []): string {
  return generatePassword(DEFAULT_GEN_OPTS, excludePasswords);
}
