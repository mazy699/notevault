import { useEffect, useRef } from "react";
import { TopBar } from "./components/layout/TopBar";
import { Sidebar } from "./components/layout/Sidebar";
import { StatusBar } from "./components/layout/StatusBar";
import { TabBar } from "./components/viewer/TabBar";
import { Viewer } from "./components/viewer/Viewer";
import { QuickOpen } from "./components/search/QuickOpen";
import { useVault } from "./stores/vault";
import { useUi } from "./stores/ui";
import { loadRecents, useTabs } from "./stores/tabs";
import { api } from "./api/client";

export default function App() {
  const init = useVault((s) => s.init);
  const autoRefresh = useUi((s) => s.autoRefresh);
  const hasVault = useVault((s) => !!s.info);
  const lastSnapshot = useRef<Record<string, { mtimeMs: number; size: number }> | null>(null);

  useEffect(() => {
    void init();
    void loadRecents();
  }, [init]);

  // 手动刷新（顶栏按钮 / nv-refresh-requested 事件）
  useEffect(() => {
    const doRefresh = async () => {
      await useVault.getState().refreshTree();
      await useTabs.getState().invalidate();
      window.dispatchEvent(new CustomEvent("nv-flash-refresh", { detail: "已刷新" }));
    };
    const handler = () => void doRefresh();
    window.addEventListener("nv-refresh-requested", handler);
    return () => window.removeEventListener("nv-refresh-requested", handler);
  }, []);

  // 自动刷新：轮询快照 diff（4s）
  useEffect(() => {
    if (!autoRefresh || !hasVault) {
      lastSnapshot.current = null;
      return;
    }
    let stopped = false;
    const tick = async () => {
      try {
        const snap = await api.fsSnapshot();
        if (stopped) return;
        const prev = lastSnapshot.current;
        lastSnapshot.current = snap.entries as Record<string, { mtimeMs: number; size: number }>;
        if (!prev) return; // 首轮只建立基线
        const prevKeys = Object.keys(prev);
        const nextKeys = Object.keys(snap.entries);
        let changed = prevKeys.length !== nextKeys.length;
        if (!changed) {
          for (const [path, meta] of Object.entries(snap.entries)) {
            const p = prev[path];
            if (!p || p.mtimeMs !== meta.mtimeMs || p.size !== meta.size) {
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
    void tick(); // 建立基线
    const timer = window.setInterval(() => void tick(), 4000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [autoRefresh, hasVault]);

  // 全局快捷键
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
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "p") {
        e.preventDefault();
        ui.setQuickOpen(true);
      } else if (key === "f" && e.shiftKey) {
        e.preventDefault();
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
      } else if (key === "r" || e.key === "F5") {
        e.preventDefault();
        await useVault.getState().refreshTree();
        await tabs.invalidate();
        window.dispatchEvent(new CustomEvent("nv-flash-refresh", { detail: "已刷新" }));
      }
    };
    // F5 单独处理（无修饰键）
    const onF5 = async (e: KeyboardEvent) => {
      if (e.key !== "F5") return;
      e.preventDefault();
      await useVault.getState().refreshTree();
      await useTabs.getState().invalidate();
      window.dispatchEvent(new CustomEvent("nv-flash-refresh", { detail: "已刷新" }));
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keydown", onF5);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keydown", onF5);
    };
  }, []);

  return (
    <div className="app">
      <TopBar />
      <div className="app-main">
        <Sidebar />
        <div className="content-col">
          <TabBar />
          <Viewer />
        </div>
      </div>
      <StatusBar />
      <QuickOpen />
    </div>
  );
}
