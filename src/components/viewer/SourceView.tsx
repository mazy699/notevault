import { useMemo } from "react";
import hljs from "highlight.js/lib/common";
import { CopyButton } from "./FileBar";

/** 扩展名 → highlight.js 语言（common 语言集内）；未映射的降级为纯文本 */
const EXT_LANG: Record<string, string> = {
  sql: "sql",
  py: "python",
  pyw: "python",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  hh: "cpp",
  cs: "csharp",
  go: "go",
  rs: "rust",
  rb: "ruby",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  kts: "kotlin",
  scala: "scala",
  sc: "scala",
  groovy: "groovy",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  ps1: "powershell",
  psm1: "powershell",
  bat: "ini",
  cmd: "ini",
  lua: "lua",
  pl: "perl",
  pm: "perl",
  r: "r",
  vb: "vbnet",
  dart: "dart",
  vue: "xml",
  svelte: "xml",
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "ini",
  gradle: "groovy",
  cmake: "makefile",
  mk: "makefile",
  xml: "xml",
  svg: "xml",
  css: "css",
  less: "less",
  scss: "scss",
  html: "xml",
  htm: "xml",
  md: "markdown",
  markdown: "markdown",
};

const KIND_LANG: Record<string, string> = {
  markdown: "markdown",
  html: "xml",
};

/** 源码视图：语法高亮（highlight.js common 语言集） */
export function SourceView({ content, kind, path }: { content: string; kind: string; path?: string }) {
  const lang = useMemo(() => {
    if (kind === "code" && path) {
      const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
      return EXT_LANG[ext] ?? "plaintext";
    }
    return KIND_LANG[kind] ?? "plaintext";
  }, [kind, path]);

  const html = useMemo(() => {
    try {
      if (lang !== "plaintext" && hljs.getLanguage(lang)) {
        return hljs.highlight(content, { language: lang, ignoreIllegals: true }).value;
      }
      return content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    } catch {
      return content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
  }, [content, lang]);

  const label =
    kind === "code" && path
      ? path.slice(path.lastIndexOf(".") + 1).toLowerCase()
      : kind === "html"
        ? "html"
        : kind === "markdown"
          ? "markdown"
          : "text";

  return (
    <div className="source-view">
      <div className="code-block">
        <div className="cb-head">
          <span className="cb-lang">{lang === "plaintext" ? label : lang}</span>
          <span style={{ marginLeft: 10 }}>{content.length.toLocaleString()} 字符</span>
          <CopyButton text={content} />
        </div>
        <pre>
          <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} />
        </pre>
      </div>
    </div>
  );
}
