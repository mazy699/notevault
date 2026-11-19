import { create } from "zustand";
import type { FileNode, VaultInfo } from "../../shared/types";
import { api } from "../api/client";
import { useTabs } from "./tabs";

interface VaultState {
  info: VaultInfo | null;
  tree: FileNode | null;
  treeLoading: boolean;
  treeError: string | null;
  vaultHistory: string[];
  /** 展开的目录集合（相对路径） */
  expanded: Record<string, boolean>;
  init: () => Promise<void>;
  setVault: (path: string) => Promise<void>;
  pickVault: () => Promise<void>;
  refreshTree: () => Promise<void>;
  toggleDir: (path: string) => void;
  /** 打开文件时展开其所有祖先目录 */
  expandPath: (path: string) => void;
}

export const useVault = create<VaultState>((set, get) => ({
  info: null,
  tree: null,
  treeLoading: false,
  treeError: null,
  vaultHistory: [],
  expanded: {},

  init: async () => {
    try {
      const [info, history] = await Promise.all([api.vaultInfo(), api.vaultList()]);
      set({ vaultHistory: history ?? [] });
      if (info) {
        set({ info });
        await get().refreshTree();
      }
    } catch (e) {
      set({ treeError: e instanceof Error ? e.message : String(e) });
    }
  },

  setVault: async (path) => {
    set({ treeLoading: true, treeError: null });
    try {
      const info = await api.vaultSet(path);
      const history = await api.vaultList();
      // 切换笔记库：清空旧库的标签与内容缓存，避免展示同名旧文件
      useTabs.setState({ tabs: [], active: null, content: {}, loading: {}, recents: [] });
      set({ info, vaultHistory: history, expanded: {} });
      await get().refreshTree();
    } catch (e) {
      set({ treeError: e instanceof Error ? e.message : String(e), treeLoading: false });
    }
  },

  pickVault: async () => {
    try {
      const info = await api.vaultPick();
      if (info) {
        useTabs.setState({ tabs: [], active: null, content: {}, loading: {}, recents: [] });
        set({ info });
        await get().refreshTree();
      }
    } catch (e) {
      set({ treeError: e instanceof Error ? e.message : String(e) });
    }
  },

  refreshTree: async () => {
    if (!get().info) return;
    set({ treeLoading: true, treeError: null });
    try {
      const tree = await api.fsTree();
      set({ tree, treeLoading: false });
    } catch (e) {
      set({ treeError: e instanceof Error ? e.message : String(e), treeLoading: false });
    }
  },

  toggleDir: (path) =>
    set((s) => ({ expanded: { ...s.expanded, [path]: !s.expanded[path] } })),

  expandPath: (path) =>
    set((s) => {
      const parts = path.split("/");
      const next = { ...s.expanded };
      for (let i = 1; i < parts.length; i++) {
        next[parts.slice(0, i).join("/")] = true;
      }
      return { expanded: next };
    }),
}));
