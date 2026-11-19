import { useEffect, useMemo, useRef, useState } from "react";
import { useUi } from "../../stores/ui";
import { useVault } from "../../stores/vault";
import { useTabs } from "../../stores/tabs";
import { flattenFiles, fuzzySearch } from "../../lib/fuzzy";
import { KindIcon } from "../common/KindIcon";
import { History } from "lucide-react";

/** Ctrl+P 快速打开浮层：模糊搜索文件名 */
export function QuickOpen() {
  const open = useUi((s) => s.quickOpen);
  const setQuickOpen = useUi((s) => s.setQuickOpen);
  const tree = useVault((s) => s.tree);
  const recents = useTabs((s) => s.recents);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const files = useMemo(() => flattenFiles(tree), [tree]);
  const results = useMemo(() => fuzzySearch(files, query.trim()), [files, query]);

  // 空查询时按最近优先排序展示
  const items = useMemo(() => {
    if (query.trim()) return results;
    const byRecency = [...results].sort((a, b) => {
      const ia = recents.indexOf(a.file.path);
      const ib = recents.indexOf(b.file.path);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return byRecency;
  }, [results, query, recents]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => setSelected(0), [query]);

  useEffect(() => {
    const el = listRef.current?.children[selected] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  if (!open) return null;

  const pick = (path: string) => {
    const file = files.find((f) => f.path === path);
    if (file) {
      useTabs.getState().openFile(file);
      useVault.getState().expandPath(path);
    }
    setQuickOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, Math.max(0, items.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[selected] && pick(items[selected].file.path);
    } else if (e.key === "Escape") {
      setQuickOpen(false);
    }
  };

  /** 文件名模糊高亮 */
  const highlightName = (name: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return name;
    const lower = name.toLowerCase();
    const marks: boolean[] = new Array(name.length).fill(false);
    let pos = 0;
    for (const ch of q) {
      const idx = lower.indexOf(ch, pos);
      if (idx === -1) break;
      marks[idx] = true;
      pos = idx + 1;
    }
    return Array.from(name).map((ch, i) => (marks[i] ? <mark key={i}>{ch}</mark> : <span key={i}>{ch}</span>));
  };

  return (
    <div className="qo-overlay" onMouseDown={(e) => e.target === e.currentTarget && setQuickOpen(false)}>
      <div className="qo-panel">
        <input
          ref={inputRef}
          type="text"
          placeholder="输入文件名快速打开…（↑↓ 选择，Enter 打开，Esc 关闭）"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
        />
        <div className="qo-list" ref={listRef}>
          {items.length === 0 ? (
            <div className="qo-empty">{query ? "没有匹配的文件" : "笔记库为空"}</div>
          ) : (
            items.map((r, i) => (
              <button
                key={r.file.path}
                className={`qo-item${i === selected ? " selected" : ""}`}
                onClick={() => pick(r.file.path)}
                onMouseEnter={() => setSelected(i)}
              >
                <KindIcon kind={r.file.kind} />
                <span>{highlightName(r.file.name)}</span>
                {!query && recents.indexOf(r.file.path) === 0 && (
                  <History size={12} style={{ color: "var(--text-faint)" }} />
                )}
                <span className="qo-path">{r.file.path}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
