/** 应用设置（启用工作台 / 自定义快捷键）的默认值与规范化（纯函数） */
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_DEFS,
  WORKBENCH_SWITCH_IDS,
  normalizeShortcut,
  type ShortcutActionId,
  type WorkbenchSwitchId,
} from "./shortcuts";

export interface AppSettings {
  version: 1;
  enabled: Record<WorkbenchSwitchId, boolean>;
  shortcuts: Record<ShortcutActionId, string>;
}

/** 默认：全部工作台启用；工作台 Alt+Shift+1~5，常用语 Ctrl+P / Ctrl+N */
export function defaultAppSettings(): AppSettings {
  return {
    version: 1,
    enabled: { read: true, diff: true, pw: true, worklog: true, snippets: true },
    shortcuts: { ...DEFAULT_SHORTCUTS },
  };
}

/**
 * 规范化设置：损坏/缺失字段回退默认；读取工作台强制启用；
 * 快捷键空串表示禁用，非法值回退默认绑定。
 */
export function normalizeAppSettings(raw: unknown): AppSettings {
  const out = defaultAppSettings();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const obj = raw as Record<string, unknown>;

  if (obj.enabled && typeof obj.enabled === "object" && !Array.isArray(obj.enabled)) {
    const enabled = obj.enabled as Record<string, unknown>;
    for (const wb of WORKBENCH_SWITCH_IDS) {
      if (wb === "read") {
        out.enabled[wb] = true;
        continue;
      }
      if (typeof enabled[wb] === "boolean") out.enabled[wb] = enabled[wb] as boolean;
    }
  }

  if (obj.shortcuts && typeof obj.shortcuts === "object" && !Array.isArray(obj.shortcuts)) {
    const shortcuts = obj.shortcuts as Record<string, unknown>;
    for (const def of SHORTCUT_DEFS) {
      const value = shortcuts[def.id];
      if (typeof value !== "string") continue;
      if (value.trim() === "") {
        out.shortcuts[def.id] = "";
        continue;
      }
      const normalized = normalizeShortcut(value);
      out.shortcuts[def.id] = normalized ?? def.defaultBinding;
    }
  }
  return out;
}
