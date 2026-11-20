import { create } from "zustand";
import type { FileContent, FileKind } from "../../shared/types";
import { api } from "../api/client";

export type ViewMode = "render" | "source";

export interface Tab {
  path: string;
  name: string;
  kind: FileKind;
  size: number;
  mtimeMs: number;
  viewMode: ViewMode;
}

interface TabsState {
  tabs: Tab[];
  active: string | null;
  recents: string[];
  /** 内容缓存：path → 文件内容 */
  content: Record<string, FileContent>;
  loading: Record<string, boolean>;
  openFile: (meta: { path: string; name: string; kind: FileKind; size: number; mtimeMs: number }) => void;
  closeTab: (path: string) => void;
  closeOthers: (path: string) => void;
  setActive: (path: string) => void;
  setViewMode: (mode: ViewMode, path?: string) => void;
  toggleViewMode: (path?: string) => void;
  loadContent: (path: string) => Promise<void>;
  /** 手动刷新：丢弃缓存并重新加载 */
  invalidate: (path?: string) => Promise<void>;
}

function sortTabsRecency(recents: string[]): (a: string, b: string) => number {
  return (a, b) => recents.indexOf(a) - recents.indexOf(b);
}

/** 内容缓存上限：超过时淘汰最旧的条目（当前打开的标签始终保留），控制长会话内存 */
const MAX_CACHED_FILES = 12;

export function evictIfNeeded(
  content: Record<string, FileContent>,
  keepPaths: string[],
  justLoaded: string
): Record<string, FileContent> {
  const keys = Object.keys(content);
  if (keys.length <= MAX_CACHED_FILES) return content;
  const keep = new Set([...keepPaths, justLoaded]);
  const out: Record<string, FileContent> = {};
  // 从最旧（对象键插入顺序）开始保留到上限
  const excess = keys.length - MAX_CACHED_FILES;
  let removed = 0;
  for (const k of keys) {
    if (removed < excess && !keep.has(k)) {
      removed++;
      continue;
    }
    out[k] = content[k];
  }
  return out;
}

export const useTabs = create<TabsState>((set, get) => ({
  tabs: [],
  active: null,
  recents: [],
  content: {},
  loading: {},

  openFile: (meta) => {
    const s = get();
    const existing = s.tabs.find((t) => t.path === meta.path);
    const tabs = existing
      ? s.tabs.map((t) => (t.path === meta.path ? { ...t, ...meta } : t))
      : [...s.tabs, { ...meta, viewMode: "render" as ViewMode }];
    const recents = [meta.path, ...s.recents.filter((p) => p !== meta.path)].slice(0, 100);
    set({ tabs, active: meta.path, recents });
    void api.settingsSet("recents", JSON.stringify(recents));
    void get().loadContent(meta.path);
  },

  closeTab: (path) => {
    const s = get();
    const idx = s.tabs.findIndex((t) => t.path === path);
    if (idx === -1) return;
    const tabs = s.tabs.filter((t) => t.path !== path);
    let active = s.active;
    if (s.active === path) {
      // 激活相邻标签
      const rest = [...s.tabs.slice(0, idx), ...s.tabs.slice(idx + 1)].sort(
        (a, b) => sortTabsRecency(s.recents)(a.path, b.path)
      );
      active = rest[rest.length - 1]?.path ?? null;
    }
    const content = { ...s.content };
    delete content[path];
    set({ tabs, active, content });
  },

  closeOthers: (path) => {
    const s = get();
    const tabs = s.tabs.filter((t) => t.path === path);
    const content: Record<string, FileContent> = {};
    for (const t of tabs) if (s.content[t.path]) content[t.path] = s.content[t.path];
    set({ tabs, active: path, content });
  },

  setActive: (path) => {
    if (!get().tabs.find((t) => t.path === path)) return;
    set({ active: path });
    void get().loadContent(path);
  },

  setViewMode: (mode, path) =>
    set((s) => {
      const target = path !== undefined ? path : s.active;
      if (!target) return s;
      return { tabs: s.tabs.map((t) => (t.path === target ? { ...t, viewMode: mode } : t)) };
    }),

  toggleViewMode: (path) => {
    const s = get();
    const target = path ?? s.active ?? undefined;
    const tab = s.tabs.find((t) => t.path === target);
    if (!tab) return;
    get().setViewMode(tab.viewMode === "render" ? "source" : "render", target);
  },

  loadContent: async (path) => {
    const s = get();
    if (s.content[path] || s.loading[path]) return;
    if (!["markdown", "html", "text"].includes(s.tabs.find((t) => t.path === path)?.kind ?? "")) return;
    set((st) => ({ loading: { ...st.loading, [path]: true } }));
    try {
      const fc = await api.fsRead(path);
      set((st) => ({ content: evictIfNeeded({ ...st.content, [path]: fc }, st.tabs.map((t) => t.path), path) }));
    } catch (e) {
      // 失败时塞入一个带错误标记的占位，避免无限重试
      set((st) => ({
        content: {
          ...st.content,
          [path]: {
            path,
            name: path.split("/").pop() ?? path,
            kind: "text",
            size: 0,
            mtimeMs: 0,
            content: `读取失败：${e instanceof Error ? e.message : String(e)}`,
            truncated: false,
            encoding: "utf-8",
          },
        },
      }));
    } finally {
      set((st) => {
        const loading = { ...st.loading };
        delete loading[path];
        return { loading };
      });
    }
  },

  invalidate: async (path) => {
    const s = get();
    const targets = path ? [path] : Object.keys(s.content);
    const content = { ...s.content };
    for (const p of targets) delete content[p];
    set({ content });
    for (const p of targets) {
      // eslint-disable-next-line no-await-in-loop
      await get().loadContent(p);
    }
  },
}));

/** 从服务端恢复最近打开列表（启动时调用一次） */
export async function loadRecents(): Promise<void> {
  try {
    const raw = await api.settingsGet("recents");
    if (raw) useTabs.setState({ recents: JSON.parse(raw) as string[] });
  } catch {
    /* ignore */
  }
}
