import { useEffect, useRef, useState } from "react";
import {
  Search,
  Moon,
  Sun,
  RefreshCw,
  FolderOpen,
  ChevronDown,
  FolderPlus,
  Sparkles,
  Folder,
  Radar,
} from "lucide-react";
import { isTauri } from "../../api/client";
import { useUi } from "../../stores/ui";
import { useVault } from "../../stores/vault";

function VaultMenu() {
  const { vaultMenuOpen, setVaultMenuOpen } = useUi();
  const { info, vaultHistory, setVault, pickVault, init } = useVault();
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!vaultMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setVaultMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [vaultMenuOpen, setVaultMenuOpen]);

  if (!vaultMenuOpen) return null;

  const openPath = async (path: string) => {
    setError(null);
    try {
      await setVault(path);
      setVaultMenuOpen(false);
      window.dispatchEvent(new CustomEvent("nv-vault-changed"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div ref={ref} className="dropdown" style={{ left: 10 }}>
      <div className="label">打开笔记目录</div>
      <input
        type="text"
        placeholder="输入目录绝对路径，如 D:\\notes（回车确认）"
        value={manual}
        onChange={(e) => setManual(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && manual.trim()) void openPath(manual.trim());
        }}
      />
      {error && <div style={{ color: "var(--err)", fontSize: 12, padding: "0 10px 6px" }}>{error}</div>}
      <button className="item" onClick={() => void pickVault()}>
        <FolderPlus size={15} /> {isTauri() ? "浏览…（系统目录选择框）" : "浏览…（Web 版请直接输入路径）"}
      </button>

      {vaultHistory.length > 0 && (
        <>
          <div className="divider" />
          <div className="label">最近使用</div>
          {vaultHistory.map((p) => (
            <button key={p} className="item" onClick={() => void openPath(p)} title={p}>
              <Folder size={15} style={{ color: "var(--warn)" }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p}</span>
              {info?.path === p && <span style={{ marginLeft: "auto", color: "var(--accent-text)" }}>当前</span>}
            </button>
          ))}
        </>
      )}
      <div className="divider" />
      <button
        className="item"
        onClick={() => {
          setVaultMenuOpen(false);
          void init();
        }}
      >
        <RefreshCw size={15} /> 刷新列表与当前库
      </button>
    </div>
  );
}

export function TopBar() {
  const { theme, toggleTheme, setVaultMenuOpen, setSidebarTab, setQuickOpen, autoRefresh, toggleAutoRefresh } = useUi();
  const info = useVault((s) => s.info);
  const [refreshing, setRefreshing] = useState(false);

  const doRefresh = async () => {
    setRefreshing(true);
    window.dispatchEvent(new CustomEvent("nv-refresh-requested"));
    setRefreshing(false);
  };

  return (
    <div className="topbar">
      <div className="brand">
        <span className="logo-dot">N</span>
        NoteVault
      </div>

      <button className="vault-btn" onClick={() => setVaultMenuOpen(true)} title={info?.path ?? "选择笔记目录"}>
        <FolderOpen size={15} style={{ color: "var(--warn)", flex: "none" }} />
        {info ? (
          <>
            <span className="vault-name">{info.name}</span>
            <span className="muted">{info.fileCount} 个文件</span>
          </>
        ) : (
          <span className="vault-name muted">选择笔记目录…</span>
        )}
        <ChevronDown size={14} style={{ color: "var(--text-faint)", flex: "none" }} />
      </button>
      <VaultMenu />

      <div className="spacer" />

      <button className="icon-btn labeled" title="全局搜索 (Ctrl+Shift+F)" onClick={() => setSidebarTab("search")}>
        <Search size={15} />
        搜索
      </button>
      <button className="icon-btn labeled" title="快速打开 (Ctrl+P)" onClick={() => setQuickOpen(true)}>
        <Sparkles size={15} />
        快速打开
      </button>
      <button
        className={`icon-btn${autoRefresh ? " active" : ""}`}
        title={autoRefresh ? "自动刷新已开启（每 4 秒检测文件变化）" : "开启自动刷新（检测外部文件变化）"}
        onClick={toggleAutoRefresh}
      >
        <Radar size={15} />
      </button>
      <button className="icon-btn" title="刷新目录与文件" onClick={() => void doRefresh()}>
        <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
      </button>
      <button className="icon-btn" title={theme === "dark" ? "切换浅色主题" : "切换深色主题"} onClick={toggleTheme}>
        {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
      </button>
    </div>
  );
}
