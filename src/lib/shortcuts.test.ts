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

describe("snippetShortcut（Ctrl+P 检索、Ctrl+N 新建）", () => {
  it("普通状态：Ctrl+P 检索、Ctrl+N 新建（Meta 同样支持）", () => {
    expect(snippetShortcut("p", { ctrlKey: true }, false)).toBe("search");
    expect(snippetShortcut("P", { metaKey: true }, false)).toBe("search");
    expect(snippetShortcut("n", { ctrlKey: true }, false)).toBe("new");
    expect(snippetShortcut("N", { ctrlKey: true }, false)).toBe("new");
    expect(snippetShortcut("x", { ctrlKey: true }, false)).toBeNull();
  });

  it("弹窗打开 / 无 Ctrl/Meta / 带 Alt/Shift 时不处理", () => {
    expect(snippetShortcut("p", { ctrlKey: true }, true)).toBeNull();
    expect(snippetShortcut("n", { ctrlKey: true }, true)).toBeNull();
    expect(snippetShortcut("n", {}, false)).toBeNull();
    expect(snippetShortcut("n", { ctrlKey: true, altKey: true }, false)).toBeNull();
    expect(snippetShortcut("n", { ctrlKey: true, shiftKey: true }, false)).toBeNull();
  });
});
