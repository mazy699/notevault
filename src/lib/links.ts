/** 笔记库路径/链接解析工具（与渲染组件解耦，避免启动期加载 Markdown 渲染栈） */
import type { FileKind } from "../../shared/types";
import { fileUrl, isTauri } from "../api/client";
import { useVault } from "../stores/vault";
import { useTabs } from "../stores/tabs";

export interface TreeFileMeta {
  path: string;
  name: string;
  kind: FileKind;
  size: number;
  mtimeMs: number;
}

/** 在目录树中按相对路径查文件元数据 */
export function findInTree(relPath: string): TreeFileMeta | null {
  const tree = useVault.getState().tree;
  if (!tree) return null;
  const stack = [tree];
  while (stack.length) {
    const n = stack.pop()!;
    if (!n.dir && n.path === relPath) {
      return { path: n.path, name: n.name, kind: n.kind, size: n.size, mtimeMs: n.mtimeMs };
    }
    if (n.children) stack.push(...n.children);
  }
  return null;
}

/** 应用内打开库内链接；树中找不到时回退浏览器打开 */
export function openInternalLink(relPath: string): void {
  const meta = findInTree(relPath);
  if (meta) {
    useTabs.getState().openFile(meta);
    useVault.getState().expandPath(relPath);
  } else {
    window.open(fileUrl(relPath), "_blank");
  }
}

/** 是否为文件系统绝对路径（Windows 盘符 / file://）。以 / 开头的引用优先按库根相对解析。 */
export function absPathLike(src: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(src) || /^file:\/{2,}/i.test(src);
}

/** 还原 URL 中被 encodeURI 预编码的部分（避免双重编码） */
export function safeDecode(s: string): string {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}

/** 相对引用 → 笔记库内相对路径（POSIX）；无法解析时返回 null */
export function resolveRelativeRef(href: string, currentPath: string): string | null {
  if (!href || /^https?:\/\//i.test(href) || /^mailto:/i.test(href) || /^data:/i.test(href)) return null;
  if (absPathLike(href)) return null;
  const [pathPart] = safeDecode(href).split("#");
  if (!pathPart) return null;
  const dir = currentPath.includes("/") ? currentPath.slice(0, currentPath.lastIndexOf("/")).split("/") : [];
  const segments = [...dir];
  for (const seg of pathPart.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") segments.pop();
    else segments.push(seg);
  }
  return segments.join("/");
}

/** 库根相对路径（以 / 开头）→ 若库内存在该文件则返回库内 URL，否则 null */
export function resolveRootRelative(src: string): string | null {
  if (!src.startsWith("/")) return null;
  const [pathPart] = safeDecode(src).split(/[?#]/);
  const rel = pathPart.slice(1);
  return rel && findInTree(rel) ? fileUrl(rel) : null;
}

/** 外部链接打开方式：桌面版交系统默认程序，Web 版新标签页 */
export function openExternalLink(raw: string): void {
  const isHttp = /^https?:\/\//i.test(raw);
  if (isTauri()) {
    const nativePath = raw.replace(/^file:\/{2,}/i, "").replace(/\//g, "\\");
    void import("../api/client").then(({ api }) => api.openExternal(isHttp ? raw : nativePath));
  } else {
    window.open(raw, "_blank", "noreferrer");
  }
}

/** HTML 预览内链接的解析结果（库内 / 外部；null 表示忽略） */
export type PreviewLinkTarget = { kind: "internal"; path: string } | { kind: "external"; href: string } | null;

/**
 * 解析 HTML 预览 iframe 转交的原始 href（Issue #7）：
 * - 库内相对路径 / 以 / 开头的库根相对路径且文件存在 → internal（走标签机制）
 * - http(s)/mailto/file/绝对路径 → external（交系统浏览器或新标签页）
 * - 纯锚点、空链接、javascript/data 等 → null（维持 iframe 内默认行为/忽略）
 * exists 由调用方注入，便于纯函数测试。
 */
export function classifyPreviewHref(
  raw: string,
  currentPath: string,
  exists: (relPath: string) => boolean
): PreviewLinkTarget {
  const href = raw.trim();
  if (!href || href.startsWith("#")) return null;
  if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href) || absPathLike(href)) {
    return { kind: "external", href };
  }
  // 协议相对链接 //example.com/x：按 https 处理，避免被当成库内路径
  if (href.startsWith("//")) return { kind: "external", href: "https:" + href };
  if (/^(javascript|data|blob|about|vbscript):/i.test(href)) return null;
  const [pathPartRaw] = href.split(/[?#]/);
  const pathPart = safeDecode(pathPartRaw);
  if (!pathPart) return null;
  if (pathPart.startsWith("/")) {
    const rel = pathPart.slice(1);
    return rel && exists(rel) ? { kind: "internal", path: rel } : null;
  }
  const rel = resolveRelativeRef(pathPart, currentPath);
  return rel && exists(rel) ? { kind: "internal", path: rel } : null;
}

/** 处理 HTML 预览内点击（parent 侧）：库内新标签打开，外链交宿主 */
export function openPreviewHref(raw: string, currentPath: string): void {
  const target = classifyPreviewHref(raw, currentPath, (rel) => !!findInTree(rel));
  if (!target) return;
  if (target.kind === "internal") openInternalLink(target.path);
  else openExternalLink(target.href);
}
