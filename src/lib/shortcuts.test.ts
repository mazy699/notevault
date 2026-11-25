import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHORTCUTS,
  matchesShortcut,
  normalizeShortcut,
  shortcutConflict,
  shortcutFromEvent,
  workbenchFromEvent,
} from "./shortcuts";

const allEnabled = { read: true, diff: true, pw: true, worklog: true, snippets: true };

describe("shortcutFromEvent / normalizeShortcut", () => {
  it("生成规范组合（修饰键顺序 / 字母大写）", () => {
    expect(shortcutFromEvent({ key: "p", ctrlKey: true })).toBe("Ctrl+P");
    expect(shortcutFromEvent({ key: "1", altKey: true, shiftKey: true })).toBe("Alt+Shift+1");
    expect(shortcutFromEvent({ key: "F2", ctrlKey: true })).toBe("Ctrl+F2");
    expect(shortcutFromEvent({ key: "p", ctrlKey: true, altKey: true, shiftKey: true })).toBe(
      "Ctrl+Alt+Shift+P"
    );
  });

  it("Shift+数字：优先 code，兼容 ! 等移位字符", () => {
    expect(shortcutFromEvent({ key: "!", code: "Digit1", altKey: true, shiftKey: true })).toBe("Alt+Shift+1");
    expect(shortcutFromEvent({ key: "!", altKey: true, shiftKey: true })).toBe("Alt+Shift+1");
    expect(shortcutFromEvent({ key: "@", altKey: true, shiftKey: true })).toBe("Alt+Shift+2");
    expect(normalizeShortcut("Alt+Shift+!")).toBe("Alt+Shift+1");
  });

  it("无修饰键 / 非法键返回 null", () => {
    expect(shortcutFromEvent({ key: "p" })).toBeNull();
    expect(shortcutFromEvent({ key: "Process", ctrlKey: true })).toBeNull();
    expect(shortcutFromEvent({ key: "+", ctrlKey: true })).toBeNull();
  });

  it("规范化配置文本", () => {
    expect(normalizeShortcut("control+p")).toBe("Ctrl+P");
    expect(normalizeShortcut("Shift+Alt+1")).toBe("Alt+Shift+1");
    expect(normalizeShortcut("cmd+shift+n")).toBe("Shift+Meta+N");
    expect(normalizeShortcut("P")).toBeNull();
    expect(normalizeShortcut("Ctrl+")).toBeNull();
    expect(normalizeShortcut("")).toBeNull();
  });

  it("matchesShortcut 匹配大小写与顺序差异", () => {
    expect(matchesShortcut({ key: "p", ctrlKey: true }, "control+p")).toBe(true);
    expect(matchesShortcut({ key: "1", altKey: true, shiftKey: true }, "Alt+Shift+1")).toBe(true);
    expect(matchesShortcut({ key: "1", altKey: true }, "Alt+Shift+1")).toBe(false);
  });
});

describe("默认绑定与冲突", () => {
  it("默认：工作台 Alt+Shift+1~5，常用语 Ctrl+P / Ctrl+N", () => {
    expect(DEFAULT_SHORTCUTS["workbench.read"]).toBe("Alt+Shift+1");
    expect(DEFAULT_SHORTCUTS["workbench.snippets"]).toBe("Alt+Shift+5");
    expect(DEFAULT_SHORTCUTS["snippets.search"]).toBe("Ctrl+P");
    expect(DEFAULT_SHORTCUTS["snippets.new"]).toBe("Ctrl+N");
  });

  it("重复绑定被识别（自身除外 / 空值不冲突）", () => {
    expect(shortcutConflict(DEFAULT_SHORTCUTS, "snippets.search", "Alt+Shift+1")).toBe("workbench.read");
    expect(shortcutConflict(DEFAULT_SHORTCUTS, "snippets.search", "Ctrl+P")).toBeNull();
    expect(shortcutConflict(DEFAULT_SHORTCUTS, "snippets.search", "")).toBeNull();
  });

  it("workbenchFromEvent 按启用状态与自定义绑定匹配", () => {
    expect(workbenchFromEvent({ key: "3", altKey: true, shiftKey: true }, DEFAULT_SHORTCUTS, allEnabled)).toBe("pw");
    expect(
      workbenchFromEvent({ key: "3", altKey: true, shiftKey: true }, DEFAULT_SHORTCUTS, { ...allEnabled, pw: false })
    ).toBeNull();
    const custom = { ...DEFAULT_SHORTCUTS, "workbench.pw": "Ctrl+Alt+9" };
    expect(workbenchFromEvent({ key: "9", ctrlKey: true, altKey: true }, custom, allEnabled)).toBe("pw");
    expect(workbenchFromEvent({ key: "p", ctrlKey: true }, DEFAULT_SHORTCUTS, allEnabled)).toBeNull();
  });
});
