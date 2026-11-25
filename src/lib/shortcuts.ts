/** 全局/工作台快捷键映射（纯函数，便于单测） */
import type { Workbench } from "../stores/ui";

export const WORKBENCH_SHORTCUTS: ReadonlyArray<{ key: string; workbench: Workbench; label: string }> = [
  { key: "1", workbench: "read", label: "读取" },
  { key: "2", workbench: "diff", label: "对比" },
  { key: "3", workbench: "pw", label: "密码" },
  { key: "4", workbench: "worklog", label: "工作日志" },
  { key: "5", workbench: "snippets", label: "常用语" },
];

interface Mods {
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

/** Alt+1~5 → 工作台；其他组合（含 Ctrl/Meta/Shift）一律不处理 */
export function workbenchFromShortcut(key: string, mods: Mods): Workbench | null {
  if (!mods.altKey || mods.ctrlKey || mods.metaKey || mods.shiftKey) return null;
  return WORKBENCH_SHORTCUTS.find((s) => s.key === key)?.workbench ?? null;
}

/** 活动栏 tooltip 用的快捷键文本（如 Alt+3） */
export function workbenchShortcutHint(wb: Workbench): string {
  const hit = WORKBENCH_SHORTCUTS.find((s) => s.workbench === wb);
  return hit ? `Alt+${hit.key}` : "";
}

export type SnippetShortcut = "search" | "new";

/**
 * 常用语工作台内快捷键：
 * - `/` 聚焦搜索；
 * - `N` 新建；
 * 在输入框/文本域内、或已有弹窗/详情打开时不拦截。
 */
export function snippetShortcut(key: string, mods: Mods, typing: boolean, blocked: boolean): SnippetShortcut | null {
  if (typing || blocked) return null;
  if (mods.altKey || mods.ctrlKey || mods.metaKey || mods.shiftKey) return null;
  if (key === "/") return "search";
  if (key.toLowerCase() === "n") return "new";
  return null;
}
