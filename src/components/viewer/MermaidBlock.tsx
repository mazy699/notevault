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
        mermaid.initialize({
          startOnLoad: false,
          theme: dark ? "dark" : "neutral",
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
