import { lazy, Suspense, useEffect, useRef } from "react";
import { ActivityBar } from "./components/common/ActivityBar";
import { TopBar } from "./components/layout/TopBar";
import { Sidebar } from "./components/layout/Sidebar";
import { StatusBar } from "./components/layout/StatusBar";
import { TabBar } from "./components/viewer/TabBar";
import { Viewer } from "./components/viewer/Viewer";
import { QuickOpen } from "./components/search/QuickOpen";
import { FileCopyMenu } from "./components/common/FileCopyMenu";
import { usePwAutoLock } from "./hooks/usePwAutoLock";
import { workbenchFromShortcut } from "./lib/shortcuts";
import { useVault } from "./stores/vault";
import { useUi } from "./stores/ui";
import { loadRecents, useTabs } from "./stores/tabs";
import { api } from "./api/client";

/** 对比工作台（含 jsdiff 引擎，懒加载，不拖累读取工作台首屏） */
const DiffWorkbench = lazy(() =>
  import("./components/diff/DiffWorkbench").then((m) => ({ default: m.DiffWorkbench }))
);
const PwWorkbench = lazy(() =>
  import("./components/pw/PwWorkbench").then((m) => ({ default: m.PwWorkbench }))
);
/** 工作日志工作台（Worklog 接入：sql.js 与页面均按需加载） */
const WorklogWorkbench = lazy(() =>
  import("./worklog/WorklogWorkbench").then((m) => ({ default: m.WorklogWorkbench }))
);
/** 常用语工作台（快捷文本：卡片网格/搜索/拖动排序） */
const SnippetsWorkbench = lazy(() =>
  import("./components/snippets/SnippetsWorkbench").then((m) => ({ default: m.SnippetsWorkbench }))
);

export default function App() {
  const init = useVault((s) => s.init);
  const autoRefresh = useUi((s) => s.autoRefresh);
  const workbench = useUi((s) => s.workbench);
  const hasVault = useVault((s) => !!s.info);
  const lastSnapshot = useRef<Record<string, { mtimeMs: number; size: number }> | null>(null);
  // 密码库自动上锁（全局计时，切换工作台期间同样生效）
  usePwAutoLock();

  useEffect(() => {
    void init();
    void loadRecents();
  }, [init]);

  const refreshAll = async (note?: string) => {
    await useVault.getState().refreshTree();
    await useTabs.getState().invalidate();
    window.dispatchEvent(new CustomEvent("nv-flash-refresh", { detail: note ?? "已刷新" }));
  };

  // 手动刷新（顶栏按钮 / nv-refresh-requested 事件）+ 切库时重置快照基线
  useEffect(() => {
    const handler = () => void refreshAll();
    const onVaultChanged = () => {
      lastSnapshot.current = null;
    };
    window.addEventListener("nv-refresh-requested", handler);
    window.addEventListener("nv-vault-changed", onVaultChanged);
    return () => {
      window.removeEventListener("nv-refresh-requested", handler);
      window.removeEventListener("nv-vault-changed", onVaultChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 自动刷新：轮询快照 diff（4s）
  useEffect(() => {
    if (!autoRefresh || !hasVault) return;
    let stopped = false;
    let baseline: Record<string, { mtimeMs: number; size: number }> | null = null;
    const tick = async () => {
      try {
        const snap = await api.fsSnapshot();
        if (stopped) return;
        const prev = baseline;
        baseline = snap.entries;
        if (!prev) return; // 首轮建立基线
        let changed = Object.keys(prev).length !== Object.keys(snap.entries).length;
        if (!changed) {
          for (const [p, m] of Object.entries(snap.entries)) {
            const q = prev[p];
            if (!q || q.mtimeMs !== m.mtimeMs || q.size !== m.size) {
              changed = true;
              break;
            }
          }
        }
        if (changed) {
          await useVault.getState().refreshTree();
          await useTabs.getState().invalidate();
          window.dispatchEvent(new CustomEvent("nv-flash-refresh", { detail: "检测到文件变化，已刷新" }));
        }
      } catch {
        /* 笔记库被移除等，静默 */
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 4000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [autoRefresh, hasVault]);

  // 全局快捷键（仅读取工作台生效；对比/密码/工作日志工作台有自己的快捷键与弹窗）
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const ui = useUi.getState();
      const tabs = useTabs.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "Escape") {
        if (ui.quickOpen) ui.setQuickOpen(false);
        else if (ui.vaultMenuOpen) ui.setVaultMenuOpen(false);
        return;
      }
      // 工作台切换：Alt+1~5（全局生效，避开浏览器 Ctrl+数字 标签页语义）
      const wb = workbenchFromShortcut(e.key, e);
      if (wb) {
        e.preventDefault();
        ui.setWorkbench(wb);
        return;
      }
      if (ui.workbench !== "read") return;
      if (!mod) {
        if (e.key === "F5") {
          e.preventDefault();
          await refreshAll();
        }
        return;
      }
      const key = e.key.toLowerCase();
      if (key === "p") {
        e.preventDefault();
        ui.setQuickOpen(true);
      } else if (key === "f" && e.shiftKey) {
        e.preventDefault();
        ui.setWorkbench("read");
        ui.setSidebarTab("search");
        setTimeout(() => (document.querySelector(".search-page input") as HTMLInputElement | null)?.focus(), 60);
      } else if (key === "b") {
        e.preventDefault();
        ui.toggleSidebar();
      } else if (key === "e") {
        e.preventDefault();
        tabs.toggleViewMode();
      } else if (key === "w") {
        e.preventDefault();
        if (tabs.active) tabs.closeTab(tabs.active);
      } else if (key === "r") {
        e.preventDefault();
        await refreshAll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app">
      <div className="app-body">
        <ActivityBar />
        {workbench === "read" ? (
          <div className="read-col">
            <TopBar />
            <div className="app-main">
              <Sidebar />
              <div className="content-col">
                <TabBar />
                <Viewer />
              </div>
            </div>
          </div>
        ) : workbench === "pw" ? (
          <Suspense
            fallback={
              <div className="content-col">
                <div className="diff-empty">
                  <span className="spinner" /> 正在加载密码工作台…
                </div>
              </div>
            }
          >
            <PwWorkbench />
          </Suspense>
        ) : workbench === "worklog" ? (
          <Suspense
            fallback={
              <div className="content-col">
                <div className="diff-empty">
                  <span className="spinner" /> 正在加载工作日志…
                </div>
              </div>
            }
          >
            <WorklogWorkbench />
          </Suspense>
        ) : workbench === "snippets" ? (
          <Suspense
            fallback={
              <div className="content-col">
                <div className="diff-empty">
                  <span className="spinner" /> 正在加载常用语…
                </div>
              </div>
            }
          >
            <SnippetsWorkbench />
          </Suspense>
        ) : (
          <Suspense
            fallback={
              <div className="content-col">
                <div className="diff-empty">
                  <span className="spinner" /> 正在加载对比工作台…
                </div>
              </div>
            }
          >
            <DiffWorkbench />
          </Suspense>
        )}
      </div>
      <StatusBar />
      <QuickOpen />
      <FileCopyMenu />
    </div>
  );
}
