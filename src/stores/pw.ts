/**
 * 密码工作台状态：整库加载/保存（可选主密码加密）、条目增删改、历史记录。
 * 主密码仅存会话内存（不落盘）；每次变更后立即写盘。
 */
import { create } from "zustand";
import { api } from "../api/client";
import type { PwDb, PwEntry } from "../../shared/types";
import { emptyDb, mergeEntries, newEntry } from "../lib/pwexport";

interface PwState {
  /** 首次 load 完成 */
  loaded: boolean;
  /** 磁盘库是否加密 */
  encrypted: boolean;
  /** 已解锁（明文库恒为 true；加密库输入正确主密码后为 true） */
  unlocked: boolean;
  /** 上次解锁密码错误 */
  wrongPassword: boolean;
  /** 主密码（会话内存，不持久化） */
  masterPassword: string | null;
  db: PwDb;
  /** load 出错信息 */
  error: string | null;
  /** 载入/保存中 */
  busy: boolean;

  load: (master?: string) => Promise<void>;
  unlock: (master: string) => Promise<boolean>;
  persist: () => Promise<void>;
  addEntry: (partial: Partial<PwEntry>) => Promise<PwEntry>;
  updateEntry: (entry: PwEntry) => Promise<void>;
  /** 更换密码：旧密码入历史 */
  changePassword: (id: string, newPassword: string) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
  importEntries: (incoming: PwEntry[], mode: "merge" | "replace") => Promise<{ added: number; updated: number; skipped: number }>;
  setMasterPassword: (newMaster: string | null) => Promise<void>;
}

export const usePw = create<PwState>((set, get) => ({
  loaded: false,
  encrypted: false,
  unlocked: true,
  wrongPassword: false,
  masterPassword: null,
  db: emptyDb(),
  error: null,
  busy: false,

  load: async (master?: string) => {
    set({ busy: true, error: null });
    try {
      const r = await api.pwLoad(master);
      if (r.encrypted && !r.db) {
        set({
          loaded: true,
          encrypted: true,
          unlocked: false,
          wrongPassword: r.wrongPassword === true,
          // 仅在尚未输错时暂存主密码（输错则丢弃，避免错误密码被后续 persist 误用）
          masterPassword: r.wrongPassword === true ? null : master ?? null,
          busy: false,
        });
        return;
      }
      set({
        loaded: true,
        // 加密库解锁成功后：保持加密标记与会话内主密码，后续保存继续加密写盘
        encrypted: r.encrypted,
        unlocked: true,
        wrongPassword: false,
        masterPassword: r.encrypted ? master ?? null : null,
        db: r.db ?? emptyDb(),
        busy: false,
      });
    } catch (e) {
      set({ busy: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  unlock: async (master: string) => {
    await get().load(master);
    return get().unlocked;
  },

  persist: async () => {
    const { db, masterPassword, encrypted, unlocked } = get();
    // 锁态防护：未解锁时内存 db 是空占位，任何写盘都会覆盖磁盘上的加密库
    if (encrypted && !unlocked) {
      throw new Error("密码库已锁定，请先解锁后再操作");
    }
    await api.pwSave(db, masterPassword);
    set({ encrypted: masterPassword !== null });
  },

  addEntry: async (partial) => {
    const e = newEntry(partial);
    set((s) => ({ db: { ...s.db, entries: [...s.db.entries, e], updatedAt: Date.now() } }));
    await get().persist();
    return e;
  },

  updateEntry: async (entry) => {
    set((s) => ({
      db: {
        ...s.db,
        entries: s.db.entries.map((x) => (x.id === entry.id ? entry : x)),
        updatedAt: Date.now(),
      },
    }));
    await get().persist();
  },

  changePassword: async (id, newPassword) => {
    const entry = get().db.entries.find((x) => x.id === id);
    if (!entry) return;
    if (!newPassword) return;
    const now = Date.now();
    const updated: PwEntry = {
      ...entry,
      password: newPassword,
      updatedAt: now,
      // 旧密码入史：开始时间 = 当前密码启用时间（updatedAt 仅在换密时更新），结束 = 现在
      history: entry.password
        ? [...entry.history, { password: entry.password, startedAt: entry.updatedAt, endedAt: now }]
        : entry.history,
    };
    await get().updateEntry(updated);
  },

  removeEntry: async (id) => {
    set((s) => ({ db: { ...s.db, entries: s.db.entries.filter((x) => x.id !== id), updatedAt: Date.now() } }));
    await get().persist();
  },

  importEntries: async (incoming, mode) => {
    const r = mergeEntries(get().db.entries, incoming, mode);
    set((s) => ({ db: { ...s.db, entries: r.entries, updatedAt: Date.now() } }));
    await get().persist();
    return { added: r.added, updated: r.updated, skipped: r.skipped };
  },

  setMasterPassword: async (newMaster) => {
    if (get().encrypted && !get().unlocked) {
      throw new Error("密码库已锁定，请先解锁后再管理主密码");
    }
    set({ masterPassword: newMaster });
    await get().persist();
  },
}));
