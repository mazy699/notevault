import { describe, expect, it } from "vitest";
import { DEFAULT_SHORTCUTS } from "./shortcuts";
import { defaultAppSettings, normalizeAppSettings } from "./appSettings";

describe("appSettings 默认值与规范化", () => {
  it("默认全部工作台启用，快捷键为共识默认", () => {
    const s = defaultAppSettings();
    expect(s.enabled).toEqual({ read: true, diff: true, pw: true, worklog: true, snippets: true });
    expect(s.shortcuts).toEqual(DEFAULT_SHORTCUTS);
  });

  it("损坏/缺失设置回退默认，读取工作台强制启用", () => {
    expect(normalizeAppSettings(null).enabled.read).toBe(true);
    const s = normalizeAppSettings({ enabled: { read: false, diff: false, pw: "yes" } });
    expect(s.enabled.read).toBe(true);
    expect(s.enabled.diff).toBe(false);
    expect(s.enabled.pw).toBe(true);
  });

  it("快捷键：自定义保留并规范化，空串保留（禁用），非法值回退默认", () => {
    const s = normalizeAppSettings({
      shortcuts: {
        "workbench.read": "control+alt+8",
        "workbench.diff": "",
        "workbench.pw": "not-a-shortcut",
      },
    });
    expect(s.shortcuts["workbench.read"]).toBe("Ctrl+Alt+8");
    expect(s.shortcuts["workbench.diff"]).toBe("");
    expect(s.shortcuts["workbench.pw"]).toBe(DEFAULT_SHORTCUTS["workbench.pw"]);
    expect(s.shortcuts["snippets.search"]).toBe("Ctrl+P");
  });
});
