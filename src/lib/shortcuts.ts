/** 快捷键定义与匹配（纯函数，便于单测与设置页复用） */
import type { Workbench } from "../stores/ui";

/** 可通过快捷键切换的工作台（设置页本身不参与编号切换） */
export type WorkbenchSwitchId = Exclude<Workbench, "settings">;

export const WORKBENCH_SWITCH_IDS: readonly WorkbenchSwitchId[] = ["read", "diff", "pw", "worklog", "snippets"];

export type ShortcutActionId = `workbench.${WorkbenchSwitchId}` | "snippets.search" | "snippets.new";

export interface ShortcutDef {
  id: ShortcutActionId;
  label: string;
  /** global：任意工作台生效；snippets：仅常用语工作台生效 */
  scope: "global" | "snippets";
  defaultBinding: string;
}

export const SHORTCUT_DEFS: readonly ShortcutDef[] = [
  { id: "workbench.read", label: "切换到读取工作台", scope: "global", defaultBinding: "Alt+Shift+1" },
  { id: "workbench.diff", label: "切换到对比工作台", scope: "global", defaultBinding: "Alt+Shift+2" },
  { id: "workbench.pw", label: "切换到密码工作台", scope: "global", defaultBinding: "Alt+Shift+3" },
  { id: "workbench.worklog", label: "切换到工作日志", scope: "global", defaultBinding: "Alt+Shift+4" },
  { id: "workbench.snippets", label: "切换到常用语工作台", scope: "global", defaultBinding: "Alt+Shift+5" },
  { id: "snippets.search", label: "常用语快速检索", scope: "snippets", defaultBinding: "Ctrl+P" },
  { id: "snippets.new", label: "新建常用语", scope: "snippets", defaultBinding: "Ctrl+N" },
];

export const DEFAULT_SHORTCUTS: Record<ShortcutActionId, string> = {
  "workbench.read": "Alt+Shift+1",
  "workbench.diff": "Alt+Shift+2",
  "workbench.pw": "Alt+Shift+3",
  "workbench.worklog": "Alt+Shift+4",
  "workbench.snippets": "Alt+Shift+5",
  "snippets.search": "Ctrl+P",
  "snippets.new": "Ctrl+N",
};

export interface ShortcutEventLike {
  key: string;
  /** 物理键（如 Digit1 / KeyP），优先用于 Shift+数字等布局差异 */
  code?: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
}

export function workbenchActionId(wb: WorkbenchSwitchId): ShortcutActionId {
  return `workbench.${wb}`;
}

export function shortcutDef(id: ShortcutActionId): ShortcutDef {
  return SHORTCUT_DEFS.find((d) => d.id === id) ?? SHORTCUT_DEFS[0];
}

/** Shift+数字在不同键盘布局下 e.key 会变成 ! @ #…，统一映射回数字 */
const SHIFTED_DIGITS: Record<string, string> = {
  "!": "1",
  "@": "2",
  "#": "3",
  $: "4",
  "%": "5",
  "^": "6",
  "&": "7",
  "*": "8",
  "(": "9",
  ")": "0",
};

/** 仅接受字母 / 数字 / F1-F12（优先物理键 code，避免 Shift 后字符变化） */
function keyToken(key: string, code?: string): string | null {
  if (code) {
    const digit = /^Digit([0-9])$/.exec(code);
    if (digit) return digit[1];
    const letter = /^Key([A-Z])$/.exec(code);
    if (letter) return letter[1];
    const fn = /^F([1-9]|1[0-2])$/.exec(code);
    if (fn) return `F${fn[1]}`;
  }
  if (SHIFTED_DIGITS[key]) return SHIFTED_DIGITS[key];
  if (/^[a-z]$/i.test(key)) return key.toUpperCase();
  if (/^[0-9]$/.test(key)) return key;
  if (/^f([1-9]|1[0-2])$/i.test(key)) return key.toUpperCase();
  return null;
}

/** 从键盘事件生成规范化组合（至少一个修饰键）；不支持返回 null */
export function shortcutFromEvent(e: ShortcutEventLike): string | null {
  const token = keyToken(e.key, e.code);
  if (!token) return null;
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push("Meta");
  if (mods.length === 0) return null;
  return [...mods, token].join("+");
}

/** 规范化用户/配置中的组合（大小写、修饰键顺序、Control→Ctrl） */
export function normalizeShortcut(binding: string | null | undefined): string | null {
  if (!binding) return null;
  const parts = binding.split("+").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const token = keyToken(parts[parts.length - 1]);
  if (!token) return null;
  const mods = new Set<string>();
  for (const raw of parts.slice(0, -1)) {
    switch (raw.toLowerCase()) {
      case "ctrl":
      case "control":
        mods.add("Ctrl");
        break;
      case "alt":
        mods.add("Alt");
        break;
      case "shift":
        mods.add("Shift");
        break;
      case "meta":
      case "cmd":
      case "command":
        mods.add("Meta");
        break;
      default:
        return null;
    }
  }
  if (mods.size === 0) return null;
  const ordered = ["Ctrl", "Alt", "Shift", "Meta"].filter((m) => mods.has(m));
  return [...ordered, token].join("+");
}

export function matchesShortcut(e: ShortcutEventLike, binding: string | null | undefined): boolean {
  const normalized = normalizeShortcut(binding);
  return !!normalized && shortcutFromEvent(e) === normalized;
}

/** 返回冲突的动作 id（自身除外）；空绑定不冲突 */
export function shortcutConflict(
  shortcuts: Record<string, string>,
  action: ShortcutActionId,
  binding: string
): ShortcutActionId | null {
  const target = normalizeShortcut(binding);
  if (!target) return null;
  for (const def of SHORTCUT_DEFS) {
    if (def.id === action) continue;
    if (normalizeShortcut(shortcuts[def.id]) === target) return def.id;
  }
  return null;
}

/** 按键事件 → 已启用工作台（全局快捷键）；未匹配返回 null */
export function workbenchFromEvent(
  e: ShortcutEventLike,
  shortcuts: Record<string, string>,
  enabled: Record<WorkbenchSwitchId, boolean>
): WorkbenchSwitchId | null {
  const pressed = shortcutFromEvent(e);
  if (!pressed) return null;
  for (const wb of WORKBENCH_SWITCH_IDS) {
    if (!enabled[wb]) continue;
    if (normalizeShortcut(shortcuts[workbenchActionId(wb)]) === pressed) return wb;
  }
  return null;
}
