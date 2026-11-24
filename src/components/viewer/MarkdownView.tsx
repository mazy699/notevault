import { lazy, memo, Suspense } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeHighlight from "rehype-highlight";
import { fileUrl, absFileUrl } from "../../api/client";
import {
  absPathLike,
  openExternalLink,
  openInternalLink,
  resolveRelativeRef,
  resolveRootRelative,
  safeDecode,
} from "../../lib/links";
/** Mermaid 块懒加载：仅文档中确实含 mermaid 时才拉取 mermaid 内核（~700KB） */
const MermaidBlock = lazy(() => import("./MermaidBlock").then((m) => ({ default: m.MermaidBlock })));
import { CopyButton } from "./FileBar";
// KaTeX 样式随 Markdown 渲染栈一起按需加载（不在应用启动时引入）
import "katex/dist/katex.min.css";

/**
 * 消毒 schema：在默认（禁 script/事件处理器/javascript: URL）基础上，
 * 放行 AI 文档常用表现元素与 Mermaid/KaTeX/代码高亮所需的 class。
 */
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "details", "summary", "mark", "kbd", "u", "ins", "sub", "sup",
    "center", "figure", "figcaption", "font", "span", "div",
    "math", "semantics", "mrow", "mi", "mn", "mo", "ms", "mtext",
    "annotation", "mfrac", "msqrt", "mroot", "msub", "msup", "msubsup",
    "munder", "mover", "munderover", "mtable", "mtr", "mtd", "mspace", "mstyle",
  ],
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "className", "style", "id", "align", "width", "height"],
    input: [...(defaultSchema.attributes?.input ?? []), "type", "checked", "disabled"],
    math: ["xmlns", "display"],
    annotation: ["encoding"],
  },
};

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
    if (attempt < 6 && el.getBoundingClientRect().top > 130) {
      scrollToAnchor(hash, attempt + 1);
    }
  }, 350);
}

interface MarkdownViewProps {
  content: string;
  filePath: string;
  dark: boolean;
}

/** Markdown 完整渲染管线（GFM / 数学公式 / 消毒后的内嵌 HTML / 代码高亮 / Mermaid / 链接路由） */
export const MarkdownView = memo(function MarkdownView({ content, filePath, dark }: MarkdownViewProps) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, sanitizeSchema],
          rehypeKatex,
          rehypeSlug,
          [rehypeHighlight, { ignoreMissing: true }],
        ]}
        components={{
          img: ({ src, alt, ...rest }) => {
            if (!src) return null;
            const raw = safeDecode(String(src));
            let resolved: string;
            if (/^https?:\/\//i.test(raw)) {
              resolved = raw;
            } else if (absPathLike(raw)) {
              resolved = absFileUrl(raw.replace(/^file:\/{2,}/i, ""));
            } else if (resolveRootRelative(raw)) {
              resolved = resolveRootRelative(raw)!;
            } else {
              const rel = resolveRelativeRef(raw, filePath);
              resolved = rel ? fileUrl(rel) : raw;
            }
            return (
              <img
                src={resolved}
                alt={alt ?? ""}
                loading="lazy"
                decoding="async"
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
            const rootRel = !absPathLike(raw) ? resolveRootRelative(raw) : null;
            const external =
              /^https?:\/\//i.test(raw) || /^mailto:/i.test(raw) || (absPathLike(raw) && !resolveRootRelative(raw));
            if (rootRel) {
              const [rootPath] = raw.split(/[?#]/);
              return (
                <a
                  href={rootRel}
                  onClick={(e) => {
                    e.preventDefault();
                    openInternalLink(safeDecode(rootPath).slice(1));
                  }}
                  {...rest}
                >
                  {children}
                </a>
              );
            }
            if (external) {
              const isHttp = /^https?:\/\//i.test(raw);
              const isMail = /^mailto:/i.test(raw);
              const target = isHttp || isMail ? raw : absFileUrl(raw.replace(/^file:\/{2,}/i, ""));
              return (
                <a
                  href={target}
                  onClick={(e) => {
                    // 统一交宿主处理：桌面版系统默认程序，Web 版新标签页（Issue #7）
                    e.preventDefault();
                    openExternalLink(raw);
                  }}
                  target={isHttp || isMail ? "_blank" : undefined}
                  rel="noreferrer"
                  {...rest}
                >
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
              return (
                <Suspense
                  fallback={
                    <div className="mermaid-block">
                      <div className="loading-hint">
                        <span className="spinner" /> 正在加载图表引擎…
                      </div>
                    </div>
                  }
                >
                  <MermaidBlock code={text.trim()} dark={dark} />
                </Suspense>
              );
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
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
