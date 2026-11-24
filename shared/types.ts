/**
 * NoteVault API 契约 —— 前端与两个宿主（Web / Tauri）共用的唯一契约。
 * 所有命令都是 call(cmd, payload) → Promise<result> 的形式。
 *
 * 路径约定：
 * - fs_* 命令的 path 参数均为「相对笔记库根」的 POSIX 风格路径（a/b/c.md）
 * - 仅 vault_set / open_external / reveal_in_explorer 接受绝对路径
 */

export type FileKind = "markdown" | "html" | "text" | "image" | "code" | "other";

/** 代码/配置类扩展名（带语法高亮预览），与 Rust 端 fsops.rs 保持一致 */
export const CODE_EXTS = [
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "py", "pyw", "java", "kt", "kts", "scala", "sc", "groovy",
  "c", "h", "cpp", "hpp", "cc", "hh", "cs",
  "go", "rs", "rb", "php", "swift", "dart",
  "lua", "pl", "pm", "r", "vb",
  "sh", "bash", "zsh", "ps1", "psm1", "bat", "cmd",
  "sql", "json", "yaml", "yml", "toml",
  "vue", "svelte", "gradle", "cmake", "asm", "s",
] as const;

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
  if ((CODE_EXTS as readonly string[]).includes(ext)) return "code";
  if (["txt", "log", "csv", "ini", "cfg"].includes(ext)) return "text";
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"].includes(ext)) return "image";
  return "other";
}

/** 可作为文本读取渲染的 kind（含代码/配置文件，全文搜索也覆盖这些） */
export function isTextKind(kind: FileKind): boolean {
  return kind === "markdown" || kind === "html" || kind === "text" || kind === "code";
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
  "fs_read_abs",
  "fs_list_dir",
  "git_ls",
  "git_log",
  "git_show",
  "git_branch",
  "settings_get",
  "settings_set",
  "reveal_in_explorer",
  "open_external",
  "pw_load",
  "pw_save",
  "save_text_file",
  "wl_db_load",
  "wl_db_save",
  "wl_aux_read",
  "wl_aux_write",
  "wl_backup",
  "wl_data_info",
  "wl_ai_proxy",
] as const;

export type Command = (typeof COMMANDS)[number];

/** 密码库：单条历史密码（被替换时自动入史，记录完整使用区间） */
export interface PwHistory {
  password: string;
  /** 开始使用时间（该密码启用时间） */
  startedAt: number;
  /** 结束使用时间（被替换时间） */
  endedAt: number;
}

/** 密码库：单条凭证 */
export interface PwEntry {
  id: string;
  title: string;
  /** 分类：邮箱 / 工号系统 / 数据库 / 服务器 / 网站 / 其他…（可自定义） */
  category: string;
  account: string;
  password: string;
  url?: string;
  notes?: string;
  /** 当前密码更新时间 */
  updatedAt: number;
  createdAt: number;
  /** 历史密码（旧→新追加） */
  history: PwHistory[];
}

/** 密码库整库（明文 JSON 结构） */
export interface PwDb {
  format: "notevault-pw-v1";
  entries: PwEntry[];
  updatedAt: number;
  /**
   * 手动排序（条目 id，从前往后，Issue #9）。
   * 缺省时按 updatedAt 倒序（旧库兼容）；一旦用户拖动即写入并持久化。
   * 新建凭证插入最前；导入新增条目按来源顺序追加。
   */
  order?: string[];
}

/** git log 单条提交 */
export interface GitCommit {
  /** 完整 hash */
  hash: string;
  /** 提交主题（首行） */
  subject: string;
  author: string;
  date: string;
}

/** git_branch：给定目录（或文件所在目录）的仓库与分支信息 */
export interface GitBranchInfo {
  /** 是否位于 Git 工作区内 */
  inRepo: boolean;
  /** 当前分支名（分离头指针时为 "HEAD"） */
  branch: string | null;
  /** 分离头指针（branch 为 "HEAD"） */
  detached?: boolean;
  /** 仓库根目录（可选返回） */
  root?: string | null;
}
