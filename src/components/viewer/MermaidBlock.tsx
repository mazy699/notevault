import { useEffect, useState } from "react";
import { CopyButton } from "./FileBar";

let mermaidSeq = 0;

/**
 * Mermaid 图渲染块：动态加载 mermaid（首屏不加载 ~1MB 包），主题联动重渲染。
 * 结构与代码块一致：块顶工具栏（左：语言标签 / 右：复制 Mermaid 源码按钮）+ 图表区域。
 */
export function MermaidBlock({ code, dark }: { code: string; dark: boolean }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        // 图表配色微调：饼图两主题统一亮色盘（dark 默认扇区过暗、neutral 默认全灰），
        // 文字随主题；深色甘特图任务条默认发白、文字对比不足——覆盖为品牌色系
        const themeVariables: Record<string, string> = {
          pie1: "#7c6fd6",
          pie2: "#e0a458",
          pie3: "#54b3b6",
          pie4: "#d67ba8",
          pie5: "#8fbf6f",
          pie6: "#c993d6",
          pie7: "#6b9be0",
          pie8: "#e08b6b",
          pie9: "#a3d66b",
          pie10: "#bd6bd6",
          pie11: "#d6c26b",
          pie12: "#6bd0d6",
          pieSectionTextColor: "#12131a",
          pieTitleTextColor: dark ? "#e6e6f0" : "#1a1a24",
          pieLegendTextColor: dark ? "#c9cad4" : "#3a3b46",
          pieStrokeColor: dark ? "#12131a" : "#ffffff",
          ...(dark
            ? {
                sectionBkgColor: "rgba(124, 111, 214, 0.08)",
                altSectionBkgColor: "rgba(255, 255, 255, 0.03)",
                gridColor: "#4a4b55",
                todayLineColor: "#e0a458",
                taskBkgColor: "#7c6fd6",
                taskBorderColor: "#9d92e6",
                taskTextColor: "#12131a",
                taskTextDarkColor: "#e6e6f0",
                taskTextOutsideColor: "#c9cad4",
                activeTaskBkgColor: "#e0a458",
                activeTaskBorderColor: "#f0c58a",
                doneTaskBkgColor: "#4a4b55",
                doneTaskBorderColor: "#6a6b75",
                critBkgColor: "#d67ba8",
                critBorderColor: "#e79cc0",
              }
            : {}),
        };
        mermaid.initialize({
          startOnLoad: false,
          theme: dark ? "dark" : "neutral",
          themeVariables,
          securityLevel: "strict",
          fontFamily: '"Segoe UI", "Microsoft YaHei", system-ui, sans-serif',
          flowchart: { htmlLabels: true, useMaxWidth: true },
          sequence: { useMaxWidth: true },
          gantt: { useMaxWidth: true },
          pie: { useMaxWidth: true },
        });
        const id = `nv-mmd-${++mermaidSeq}`;
        const { svg } = await mermaid.render(id, code);
        // 无论组件是否已卸载，都清理 mermaid 残留在 body 的临时元素
        document.getElementById(`d${id}`)?.remove();
        if (!cancelled) {
          setSvg(svg);
        }
      } catch (e) {
        if (!cancelled) {
          setSvg(null);
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, dark]);

  return (
    <div className="mermaid-block">
      <div className="cb-head">
        <span className="cb-lang">mermaid</span>
        {error ? <span className="mm-flag">渲染失败</span> : null}
        <CopyButton text={code} label="复制源码" className="cb-copy labeled" title="复制 Mermaid 源码" />
      </div>
      <div className="mm-body">
        {error ? (
          <div className="mm-error">Mermaid 渲染失败：{error}</div>
        ) : svg ? (
          <div
            className="mm-svg"
            style={{ width: "100%", display: "flex", justifyContent: "center" }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="loading-hint">
            <span className="spinner" /> 正在渲染图表…
          </div>
        )}
      </div>
    </div>
  );
}
