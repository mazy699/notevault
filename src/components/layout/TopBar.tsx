import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ChevronDown,
  Folder,
  FolderOpen,
  FolderPlus,
  Radar,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { api, isTauri } from "../../api/client";
import { useUi } from "../../stores/ui";
import { useVault } from "../../stores/vault";

/** PWA 安装（Web 模式）：捕获浏览器的安装事件 */
function usePwaInstall() {
  const [installReady, setInstallReady] = useState(false);
  useEffect(() => {
    if (isTauri()) return;
    const onAvail = () => setInstallReady(true);
    window.addEventListener("nv-install-available", onAvail);
    const timer = setTimeout(() => {
      const p = (window as unknown as { __installPromptEvent?: unknown }).__installPromptEvent;
      if (p) setInstallReady(true);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, []);
  const installApp = async () => {
    const promptEvent = (
      window as unknown as { __installPromptEvent?: { prompt: () => Promise<void> } }
    ).__installPromptEvent;
    if (promptEvent) {
      await promptEvent.prompt();
      setInstallReady(false);
    }
  };
  return { installReady, installApp };
}

function VaultMenu() {
  const { vaultMenuOpen, setVaultMenuOpen } = useUi();
  const { info, vaultHistory, setVault, pickVault, init } = useVault();
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<Record<string, boolean>>({});
  const ref = useRef<HTMLDivElement>(null);

  // 菜单打开时检测各历史路径是否仍然存在（用于"路径不存在"提示）
  useEffect(() => {
    if (!vaultMenuOpen || vaultHistory.length === 0) return;
    let alive = true;
    Promise.all(
      vaultHistory.map((p: string) =>
        api
          .vaultInfo(p)
          .then((v) => ({ path: p, exists: v !== null }))
          .catch(() => ({ path: p, exists: false }))
      )
    ).then((checks) => {
      if (!alive) return;
      const map: Record<string, boolean> = {};
      for (const c of checks) map[c.path] = c.exists;
      setMissing(map);
    });
    return () => {
      alive = false;
    };
  }, [vaultMenuOpen, vaultHistory]);

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
          {vaultHistory.map((p) => {
            const isMissing = missing[p] === false;
            return (
              <button
                key={p}
                className="item"
                onClick={() => void openPath(p)}
                title={p}
                style={isMissing ? { opacity: 0.55 } : undefined}
              >
                <Folder size={15} style={{ color: isMissing ? "var(--err)" : "var(--warn)" }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p}</span>
                {isMissing && (
                  <span style={{ marginLeft: "auto", color: "var(--err)", fontSize: 11, flex: "none" }}>
                    路径不存在
                  </span>
                )}
                {info?.path === p && !isMissing && (
                  <span style={{ marginLeft: "auto", color: "var(--accent-text)", flex: "none" }}>当前</span>
                )}
              </button>
            );
          })}
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
        <FolderPlus size={15} /> 刷新列表
      </button>
    </div>
  );
}

export function TopBar() {
  const { setVaultMenuOpen, setSidebarTab, setQuickOpen, autoRefresh, toggleAutoRefresh } = useUi();
  const info = useVault((s) => s.info);
  const [refreshing, setRefreshing] = useState(false);
  const { installReady, installApp } = usePwaInstall();

  const doRefresh = () => {
    setRefreshing(true);
    window.dispatchEvent(new CustomEvent("nv-refresh-requested"));
    setTimeout(() => setRefreshing(false), 600);
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
      {installReady && !isTauri() && (
        <button
          className="icon-btn labeled"
          title="把 WebUI 安装为本地应用（独立窗口，无需保留网页）"
          onClick={() => void installApp()}
        >
          <ArrowDownToLine size={15} />
          安装应用
        </button>
      )}
    </div>
  );
}
