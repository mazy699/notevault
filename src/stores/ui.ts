import { create } from "zustand";

export type SidebarTab = "files" | "search" | "recents";
/** 工作台：读取（笔记浏览）/ 对比（Diff）/ 密码（凭证管理）/ 工作日志（Worklog）/ 常用语（快捷文本） */
export type Workbench = "read" | "diff" | "pw" | "worklog" | "snippets";

interface UiState {
  theme: "dark" | "light";
  workbench: Workbench;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  sidebarTab: SidebarTab;
  outlineOpen: boolean;
  vaultMenuOpen: boolean;
  quickOpen: boolean;
  autoRefresh: boolean;
  setWorkbench: (w: Workbench) => void;
  toggleTheme: () => void;
  setSidebarWidth: (w: number) => void;
  toggleSidebar: () => void;
  setSidebarTab: (t: SidebarTab) => void;
  setOutlineOpen: (v: boolean) => void;
  setVaultMenuOpen: (v: boolean) => void;
  setQuickOpen: (v: boolean) => void;
  toggleAutoRefresh: () => void;
}

function applyTheme(theme: "dark" | "light"): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem("nv_theme", theme);
  } catch {
    /* ignore */
  }
}

function initialTheme(): "dark" | "light" {
  try {
    return localStorage.getItem("nv_theme") === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function initialAutoRefresh(): boolean {
  try {
    return localStorage.getItem("nv_auto_refresh") === "1";
  } catch {
    return false;
  }
}

export const useUi = create<UiState>((set, get) => ({
  theme: initialTheme(),
  workbench: "read",
  sidebarWidth: 280,
  sidebarCollapsed: false,
  sidebarTab: "files",
  outlineOpen: true,
  vaultMenuOpen: false,
  quickOpen: false,
  autoRefresh: initialAutoRefresh(),
  setWorkbench: (w) => set({ workbench: w, quickOpen: false, vaultMenuOpen: false }),
  toggleTheme: () => {
    const next = get().theme === "dark" ? "light" : "dark";
    applyTheme(next);
    set({ theme: next });
    window.dispatchEvent(new CustomEvent("nv-theme-changed", { detail: next }));
  },
  setSidebarWidth: (w) => set({ sidebarWidth: Math.min(480, Math.max(180, w)) }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarTab: (t) => set({ sidebarTab: t, sidebarCollapsed: false }),
  setOutlineOpen: (v) => set({ outlineOpen: v }),
  setVaultMenuOpen: (v) => set({ vaultMenuOpen: v }),
  setQuickOpen: (v) => set({ quickOpen: v }),
  toggleAutoRefresh: () => {
    const next = !get().autoRefresh;
    set({ autoRefresh: next });
    try {
      localStorage.setItem("nv_auto_refresh", next ? "1" : "0");
    } catch {
      /* ignore */
    }
  },
}));
