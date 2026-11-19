import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Code2 } from "lucide-react";
import { fileUrl, absFileUrl } from "../../api/client";
import { useTabs } from "../../stores/tabs";
import { useVault } from "../../stores/vault";

/** 是否为绝对路径（Windows 盘符 / file:// / 以 / 开头） */
export function absPathLike(src: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(src) || /^file:\/{2,}/i.test(src) || src.startsWith("/");
}

/** 相对引用 → 笔记库内相对路径（POSIX）；无法解析时返回 null */
export function resolveRelativeRef(href: string, currentPath: string): string | null {
  if (!href || /^https?:\/\//i.test(href) || /^mailto:/i.test(href) || /^data:/i.test(href)) return null;
  if (absPathLike(href)) return null;
  const [pathPart] = href.split("#");
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

/** 在应用内打开库内链接（查树拿元数据；找不到则交给浏览器） */
function openInternalLink(relPath: string): void {
  const meta = findInTree(relPath);
  if (meta) {
    useTabs.getState().openFile(meta);
  } else {
    window.open(fileUrl(relPath), "_blank");
  }
}

function findInTree(relPath: string):
  | { path: string; name: string; kind: any; size: number; mtimeMs: number }
  | null {
  const tree = useVault.getState().tree;
  if (!tree) return null;
  const stack = [tree];
  while (stack.length) {
    const n = stack.pop()!;
    if (!n.dir && n.path === relPath) return n;
    if (n.children) stack.push(...n.children);
  }
  return null;
}

interface MarkdownViewProps {
  content: string;
  /** 当前文件在库内的相对路径（图片/链接相对定位基准） */
  filePath: string;
}

/** Markdown 渲染（阶段2继续扩展：mermaid / 代码高亮 / 公式 / 大纲锚点） */
export const MarkdownView = memo(function MarkdownView({ content, filePath }: MarkdownViewProps) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: ({ src, alt, ...rest }) => {
            if (!src) return null;
            const raw = String(src);
            let resolved: string;
            if (/^https?:\/\//i.test(raw)) {
              resolved = raw;
            } else if (absPathLike(raw)) {
              resolved = absFileUrl(raw.replace(/^file:\/{2,}/i, ""));
            } else {
              const rel = resolveRelativeRef(raw, filePath);
              resolved = rel ? fileUrl(rel) : raw;
            }
            return (
              <img
                src={resolved}
                alt={alt ?? ""}
                loading="lazy"
                {...rest}
                onClick={(e) => {
                  const el = e.currentTarget;
                  if (el.classList.contains("zoomed")) {
                    el.classList.remove("zoomed");
                    el.style.maxWidth = "";
                    el.style.maxHeight = "";
                  } else {
                    el.classList.add("zoomed");
                    el.style.maxWidth = "none";
                    el.style.maxHeight = "none";
                    el.style.cursor = "zoom-out";
                  }
                }}
              />
            );
          },
          a: ({ href, children, ...rest }) => {
            const raw = href ?? "";
            const external = /^https?:\/\//i.test(raw) || /^mailto:/i.test(raw) || absPathLike(raw);
            if (external) {
              const isHttp = /^https?:\/\//i.test(raw);
              const target = isHttp ? raw : absFileUrl(raw.replace(/^file:\/{2,}/i, ""));
              return (
                <a href={target} target="_blank" rel="noreferrer" {...rest}>
                  {children}
                </a>
              );
            }
            const rel = resolveRelativeRef(raw, filePath);
            return (
              <a
                href={rel ? fileUrl(rel) : "#"}
                onClick={(e) => {
                  e.preventDefault();
                  if (rel) openInternalLink(rel);
                }}
                {...rest}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

/** HTML 文件：浏览器内核 iframe 渲染 */
export function HtmlView({ path }: { path: string }) {
  return (
    <>
      <div className="html-notice">
        <Code2 size={13} style={{ color: "var(--warn)" }} />
        已使用浏览器内核渲染此 HTML 文件 · 工具条可切换源码或在系统浏览器打开
      </div>
      <iframe
        className="html-frame"
        src={fileUrl(path)}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        title="HTML 预览"
      />
    </>
  );
}

/** 图片文件 */
export function ImageView({ path }: { path: string }) {
  return (
    <div className="img-view">
      <img src={fileUrl(path)} alt={path} />
    </div>
  );
}

/** 纯文本 */
export function TextView({ content }: { content: string }) {
  return (
    <div className="source-view">
      <div className="code-block">
        <div className="cb-head">
          <span className="cb-lang">text</span>
        </div>
        <pre>
          <code>{content}</code>
        </pre>
      </div>
    </div>
  );
}
