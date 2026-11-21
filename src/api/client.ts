/**
 * 宿主适配层：同一套 call(cmd, payload) 契约自动路由到 Tauri invoke 或 HTTP API。
 */
import type { FileContent, FileNode, PwDb, SearchResult, Snapshot, VaultInfo } from "../../shared/types";

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
  /** Diff：按绝对路径读取任意文本/代码文件 */
  fsReadAbs: (path: string) => call<FileContent>("fs_read_abs", { path }),
  /** Diff：列举目录（路径智能提示用） */
  fsListDir: (dirPath: string) => call<{ entries: Array<{ name: string; dir: boolean }> }>("fs_list_dir", { dirPath }),
  /** Diff：列出 git 仓库跟踪的文件 */
  gitLs: (repoPath: string) => call<{ files: string[] }>("git_ls", { repoPath }),
  /** Diff：读取某文件在仓库中的提交历史（新→旧，最多 200 条） */
  gitLog: (repoPath: string, filePath: string) =>
    call<{ commits: Array<{ hash: string; subject: string; author: string; date: string }> }>("git_log", {
      repoPath,
      filePath,
    }),
  /** Diff：读取某文件在指定版本的内容（ref=提交 hash 或 "WORKDIR"） */
  gitShow: (repoPath: string, filePath: string, ref: string) =>
    call<FileContent>("git_show", { repoPath, filePath, ref }),
  /** 密码库：加载（加密库需主密码；db=null 表示需解锁/密码错误） */
  pwLoad: (masterPassword?: string) =>
    call<{ encrypted: boolean; db: PwDb | null; wrongPassword?: boolean }>("pw_load", { masterPassword }),
  /** 密码库：保存整库（提供主密码则加密写盘） */
  pwSave: (db: PwDb, masterPassword?: string | null) =>
    call<{ ok: boolean }>("pw_save", { db, masterPassword: masterPassword ?? null }),
  /** 桌面端：弹出"保存文件"对话框并写盘（Web 端返回 ok:false，由前端走浏览器下载） */
  saveTextFile: (defaultName: string, content: string) =>
    call<{ ok: boolean; path?: string }>("save_text_file", { defaultName, content }),

  // ---- Worklog 工作台：整库文件读写（sql.js 在前端运行，宿主只做字节落盘） ----
  wlDbLoad: () => call<{ dataDir: string; dbFile: string; b64: string | null }>("wl_db_load", {}),
  wlDbSave: (b64: string) => call<{ ok: boolean }>("wl_db_save", { b64 }),
  wlAuxRead: (name: string) => call<{ text: string | null }>("wl_aux_read", { name }),
  wlAuxWrite: (name: string, text: string) => call<{ ok: boolean }>("wl_aux_write", { name, text }),
  wlBackup: (b64: string) => call<{ path: string }>("wl_backup", { b64 }),
  wlDataInfo: () => call<{ dataDir: string; dbFile: string }>("wl_data_info", {}),
  /** AI 代理：宿主侧发起 HTTP（规避 WebView/浏览器 CORS），仅允许 http(s) */
  wlAiProxy: (req: { url: string; method?: string; headers?: Record<string, string>; body?: string }) =>
    call<{ status: number; body: string }>("wl_ai_proxy", req),
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
