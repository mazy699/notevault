import { useState } from "react";
import { Check, Copy, ExternalLink, FolderOpen, Eye, FileCode2, ListTree } from "lucide-react";
import { api, isTauri } from "../../api/client";
import { useTabs } from "../../stores/tabs";
import { useVault } from "../../stores/vault";
import { useUi } from "../../stores/ui";

async function copyText(text: string): Promise<boolean> {
  try {
    if (isTauri()) {
      const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
      await writeText(text);
      return true;
    }
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export { copyText };

/** 复制按钮（带完成反馈） */
export function CopyButton({
  text,
  label,
  className = "cb-copy",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      className={`${className}${done ? " done" : ""}`}
      title="复制源码"
      onClick={async () => {
        const ok = await copyText(text);
        if (ok) {
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        }
      }}
    >
      {done ? <Check size={13} /> : <Copy size={13} />}
      {label ? <span>{done ? "已复制" : label}</span> : null}
    </button>
  );
}

/** 文件工具条：视图模式切换 + 复制源码 + 外部打开 */
export function FileBar() {
  const { active, tabs, content, setViewMode } = useTabs();
  const info = useVault((s) => s.info);
  const { outlineOpen, setOutlineOpen } = useUi();
  const tab = tabs.find((t) => t.path === active);
  if (!tab) return null;
  const raw = content[tab.path]?.content ?? "";

  const canRender = tab.kind === "markdown" || tab.kind === "html";
  const mode = tab.viewMode;

  return (
    <div className="filebar">
      {canRender ? (
        <div className="seg">
          <button className={mode === "render" ? "active" : ""} onClick={() => setViewMode("render")}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Eye size={13} />
              渲染
            </span>
          </button>
          <button className={mode === "source" ? "active" : ""} onClick={() => setViewMode("source")}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <FileCode2 size={13} />
              源码
            </span>
          </button>
        </div>
      ) : (
        <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
          {tab.kind === "image"
            ? "图片预览"
            : tab.kind === "code"
              ? "代码文件（语法高亮预览）"
              : "纯文本"}
        </span>
      )}

      <span className="filepath" title={`${info?.path ?? ""}\\${tab.path}`}>
        {tab.path}
      </span>

      <CopyButton text={raw} label="复制源码" className={`icon-btn labeled${raw ? "" : ""}`} />
      {tab.kind === "markdown" && mode === "render" && (
        <button
          className={`icon-btn${outlineOpen ? " active" : ""}`}
          title="大纲 (标题目录)"
          onClick={() => setOutlineOpen(!outlineOpen)}
        >
          <ListTree size={14} />
        </button>
      )}
      {tab.kind === "html" && (
        <button
          className="icon-btn labeled"
          title="在系统浏览器中打开"
          onClick={() => {
            if (isTauri()) void api.openExternal(`${info?.path ?? ""}\\${tab.path.replace(/\//g, "\\")}`);
            else window.open(`/vault/${tab.path.split("/").map(encodeURIComponent).join("/")}`, "_blank");
          }}
        >
          <ExternalLink size={14} />
          浏览器打开
        </button>
      )}
      {isTauri() && info && (
        <button
          className="icon-btn"
          title="在资源管理器中显示"
          onClick={() => void api.revealInExplorer(`${info.path}\\${tab.path.replace(/\//g, "\\")}`)}
        >
          <FolderOpen size={14} />
        </button>
      )}
      <button className="icon-btn" title="重新加载 (Ctrl+E 切换源码)" onClick={() => void useTabs.getState().invalidate(tab.path)}>
        <RefreshIcon />
      </button>
    </div>
  );
}

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <polyline points="21 3 21 9 15 9" />
    </svg>
  );
}
