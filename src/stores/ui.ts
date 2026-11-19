import { create } from "zustand";

export type SidebarTab = "files" | "search" | "recents";

interface UiState {
  theme: "dark" | "light";
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  sidebarTab: SidebarTab;
  outlineOpen: boolean;
  vaultMenuOpen: boolean;
  quickOpen: boolean;
  toggleTheme: () => void;
  setSidebarWidth: (w: number) => void;
  toggleSidebar: () => void;
  setSidebarTab: (t: SidebarTab) => void;
  setOutlineOpen: (v: boolean) => void;
  setVaultMenuOpen: (v: boolean) => void;
  setQuickOpen: (v: boolean) => void;
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

export const useUi = create<UiState>((set, get) => ({
  theme: initialTheme(),
  sidebarWidth: 280,
  sidebarCollapsed: false,
  sidebarTab: "files",
  outlineOpen: false,
  vaultMenuOpen: false,
  quickOpen: false,
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
}));
