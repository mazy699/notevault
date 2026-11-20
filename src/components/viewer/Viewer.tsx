import { lazy, Suspense } from "react";
import { useTabs } from "../../stores/tabs";
import { useVault } from "../../stores/vault";
import { api } from "../../api/client";
import { HtmlView, ImageView } from "./SimpleViews";
import { SourceView } from "./SourceView";
import { Outline } from "./Outline";
import { FileBar } from "./FileBar";
import { Welcome } from "./Welcome";
import { useUi } from "../../stores/ui";

/**
 * Markdown 渲染栈（react-markdown + rehype 全家桶 + katex + highlight.js）
 * 体积较大，改为按需加载：仅打开 Markdown 文件时才拉取。
 */
const MarkdownView = lazy(() => import("./MarkdownView").then((m) => ({ default: m.MarkdownView })));

/** 当前激活文件的渲染路由 */
export function Viewer() {
  const { active, tabs, content, loading } = useTabs();
  const outlineOpen = useUi((s) => s.outlineOpen);
  const dark = useUi((s) => s.theme === "dark");
  const tab = tabs.find((t) => t.path === active);
  if (!tab) return <Welcome />;

  const fc = content[tab.path];
  const isLoading = loading[tab.path];
  const isMd = tab.kind === "markdown";

  let body: React.ReactNode;
  if (tab.kind === "image") {
    body = <ImageView path={tab.path} />;
  } else if (tab.kind === "other" && (!fc || fc.content === "")) {
    const nativePath = `${useVault.getState().info?.path ?? ""}\\${tab.path.replace(/\//g, "\\")}`;
    body = (
      <div className="empty-state">
        <div className="empty-card">
          <h1 style={{ fontSize: 18 }}>暂不支持预览 .{tab.name.split(".").pop() || "bin"} 文件</h1>
          <p>该文件类型没有内置预览，可在系统中用关联程序打开。</p>
          <button className="btn-ghost" onClick={() => void api.openExternal(nativePath)}>
            在系统中打开
          </button>
        </div>
      </div>
    );
  } else if (!fc) {
    body = (
      <div className="loading-hint" style={{ margin: "18px 44px" }}>
        {isLoading ? (
          <>
            <span className="spinner" /> 正在读取 {tab.name}…
          </>
        ) : (
          "暂无内容"
        )}
      </div>
    );
  } else if (tab.viewMode === "source") {
    body = <SourceView content={fc.content} kind={tab.kind} />;
  } else if (fc.truncated) {
    body = (
      <div className="error-box">
        文件过大（{Math.round(fc.size / 1024 / 1024)}MB），已截断渲染。请使用「源码」视图或外部编辑器查看完整内容。
        <pre style={{ marginTop: 10, whiteSpace: "pre-wrap", fontFamily: "var(--font-mono)", fontSize: 12 }}>{fc.content}</pre>
      </div>
    );
  } else if (isMd) {
    body = (
      <Suspense
        fallback={
          <div className="loading-hint" style={{ margin: "18px 44px" }}>
            <span className="spinner" /> 正在准备渲染引擎…
          </div>
        }
      >
        <MarkdownView content={fc.content} filePath={tab.path} dark={dark} />
      </Suspense>
    );
  } else if (tab.kind === "html") {
    body = <HtmlView path={tab.path} />;
  } else if (tab.kind === "code") {
    body = <SourceView content={fc.content} kind="code" path={tab.path} />;
  } else {
    body = <SourceView content={fc.content} kind={tab.kind} />;
  }

  const showOutline = isMd && tab.viewMode === "render" && outlineOpen;

  return (
    <div className="content-outer">
      <FileBar />
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div className="content" data-path={tab.path}>
          {body}
        </div>
        {showOutline && <Outline />}
      </div>
    </div>
  );
}
