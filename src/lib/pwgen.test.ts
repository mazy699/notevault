import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXCLUDE_CHARS,
  DEFAULT_GEN_OPTS,
  estimateEntropyBits,
  generatePassword,
  strengthInfo,
} from "./pwgen";

const charClass = (c: string): "upper" | "lower" | "digit" | "symbol" => {
  if (/[A-Z]/.test(c)) return "upper";
  if (/[a-z]/.test(c)) return "lower";
  if (/[0-9]/.test(c)) return "digit";
  return "symbol";
};

describe("generatePassword（密码生成器）", () => {
  it("默认配置：20 位且四类字符齐备", () => {
    for (let i = 0; i < 30; i++) {
      const pw = generatePassword(DEFAULT_GEN_OPTS);
      expect(pw.length).toBe(20);
      const classes = new Set([...pw].map(charClass));
      expect(classes.has("upper")).toBe(true);
      expect(classes.has("lower")).toBe(true);
      expect(classes.has("digit")).toBe(true);
      expect(classes.has("symbol")).toBe(true);
    }
  });

  it("排除字符：结果不含排除集", () => {
    const opts = { ...DEFAULT_GEN_OPTS, excludeChars: DEFAULT_EXCLUDE_CHARS };
    for (let i = 0; i < 30; i++) {
      const pw = generatePassword(opts);
      for (const c of DEFAULT_EXCLUDE_CHARS) {
        expect(pw.includes(c)).toBe(false);
      }
    }
  });

  it("排除清空某类时该类被弃用（如数字全部排除仍可生成）", () => {
    const opts = { ...DEFAULT_GEN_OPTS, digits: true, excludeChars: "0123456789" };
    for (let i = 0; i < 20; i++) {
      const pw = generatePassword(opts);
      expect(/[0-9]/.test(pw)).toBe(false);
      expect(pw.length).toBe(20);
    }
  });

  it("仅小写：不出现其他类", () => {
    const opts = { ...DEFAULT_GEN_OPTS, upper: false, digits: false, symbols: false, excludeChars: "" };
    const pw = generatePassword({ ...opts, length: 32 });
    expect(/^[a-z]{32}$/.test(pw)).toBe(true);
  });

  it("避免与历史重复", () => {
    // 用极小的候选空间构造必然碰撞场景
    const opts = { length: 4, upper: false, lower: true, digits: false, symbols: false, excludeChars: "" };
    const pw = generatePassword(opts, ["aaaa", "bbbb"]);
    expect(["aaaa", "bbbb"]).not.toContain(pw);
  });

  it("仅允许字符：结果完全来自允许集", () => {
    const allowed = "~!^*_=:,;";
    const opts = {
      ...DEFAULT_GEN_OPTS,
      length: 24,
      upper: false,
      lower: false,
      digits: false,
      symbols: true,
      excludeChars: "",
      allowedChars: allowed,
    };
    for (let i = 0; i < 50; i++) {
      const pw = generatePassword(opts);
      expect(pw.length).toBe(24);
      for (const c of pw) expect(allowed.includes(c)).toBe(true);
    }
  });

  it("仅允许字符与排除字符同时生效，并与字符类求交", () => {
    const opts = {
      ...DEFAULT_GEN_OPTS,
      length: 16,
      upper: false,
      lower: true,
      digits: true,
      symbols: true,
      excludeChars: "ae1",
      allowedChars: "abcde0123",
    };
    for (let i = 0; i < 50; i++) {
      const pw = generatePassword(opts);
      for (const c of pw) {
        expect("bcd023".includes(c)).toBe(true);
      }
    }
  });

  it("仅允许字符清空某类时自动跳过该类", () => {
    const opts = { ...DEFAULT_GEN_OPTS, length: 20, excludeChars: "", allowedChars: "abcd" };
    for (let i = 0; i < 30; i++) {
      const pw = generatePassword(opts);
      expect(/^[a-d]{20}$/.test(pw)).toBe(true);
    }
  });

  it("全部类被排除字符清空时抛错", () => {
    const opts = { length: 16, upper: false, lower: true, digits: false, symbols: false, excludeChars: "abcdefghijklmnopqrstuvwxyz" };
    expect(() => generatePassword(opts)).toThrow(/候选字符集为空/);
  });

  it("长度边界收敛（4-128）", () => {
    expect(generatePassword({ ...DEFAULT_GEN_OPTS, length: 1 }).length).toBe(4);
    expect(generatePassword({ ...DEFAULT_GEN_OPTS, length: 500 }).length).toBe(128);
  });
});

describe("strengthInfo（强度评级）", () => {
  it("熵估算与分级", () => {
    expect(estimateEntropyBits("")).toBe(0);
    const weak = strengthInfo("abc");
    expect(weak.label).toBe("弱");
    const mid = strengthInfo("abcdefg1"); // 8×log2(36)≈41 中
    expect(mid.label).toBe("中");
    const strong = strengthInfo("Abcdefgh1234"); // 12×log2(62)≈71 强
    expect(strong.label).toBe("强");
    const extreme = strengthInfo("Xk9$mQ2#vR7&pL4!zW1@");
    expect(extreme.label).toBe("极强");
    expect(extreme.bits).toBeGreaterThanOrEqual(80);
  });
});
