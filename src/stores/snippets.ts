/**
 * 常用语工作台状态（Issue #12）：整库加载/原子保存、增删改、拖动排序、导入合并。
 * 数据文件由双宿主提供（%APPDATA%/notevault/snippets.json）。
 */
import { create } from "zustand";
import { api } from "../api/client";
import type { Snippet, SnippetDb } from "../../shared/types";
import {
  emptySnippetDb,
  mergeSnippets,
  moveSnippetId,
  newSnippet,
  normalizeSnippetDb,
  resolvedSnippetOrder,
} from "../lib/snippets";

interface SnippetsState {
  loaded: boolean;
  busy: boolean;
  error: string | null;
  db: SnippetDb;

  load: () => Promise<void>;
  persist: () => Promise<void>;
  addSnippet: (partial: Partial<Pick<Snippet, "title" | "content" | "group">>) => Promise<Snippet>;
  updateSnippet: (snippet: Snippet) => Promise<void>;
  removeSnippet: (id: string) => Promise<void>;
  /** 拖动排序：把 fromId 移到 toId 之前/之后 */
  moveSnippet: (fromId: string, toId: string, after: boolean) => Promise<void>;
  importSnippets: (
    incoming: Snippet[],
    mode: "merge" | "replace",
    incomingOrder?: string[]
  ) => Promise<{ added: number; updated: number; skipped: number }>;
  clearError: () => void;
}

export const useSnippets = create<SnippetsState>((set, get) => ({
  loaded: false,
  busy: false,
  error: null,
  db: emptySnippetDb(),

  load: async () => {
    set({ busy: true, error: null });
    try {
      const raw = await api.snippetsLoad();
      const db = normalizeSnippetDb(raw);
      set({ loaded: true, busy: false, db });
    } catch (e) {
      // 损坏时不覆盖原文件：保持 loaded=false，UI 显示错误与重试入口
      set({ busy: false, loaded: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  persist: async () => {
    if (!get().loaded) throw new Error("常用语数据尚未加载完成，暂不能保存");
    await api.snippetsSave(get().db);
  },

  addSnippet: async (partial) => {
    const snippet = newSnippet(partial);
    set((s) => {
      const order = s.db.order ? [snippet.id, ...resolvedSnippetOrder(s.db.snippets, s.db.order)] : s.db.order;
      return { db: { ...s.db, snippets: [...s.db.snippets, snippet], order, updatedAt: Date.now() } };
    });
    await get().persist();
    return snippet;
  },

  updateSnippet: async (snippet) => {
    const next: Snippet = { ...snippet, title: snippet.title.trim(), group: snippet.group.trim(), updatedAt: Date.now() };
    set((s) => ({
      db: { ...s.db, snippets: s.db.snippets.map((x) => (x.id === next.id ? next : x)), updatedAt: Date.now() },
    }));
    await get().persist();
  },

  removeSnippet: async (id) => {
    set((s) => ({
      db: {
        ...s.db,
        snippets: s.db.snippets.filter((x) => x.id !== id),
        order: s.db.order ? s.db.order.filter((x) => x !== id) : s.db.order,
        updatedAt: Date.now(),
      },
    }));
    await get().persist();
  },

  moveSnippet: async (fromId, toId, after) => {
    const db = get().db;
    const ids = resolvedSnippetOrder(db.snippets, db.order);
    const next = moveSnippetId(ids, fromId, toId, after);
    if (next.join("\u0000") === ids.join("\u0000")) return;
    set({ db: { ...db, order: next, updatedAt: Date.now() } });
    await get().persist();
  },

  importSnippets: async (incoming, mode, incomingOrder) => {
    const db = get().db;
    const r = mergeSnippets(db.snippets, incoming, mode, db.order, incomingOrder);
    set({ db: { ...db, snippets: r.snippets, order: r.order, updatedAt: Date.now() } });
    await get().persist();
    return { added: r.added, updated: r.updated, skipped: r.skipped };
  },

  clearError: () => set({ error: null }),
}));
