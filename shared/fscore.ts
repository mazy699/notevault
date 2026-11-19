/**
 * 文件处理核心逻辑（纯函数，无 IO 依赖）。
 * Web 宿主直接使用；Rust 宿主按同样语义实现（见 src-tauri/src/fsops.rs）。
 */
import type { FileKind, SearchMatch } from "./types";
import { kindOf } from "./types";

/** 忽略的目录名（任意层级命中即跳过） */
export const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "dist",
  "out",
  "build",
  "target",
  ".next",
  ".nuxt",
  ".cache",
  ".idea",
  "__pycache__",
  ".venv",
  "venv",
]);

/** 目录树规模上限 */
export const MAX_TREE_ENTRIES = 20000;
/** 单文件读取上限（字节） */
export const MAX_READ_BYTES = 5 * 1024 * 1024;
/** 全文搜索单文件上限（字节） */
export const MAX_SEARCH_BYTES = 2 * 1024 * 1024;
/** 单文件最多命中数 */
export const MAX_MATCHES_PER_FILE = 8;
/** 搜索最多涉及文件数 */
export const MAX_SEARCH_FILES = 3000;

export function stripBom(bytes: Uint8Array): Uint8Array {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return bytes.slice(3);
  }
  return bytes;
}

function looksLikeBinary(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 8000);
  let suspicious = 0;
  for (let i = 0; i < n; i++) {
    const b = bytes[i];
    if (b === 0) return true;
    if (b < 9 || (b > 13 && b < 32)) suspicious++;
  }
  return n > 0 && suspicious / n > 0.08;
}

/**
 * 解码文本：UTF-8 优先（严格模式），失败回退 GBK（兼容旧 Windows 笔记）。
 */
export function decodeText(bytes: Uint8Array): { content: string; encoding: string } {
  const clean = stripBom(bytes);
  if (looksLikeBinary(clean)) return { content: "", encoding: "binary" };
  try {
    return { content: new TextDecoder("utf-8", { fatal: true }).decode(clean), encoding: "utf-8" };
  } catch {
    try {
      return { content: new TextDecoder("gbk").decode(clean), encoding: "gbk" };
    } catch {
      return { content: new TextDecoder("utf-8").decode(clean), encoding: "utf-8" };
    }
  }
}

/** 自然排序比较（数字段按数值、中文按拼音 locale；目录优先） */
export function naturalCompare(a: string, b: string, aIsDir = false, bIsDir = false): number {
  if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
  return a.localeCompare(b, "zh-Hans-CN", { numeric: true, sensitivity: "base" });
}

/** 规范化相对路径：反斜杠→斜杠、剥 ./、拒绝 .. 逃逸与控制字符；返回 null 表示非法 */
export function normalizeRelPath(input: string): string | null {
  const p = String(input).replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!p) return "";
  const parts: string[] = [];
  for (const seg of p.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") return null;
    if (/[<>:"|?*\u0000-\u001f]/.test(seg)) return null;
    parts.push(seg);
  }
  return parts.join("/");
}

/** 绝对路径合法性（Windows 盘符或 UNC） */
export function isAbsoluteFsPath(p: string): boolean {
  return /^([a-zA-Z]:[\\/]|\\\\)/.test(p);
}

/** 剥离 HTML 标签并保留分行的纯文本（供全文搜索） */
export function stripHtmlTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, (m) => m.replace(/[^\n]/g, ""))
    .replace(/<style[\s\S]*?<\/style>/gi, (m) => m.replace(/[^\n]/g, ""))
    .replace(/<title[\s\S]*?<\/title>/gi, (m) => m.replace(/[^\n]/g, ""))
    .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ""))
    .replace(/<(br|p|div|li|tr|h[1-6]|section|article|header|footer|table)[\s\S]*?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

/** 在单文件文本中查找所有命中（默认不区分大小写） */
export function findMatches(content: string, query: string, limit = MAX_MATCHES_PER_FILE, caseSensitive = false): SearchMatch[] {
  const q = caseSensitive ? query : query.toLowerCase();
  if (!q) return [];
  const lines = content.split(/\r\n|\r|\n/);
  const matches: SearchMatch[] = [];
  for (let i = 0; i < lines.length && matches.length < limit; i++) {
    const lower = caseSensitive ? lines[i] : lines[i].toLowerCase();
    let idx = lower.indexOf(q);
    if (idx === -1) continue;
    // 裁剪片段：命中词前后各留 ~60 字符
    const start = Math.max(0, idx - 60);
    const end = Math.min(lines[i].length, idx + q.length + 60);
    let text = lines[i].slice(start, end);
    if (start > 0) text = "…" + text;
    if (end < lines[i].length) text += "…";
    matches.push({ line: i + 1, text });
  }
  return matches;
}

/** 文件名排序用的 kind 优先级（目录处理在 naturalCompare 内） */
export function kindPriority(_kind: FileKind): number {
  return 0;
}

export { kindOf };
