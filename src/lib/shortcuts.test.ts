import { describe, expect, it } from "vitest";
import { snippetShortcut, workbenchFromShortcut, workbenchShortcutHint, WORKBENCH_SHORTCUTS } from "./shortcuts";

const none = {};
const alt = { altKey: true };

describe("workbenchFromShortcut（Alt+1~5）", () => {
  it("五个工作台映射完整", () => {
    expect(WORKBENCH_SHORTCUTS.map((s) => s.key)).toEqual(["1", "2", "3", "4", "5"]);
    expect(workbenchFromShortcut("1", alt)).toBe("read");
    expect(workbenchFromShortcut("2", alt)).toBe("diff");
    expect(workbenchFromShortcut("3", alt)).toBe("pw");
    expect(workbenchFromShortcut("4", alt)).toBe("worklog");
    expect(workbenchFromShortcut("5", alt)).toBe("snippets");
  });

  it("无 Alt / 带 Ctrl/Meta/Shift / 越界键不处理", () => {
    expect(workbenchFromShortcut("3", none)).toBeNull();
    expect(workbenchFromShortcut("3", { altKey: true, ctrlKey: true })).toBeNull();
    expect(workbenchFromShortcut("3", { altKey: true, metaKey: true })).toBeNull();
    expect(workbenchFromShortcut("3", { altKey: true, shiftKey: true })).toBeNull();
    expect(workbenchFromShortcut("6", alt)).toBeNull();
  });

  it("tooltip 提示文本", () => {
    expect(workbenchShortcutHint("read")).toBe("Alt+1");
    expect(workbenchShortcutHint("snippets")).toBe("Alt+5");
  });
});

describe("snippetShortcut（/ 搜索、N 新建）", () => {
  it("普通状态：/ 搜索、n/N 新建", () => {
    expect(snippetShortcut("/", none, false, false)).toBe("search");
    expect(snippetShortcut("n", none, false, false)).toBe("new");
    expect(snippetShortcut("N", none, false, false)).toBe("new");
    expect(snippetShortcut("x", none, false, false)).toBeNull();
  });

  it("输入框内 / 弹窗打开 / 带修饰键时不拦截", () => {
    expect(snippetShortcut("/", none, true, false)).toBeNull();
    expect(snippetShortcut("n", none, true, false)).toBeNull();
    expect(snippetShortcut("n", none, false, true)).toBeNull();
    expect(snippetShortcut("n", { ctrlKey: true }, false, false)).toBeNull();
    expect(snippetShortcut("n", { altKey: true }, false, false)).toBeNull();
  });
});
