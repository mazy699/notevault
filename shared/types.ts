/**
 * NoteVault API 契约 —— 前端与两个宿主（Web / Tauri）共用的唯一契约。
 * 所有命令都是 call(cmd, payload) → Promise<result> 的形式。
 *
 * 路径约定：
 * - fs_* 命令的 path 参数均为「相对笔记库根」的 POSIX 风格路径（a/b/c.md）
 * - 仅 vault_set / open_external / reveal_in_explorer 接受绝对路径
 */

export type FileKind = "markdown" | "html" | "text" | "image" | "other";

export interface FileMeta {
  /** 相对笔记库根的 POSIX 路径，如 "docs/设计.md" */
  path: string;
  /** 文件名（含扩展名） */
  name: string;
  kind: FileKind;
  size: number;
  mtimeMs: number;
}

export interface FileNode extends FileMeta {
  dir: boolean;
  children: FileNode[] | null;
}

export interface VaultInfo {
  /** 笔记库绝对路径（Windows 下为原生分隔符） */
  path: string;
  name: string;
  fileCount: number;
}

export interface FileContent extends FileMeta {
  /** 文本内容（kind 为 image/other 时为空串） */
  content: string;
  /** 是否因超过大小上限被截断 */
  truncated: boolean;
  /** 实际使用的解码：utf-8 / gbk */
  encoding: string;
}

export interface SearchMatch {
  /** 1-based 行号（HTML 为剥离标签后的虚拟行） */
  line: number;
  /** 命中行文本（已裁剪上下文，命中词可用 query 二次高亮） */
  text: string;
}

export interface SearchHit {
  path: string;
  name: string;
  kind: FileKind;
  matches: SearchMatch[];
}

export interface SearchResult {
  hits: SearchHit[];
  fileCount: number;
  matchCount: number;
  /** 结果被截断（超过上限） */
  truncated: boolean;
  elapsedMs: number;
}

export interface FileStatEntry {
  mtimeMs: number;
  size: number;
}

export interface Snapshot {
  /** path → mtime/size（不含忽略目录） */
  entries: Record<string, FileStatEntry>;
  truncated: boolean;
}

/** 文件分类规则：由扩展名决定 kind（无扩展名 → other，与 Rust 端语义一致） */
export function kindOf(name: string): FileKind {
  const i = name.lastIndexOf(".");
  const ext = i === -1 ? "" : name.slice(i + 1).toLowerCase();
  if (["md", "markdown", "mdx"].includes(ext)) return "markdown";
  if (["html", "htm"].includes(ext)) return "html";
  if (["txt", "log", "json", "yaml", "yml", "toml", "csv", "ini", "cfg"].includes(ext)) return "text";
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"].includes(ext)) return "image";
  return "other";
}

/** 可作为文本读取渲染的 kind */
export function isTextKind(kind: FileKind): boolean {
  return kind === "markdown" || kind === "html" || kind === "text";
}

/** API 命令名清单（编译期保证前后端一致用） */
export const COMMANDS = [
  "__ping",
  "vault_info",
  "vault_pick",
  "vault_set",
  "vault_list",
  "fs_tree",
  "fs_read",
  "fs_stat",
  "fs_snapshot",
  "fs_search",
  "settings_get",
  "settings_set",
  "reveal_in_explorer",
  "open_external",
] as const;

export type Command = (typeof COMMANDS)[number];
