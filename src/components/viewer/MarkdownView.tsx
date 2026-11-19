import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import rehypeHighlight from "rehype-highlight";
import { Code2 } from "lucide-react";
import { fileUrl, absFileUrl, isTauri, api } from "../../api/client";
import { useTabs } from "../../stores/tabs";
import { useVault } from "../../stores/vault";
import { MermaidBlock } from "./MermaidBlock";
import { copyText, CopyButton } from "./FileBar";

/** 是否为绝对路径（Windows 盘符 / file:// / 以 / 开头） */
export function absPathLike(src: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(src) || /^file:\/{2,}/i.test(src) || src.startsWith("/");
}

/** 还原 react-markdown 预编码的 URL（encodeURI 形式）后再做路径解析，避免双重编码 */
function safeDecode(s: string): string {
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

/** 在应用内打开库内链接（查树拿元数据；找不到则交给浏览器）；带锚点时滚动定位 */
function openInternalLink(relPath: string): void {
  const meta = findInTree(relPath);
  if (meta) {
    useTabs.getState().openFile(meta);
  } else {
    window.open(fileUrl(relPath), "_blank");
  }
}

export function findInTree(relPath: string):
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

/**
 * 滚动到标题锚点。Mermaid 等异步渲染会改变布局，
 * 所以在 ~2.5s 内反复校正滚动位置（每次 350ms）。
 */
function scrollToAnchor(hash: string, attempt: number): void {
  setTimeout(() => {
    const el = document.getElementById(hash);
    if (!el) {
      if (attempt < 6) scrollToAnchor(hash, attempt + 1);
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    // 布局仍在增长时继续校正
    if (attempt < 6 && el.getBoundingClientRect().top > 130) {
      scrollToAnchor(hash, attempt + 1);
    }
  }, 350);
}

/** 提取 hast 节点的纯文本（代码块复制用） */
function extractText(node: any): string {
  if (!node) return "";
  if (node.type === "text") return node.value ?? "";
  if (node.children) return node.children.map(extractText).join("");
  return "";
}

function langOf(node: any): string {
  const code = node?.children?.find((c: any) => c.tagName === "code");
  const classes: string[] = code?.properties?.className ?? [];
  for (const c of classes) {
    const m = /language-([\w+#-]+)/.exec(c);
    if (m) return m[1];
  }
  return "";
}

interface MarkdownViewProps {
  content: string;
  filePath: string;
  dark: boolean;
}

/** Markdown 完整渲染管线（GFM / 数学公式 / 内嵌 HTML / 代码高亮 / Mermaid / 链接路由） */
export const MarkdownView = memo(function MarkdownView({ content, filePath, dark }: MarkdownViewProps) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeKatex, rehypeSlug, [rehypeHighlight, { ignoreMissing: true }]]}
        components={{
          img: ({ src, alt, ...rest }) => {
            if (!src) return null;
            const raw = safeDecode(String(src));
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
                    el.style.cursor = "";
                  } else {
                    el.classList.add("zoomed");
                    el.style.maxWidth = "none";
                    el.style.cursor = "zoom-out";
                  }
                }}
              />
            );
          },
          a: ({ href, children, ...rest }) => {
            const raw = safeDecode(href ?? "");
            const external = /^https?:\/\//i.test(raw) || /^mailto:/i.test(raw) || absPathLike(raw);
            if (external) {
              const isHttp = /^https?:\/\//i.test(raw);
              const target = isHttp ? raw : absFileUrl(raw.replace(/^file:\/{2,}/i, ""));
              if (isTauri()) {
                // 桌面版：交给系统默认程序打开（URL→浏览器，本地路径→系统关联程序）
                const nativePath = raw.replace(/^file:\/{2,}/i, "").replace(/\//g, "\\");
                return (
                  <a
                    href={target}
                    onClick={(e) => {
                      e.preventDefault();
                      void api.openExternal(isHttp ? raw : nativePath);
                    }}
                    {...rest}
                  >
                    {children}
                  </a>
                );
              }
              return (
                <a href={target} target="_blank" rel="noreferrer" {...rest}>
                  {children}
                </a>
              );
            }
            const [pathPart, hash] = raw.split("#");
            const rel = pathPart ? resolveRelativeRef(pathPart, filePath) : filePath;
            const hrefAttr = rel ? fileUrl(rel) + (hash ? `#${encodeURIComponent(hash)}` : "") : "#";
            return (
              <a
                href={hrefAttr}
                onClick={(e) => {
                  e.preventDefault();
                  if (!rel) return;
                  if (!pathPart) {
                    scrollToAnchor(hash, 0);
                    return;
                  }
                  openInternalLink(rel);
                  if (hash) scrollToAnchor(hash, 0);
                }}
                {...rest}
              >
                {children}
              </a>
            );
          },
          pre: ({ node, children, ...rest }) => {
            const lang = langOf(node);
            const text = extractText(node);
            if (lang === "mermaid") {
              return <MermaidBlock code={text.trim()} dark={dark} />;
            }
            return (
              <div className="code-block">
                <div className="cb-head">
                  <span className="cb-lang">{lang || "text"}</span>
                  <CopyButton text={text} />
                </div>
                <pre {...rest}>{children}</pre>
              </div>
            );
          },
          // 行内代码不套 code-block（pre 覆盖只影响块级）
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
          <button
            className="cb-copy"
            onClick={async () => {
              await copyText(content);
            }}
          >
            复制
          </button>
        </div>
        <pre>
          <code>{content}</code>
        </pre>
      </div>
    </div>
  );
}
