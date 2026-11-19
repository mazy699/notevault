import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyText } from "./FileBar";

let mermaidSeq = 0;

/**
 * Mermaid 图渲染块：动态加载 mermaid（首屏不加载 ~1MB 包），主题联动重渲染。
 */
export function MermaidBlock({ code, dark }: { code: string; dark: boolean }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

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
          setDone(true);
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
      <div className="cb-head" style={{ position: "absolute", top: 0, right: 0, border: "none", background: "transparent" }}>
        <span className="cb-lang">mermaid</span>
        <button
          className={`cb-copy${done ? " done" : ""}`}
          title="复制 Mermaid 源码"
          onClick={async () => {
            if (await copyText(code)) {
              setDone(true);
              setTimeout(() => setDone(false), 1400);
            }
          }}
        >
          {done ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
      {error ? (
        <div className="mm-error">Mermaid 渲染失败：{error}</div>
      ) : svg ? (
        <div
          ref={boxRef}
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
  );
}
