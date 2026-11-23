import { useEffect, useMemo, useRef, useState } from "react";
import { FolderTree, Search, History, X, Files } from "lucide-react";
import type { FileNode, SearchHit, SearchMatch, SearchResult } from "../../../shared/types";
import type { SidebarTab } from "../../stores/ui";
import { useUi } from "../../stores/ui";
import { useVault } from "../../stores/vault";
import { useTabs } from "../../stores/tabs";
import { api, fileUrl } from "../../api/client";
import { FileTree } from "../tree/FileTree";
import { KindIcon } from "../common/KindIcon";
import { openFileCopyMenu } from "../common/FileCopyMenu";
import { splitByQuery, joinAbsPath } from "../../lib/format";
import { locateTextInContent } from "../../lib/locate";
import { findInTree } from "../../lib/links";

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
  const vaultPath = useVault((s) => s.info?.path ?? "");

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
              onContextMenu={(e) => {
                e.preventDefault();
                openFileCopyMenu(e.clientX, e.clientY, {
                  name: meta.name,
                  relPath: meta.path,
                  absPath: joinAbsPath(vaultPath, meta.path),
                });
              }}
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

function SearchPage() {
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seqRef = useRef(0);
  const vaultPath = useVault((s) => s.info?.path ?? "");

  const doSearch = async (q: string, cs: boolean) => {
    const seq = ++seqRef.current;
    if (!q.trim()) {
      setResult(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await api.fsSearch(q, cs);
      if (seq === seqRef.current) setResult(r);
    } catch (e) {
      if (seq === seqRef.current) {
        setResult(null);
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  };

  // 防抖：输入 400ms 后自动搜索
  useEffect(() => {
    const t = window.setTimeout(() => void doSearch(query, caseSensitive), 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, caseSensitive]);

  const openHit = (hit: SearchHit, match?: SearchMatch) => {
    const meta = findInTree(hit.path);
    if (meta) {
      useTabs.getState().openFile(meta);
      useVault.getState().expandPath(hit.path);
    } else {
      window.open(fileUrl(hit.path), "_blank");
    }
    // 尽力定位首个命中位置
    if (match) {
      setTimeout(() => {
        locateTextInContent(document.querySelector(".content"), match.text);
      }, 700);
    }
  };

  return (
    <div className="search-page">
      <div className="tree-filter">
        <Search size={14} className="filter-icon" />
        <input
          type="text"
          placeholder="在笔记库中搜索…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
        />
        {query && (
          <button className="icon-btn clear-btn" style={{ height: 24, minWidth: 24 }} onClick={() => setQuery("")}>
            <X size={13} />
          </button>
        )}
      </div>
      <div className="search-options">
        <label>
          <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
          区分大小写
        </label>
        <span className="search-scope">md / html / txt</span>
      </div>
      {loading && (
        <div className="loading-hint" style={{ padding: "4px 12px 8px" }}>
          <span className="spinner" /> 正在搜索…
        </div>
      )}
      {error && <div className="error-box" style={{ margin: "0 10px 8px" }}>{error}</div>}
      {result && !loading && (
        <div className="search-stats">
          {result.fileCount} 个文件 · {result.matchCount} 处命中 · {result.elapsedMs}ms
          {result.truncated ? "（结果已截断）" : ""}
        </div>
      )}
      <div className="search-results">
        {result?.hits.map((hit) => (
          <div className="search-file" key={hit.path}>
            <div
              className="sf-head"
              onClick={() => openHit(hit, hit.matches[0])}
              onContextMenu={(e) => {
                e.preventDefault();
                openFileCopyMenu(e.clientX, e.clientY, {
                  name: hit.name,
                  relPath: hit.path,
                  absPath: joinAbsPath(vaultPath, hit.path),
                });
              }}
              title={hit.path}
            >
              <KindIcon kind={hit.kind} />
              <span className="sf-name">{hit.name}</span>
              <span className="sf-path">{hit.path}</span>
              <span className="sf-count">{hit.matches.length}</span>
            </div>
            {hit.matches.map((m, i) => (
              <button className="search-hit" key={i} onClick={() => openHit(hit, m)} title={`第 ${m.line} 行`}>
                {splitByQuery(m.text, query.trim()).map((seg, j) =>
                  seg.hit ? <mark key={j}>{seg.part}</mark> : <span key={j}>{seg.part}</span>
                )}
              </button>
            ))}
          </div>
        ))}
        {!result && !loading && !error && (
          <div style={{ padding: "22px 16px", color: "var(--text-faint)", fontSize: 12.5, textAlign: "center" }}>
            输入关键词开始全文搜索
          </div>
        )}
        {result && result.hits.length === 0 && !loading && (
          <div style={{ padding: "22px 16px", color: "var(--text-faint)", fontSize: 12.5, textAlign: "center" }}>
            没有找到「{query.trim()}」
          </div>
        )}
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
