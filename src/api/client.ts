/**
 * 宿主适配层：同一套 call(cmd, payload) 契约自动路由到 Tauri invoke 或 HTTP API。
 */
import type { FileContent, FileNode, SearchResult, Snapshot, VaultInfo } from "../../shared/types";

export function isTauri(): boolean {
  return typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
}

export function hostName(): string {
  return isTauri() ? "桌面版 (Tauri)" : "Web 版";
}

async function call<T>(cmd: string, payload?: Record<string, unknown>): Promise<T> {
  if (isTauri()) {
    return (await window.__TAURI_INTERNALS__!.invoke("api", { cmd, payload: payload ?? {} })) as T;
  }
  const res = await fetch(`/api/${cmd}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data && typeof data === "object" && "error" in data ? String(data.error) : null) || `请求失败 (${res.status})`);
  }
  return data as T;
}

export const api = {
  ping: () => call<{ ok: boolean; host: string; version: string }>("__ping"),
  vaultInfo: (path?: string) => call<VaultInfo | null>("vault_info", path ? { path } : {}),
  vaultPick: () => call<VaultInfo | null>("vault_pick"),
  vaultSet: (path: string) => call<VaultInfo>("vault_set", { path }),
  vaultList: () => call<string[]>("vault_list"),
  fsTree: () => call<FileNode>("fs_tree"),
  fsRead: (path: string) => call<FileContent>("fs_read", { path }),
  fsSnapshot: () => call<Snapshot>("fs_snapshot"),
  fsSearch: (query: string, caseSensitive?: boolean) => call<SearchResult>("fs_search", { query, caseSensitive }),
  settingsGet: (key: string) => call<string | null>("settings_get", { key }),
  settingsSet: (key: string, value: string) => call<null>("settings_set", { key, value }),
  revealInExplorer: (path: string) => call<null>("reveal_in_explorer", { path }),
  openExternal: (path: string) => call<null>("open_external", { path }),
};

/**
 * 笔记库内相对路径 → 可访问 URL（图片 / iframe / 相对链接共用）。
 * 逐段编码保留路径结构，保证 HTML 内相对引用能按目录正确解析。
 */
export function fileUrl(relPath: string): string {
  const encoded = relPath.split("/").map(encodeURIComponent).join("/");
  if (isTauri()) {
    // Tauri 自定义 vault 协议（Windows WebView2 形态），由 vault_proto.rs 提供
    return "http://vault.localhost/" + encoded;
  }
  return "/vault/" + encoded;
}

/** 库外绝对路径文件 → 可访问 URL（Markdown 中偶发的绝对路径引用） */
export function absFileUrl(absPath: string): string {
  if (isTauri()) {
    return "http://vault.localhost/~abs/" + encodeURIComponent(absPath);
  }
  return "/raw?path=" + encodeURIComponent(absPath);
}
