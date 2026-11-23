import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTOLOCK_MINUTES,
  describeAutoLock,
  isIdleExpired,
  normalizeAutoLockMinutes,
  parseAutoLockMinutes,
} from "./autolock";

describe("parseAutoLockMinutes（持久化值解析）", () => {
  it("空值/非法值回退默认 30 分钟", () => {
    expect(parseAutoLockMinutes(null)).toBe(DEFAULT_AUTOLOCK_MINUTES);
    expect(parseAutoLockMinutes(undefined)).toBe(DEFAULT_AUTOLOCK_MINUTES);
    expect(parseAutoLockMinutes("")).toBe(DEFAULT_AUTOLOCK_MINUTES);
    expect(parseAutoLockMinutes("abc")).toBe(DEFAULT_AUTOLOCK_MINUTES);
  });

  it("0 表示关闭；负数同样视为关闭", () => {
    expect(parseAutoLockMinutes("0")).toBe(0);
    expect(parseAutoLockMinutes("-5")).toBe(0);
  });

  it("有效值收敛到 1..1440 整数", () => {
    expect(parseAutoLockMinutes("30")).toBe(30);
    expect(parseAutoLockMinutes("1.6")).toBe(2);
    expect(parseAutoLockMinutes("9999")).toBe(1440);
    expect(parseAutoLockMinutes("0.4")).toBe(1); // 大于 0 的值最少收敛为 1 分钟
  });
});

describe("normalizeAutoLockMinutes（用户输入收敛）", () => {
  it("非法输入返回 null（保持原值），其余收敛", () => {
    expect(normalizeAutoLockMinutes(Number.NaN)).toBeNull();
    expect(normalizeAutoLockMinutes(-1)).toBe(0);
    expect(normalizeAutoLockMinutes(0)).toBe(0);
    expect(normalizeAutoLockMinutes(15.4)).toBe(15);
    expect(normalizeAutoLockMinutes(5000)).toBe(1440);
  });
});

describe("isIdleExpired（空闲判定）", () => {
  it("未达阈值返回 false，达到/超过返回 true", () => {
    const last = 1_000_000;
    expect(isIdleExpired(last, last + 29 * 60_000, 30)).toBe(false);
    expect(isIdleExpired(last, last + 30 * 60_000 - 1, 30)).toBe(false);
    expect(isIdleExpired(last, last + 30 * 60_000, 30)).toBe(true);
    expect(isIdleExpired(last, last + 90 * 60_000, 30)).toBe(true);
  });

  it("关闭自动上锁（0 或负数）永不触发", () => {
    const last = 0;
    expect(isIdleExpired(last, 10 * 60 * 60_000, 0)).toBe(false);
    expect(isIdleExpired(last, 10 * 60 * 60_000, -1)).toBe(false);
  });
});

describe("describeAutoLock", () => {
  it("人读描述", () => {
    expect(describeAutoLock(0)).toBe("关闭");
    expect(describeAutoLock(30)).toBe("30 分钟");
  });
});
