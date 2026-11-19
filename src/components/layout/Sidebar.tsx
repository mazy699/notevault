import { useMemo, useRef, useState } from "react";
import { FolderTree, Search, History, X, Files } from "lucide-react";
import type { FileNode } from "../../../shared/types";
import type { SidebarTab } from "../../stores/ui";
import { useUi } from "../../stores/ui";
import { useVault } from "../../stores/vault";
import { useTabs } from "../../stores/tabs";
import { FileTree } from "../tree/FileTree";
import { KindIcon } from "../common/KindIcon";

function FilesPage() {
  const [filter, setFilter] = useState("");
  const { tree, treeLoading, treeError } = useVault();
  return (
    <>
      <div className="tree-filter">
        <Search size={14} className="filter-icon" />
        <input
          type="text"
          placeholder="过滤文件名…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          spellCheck={false}
        />
        {filter && (
          <button className="icon-btn clear-btn" style={{ height: 24, minWidth: 24 }} onClick={() => setFilter("")}>
            <X size={13} />
          </button>
        )}
      </div>
      <div className="tree-scroll">
        {treeError && <div className="error-box" style={{ margin: 10 }}>{treeError}</div>}
        {treeLoading && !tree && (
          <div className="loading-hint">
            <span className="spinner" /> 正在读取目录树…
          </div>
        )}
        {tree && !treeLoading && <FileTree filter={filter} />}
      </div>
    </>
  );
}

export function RecentsPage() {
  const recents = useTabs((s) => s.recents);
  const tree = useVault((s) => s.tree);

  // 从树中查出文件元数据以拿到 kind/size
  const byPath = useMemo(() => {
    const map = new Map<string, FileNode>();
    const walk = (n: FileNode | null) => {
      if (!n) return;
      if (!n.dir) map.set(n.path, n);
      n.children?.forEach(walk);
    };
    walk(tree);
    return map;
  }, [tree]);

  const shown = recents.filter((p) => byPath.has(p)).slice(0, 50);

  return (
    <div className="tree-scroll">
      {shown.length === 0 ? (
        <div style={{ padding: "22px 16px", color: "var(--text-faint)", fontSize: 12.5, textAlign: "center" }}>
          还没有打开过文件
          <br />
          从左侧文件树中选择一个文件开始阅读
        </div>
      ) : (
        shown.map((p) => {
          const meta = byPath.get(p)!;
          return (
            <div
              key={p}
              className="tree-row"
              onClick={() =>
                useTabs.getState().openFile({
                  path: meta.path,
                  name: meta.name,
                  kind: meta.kind,
                  size: meta.size,
                  mtimeMs: meta.mtimeMs,
                })
              }
              title={p}
            >
              <KindIcon kind={meta.kind} />
              <span className="f-name">{meta.name}</span>
              <span className="count">{p.split("/").slice(0, -1).join("/") || "·"}</span>
            </div>
          );
        })
      )}
    </div>
  );
}

export function SearchPage() {
  // 阶段 3 实现全文搜索；这里先渲染占位
  return (
    <div className="tree-scroll">
      <div style={{ padding: "26px 18px", color: "var(--text-faint)", fontSize: 12.5, lineHeight: 1.8, textAlign: "center" }}>
        <Search size={26} style={{ marginBottom: 8, opacity: 0.6 }} />
        <br />
        全文搜索即将启用
        <br />
        （当前阶段先提供目录树与文件查看）
      </div>
    </div>
  );
}

const TABS: Array<{ id: SidebarTab; label: string; Icon: typeof FolderTree }> = [
  { id: "files", label: "文件", Icon: FolderTree },
  { id: "search", label: "搜索", Icon: Search },
  { id: "recents", label: "最近", Icon: History },
];

export function Sidebar() {
  const { sidebarWidth, sidebarCollapsed, sidebarTab, setSidebarTab, setSidebarWidth } = useUi();
  const dragging = useRef(false);

  const onDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const move = (ev: MouseEvent) => {
      if (dragging.current) setSidebarWidth(ev.clientX - 0);
    };
    const up = () => {
      dragging.current = false;
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };

  if (sidebarCollapsed) return null;

  return (
    <div className="sidebar" style={{ width: sidebarWidth }}>
      <div className="sidebar-tabs">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`sidebar-tab${sidebarTab === id ? " active" : ""}`}
            onClick={() => setSidebarTab(id)}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <Files size={14} style={{ color: "var(--text-faint)", margin: "0 8px 4px 0" }} />
      </div>
      {sidebarTab === "files" && <FilesPage />}
      {sidebarTab === "search" && <SearchPage />}
      {sidebarTab === "recents" && <RecentsPage />}
      <div className="sidebar-resizer" onMouseDown={onDown} onDoubleClick={() => setSidebarWidth(280)} />
    </div>
  );
}
