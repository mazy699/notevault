import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { useTabs } from "../../stores/tabs";
import { useVault } from "../../stores/vault";
import { KindIcon } from "../common/KindIcon";
import { openFileCopyMenu } from "../common/FileCopyMenu";
import { joinAbsPath } from "../../lib/format";
import { filterTabs } from "../../lib/tabfilter";

/**
 * 标签栏（Issue #8）：
 * - 溢出时可横向滚动（滚轮纵向 → 横向），激活标签自动滚入可见区；
 * - 右侧固定「全部标签」按钮：浮层支持搜索、切换、关闭，Esc/点击外部关闭。
 */
export function TabBar() {
  const { tabs, active, setActive, closeTab, closeOthers } = useTabs();
  const vaultPath = useVault((s) => s.info?.path ?? "");
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<string, HTMLDivElement>());
  const anchorRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [overflowing, setOverflowing] = useState(false);

  // 滚轮 → 横向滚动（触控板原生横向滚动保持默认）
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return; // Ctrl+滚轮 交给页面缩放
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // 已是横向手势
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // tabs 从 0 → N 时 TabBar 才渲染出滚动容器，需要重新挂载监听
  }, [tabs.length]);

  // 激活标签变化时滚入可见区（block: nearest 避免影响纵向布局）
  useEffect(() => {
    const el = active ? tabRefs.current.get(active) : null;
    el?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [active, tabs.length]);

  // 溢出检测：控制按钮高亮/提示（按钮始终可用）
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setOverflowing(el.scrollWidth > el.clientWidth + 1);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tabs.length]);

  // 打开浮层：重置搜索、聚焦输入框
  useEffect(() => {
    if (!menuOpen) return;
    setQuery("");
    setCursor(0);
    const raf = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [menuOpen]);

  // 点击外部 / Esc 关闭
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!anchorRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const filtered = useMemo(() => filterTabs(tabs, query), [tabs, query]);
  useEffect(() => setCursor(0), [query]);

  if (tabs.length === 0) return null;

  const activate = (path: string) => {
    setActive(path);
    setMenuOpen(false);
  };

  return (
    <div className="tabbar-row">
      <div className="tabbar" ref={scrollRef}>
        {tabs.map((t) => (
          <div
            key={t.path}
            ref={(el) => {
              if (el) tabRefs.current.set(t.path, el);
              else tabRefs.current.delete(t.path);
            }}
            className={`tab${active === t.path ? " active" : ""}`}
            onClick={() => setActive(t.path)}
            onAuxClick={(e) => {
              if (e.button === 1) closeTab(t.path);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              openFileCopyMenu(e.clientX, e.clientY, {
                name: t.name,
                relPath: t.path,
                absPath: joinAbsPath(vaultPath, t.path),
                onClose: () => closeTab(t.path),
                onCloseOthers: () => closeOthers(t.path),
              });
            }}
            title={t.path}
          >
            <KindIcon kind={t.kind} />
            <span className="t-name">{t.name}</span>
            <span
              className="t-close"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(t.path);
              }}
            >
              <X size={12} />
            </span>
          </div>
        ))}
      </div>

      <div className="tabbar-menu-anchor" ref={anchorRef}>
        <button
          className={`tabbar-all${overflowing ? " has-overflow" : ""}${menuOpen ? " open" : ""}`}
          title={overflowing ? "标签已溢出：点击查看全部标签页（可搜索）" : "查看全部标签页（可搜索）"}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <ChevronDown size={14} />
        </button>
        {menuOpen && (
          <div className="tab-menu">
            <div className="tab-menu-search">
              <Search size={13} />
              <input
                ref={searchRef}
                type="text"
                placeholder="搜索标签页…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setCursor((c) => Math.min(filtered.length - 1, c + 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setCursor((c) => Math.max(0, c - 1));
                  } else if (e.key === "Enter") {
                    const t = filtered[cursor];
                    if (t) activate(t.path);
                  }
                }}
                spellCheck={false}
              />
            </div>
            <div className="tab-menu-list">
              {filtered.length === 0 ? (
                <div className="tab-menu-empty">没有匹配的标签页</div>
              ) : (
                filtered.map((t, i) => (
                  <div
                    key={t.path}
                    className={`tab-menu-item${t.path === active ? " active" : ""}${i === cursor ? " cursor" : ""}`}
                    onClick={() => activate(t.path)}
                    title={t.path}
                  >
                    <KindIcon kind={t.kind} />
                    <span className="tm-name">{t.name}</span>
                    <span className="tm-path">{t.path}</span>
                    <span
                      className="tm-close"
                      title="关闭标签页"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(t.path);
                      }}
                    >
                      <X size={12} />
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="tab-menu-hint">
              {overflowing ? "标签栏可用滚轮横向滚动 · " : ""}
              共 {tabs.length} 个标签
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
