import { useTabs } from "../../stores/tabs";
import { MarkdownView, HtmlView, ImageView, TextView } from "./MarkdownView";
import { SourceView } from "./SourceView";
import { Outline } from "./Outline";
import { FileBar } from "./FileBar";
import { Welcome } from "./Welcome";
import { useUi } from "../../stores/ui";

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
    body = <MarkdownView content={fc.content} filePath={tab.path} dark={dark} />;
  } else if (tab.kind === "html") {
    body = <HtmlView path={tab.path} />;
  } else {
    body = <TextView content={fc.content} />;
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
