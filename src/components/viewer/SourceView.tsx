import { useMemo } from "react";
import hljs from "highlight.js/lib/common";
import { CopyButton } from "./FileBar";

const LANG_MAP: Record<string, string> = {
  markdown: "markdown",
  md: "markdown",
  html: "xml",
  htm: "xml",
  text: "plaintext",
};

/** 源码视图：语法高亮（highlight.js） */
export function SourceView({ content, kind }: { content: string; kind: string }) {
  const lang = LANG_MAP[kind] ?? "plaintext";
  const html = useMemo(() => {
    try {
      if (lang !== "plaintext" && hljs.getLanguage(lang)) {
        return hljs.highlight(content, { language: lang, ignoreIllegals: true }).value;
      }
      return content
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    } catch {
      return content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
  }, [content, lang]);

  return (
    <div className="source-view">
      <div className="code-block">
        <div className="cb-head">
          <span className="cb-lang">{kind === "html" ? "html" : "markdown"}</span>
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
