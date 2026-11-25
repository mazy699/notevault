/** 应用设置状态：工作台启用/禁用、自定义快捷键；持久化到 settings.json 的 app_settings 键 */
import { create } from "zustand";
import { api } from "../api/client";
import { defaultAppSettings, normalizeAppSettings, type AppSettings } from "../lib/appSettings";
import { normalizeShortcut, type ShortcutActionId, type WorkbenchSwitchId } from "../lib/shortcuts";

const SETTINGS_KEY = "app_settings";

interface AppSettingsState {
  loaded: boolean;
  busy: boolean;
  error: string | null;
  settings: AppSettings;
  load: () => Promise<void>;
  setEnabled: (wb: WorkbenchSwitchId, enabled: boolean) => void;
  setShortcut: (action: ShortcutActionId, binding: string) => void;
  resetShortcuts: () => void;
}

export const useAppSettings = create<AppSettingsState>((set, get) => ({
  loaded: false,
  busy: false,
  error: null,
  settings: defaultAppSettings(),

  load: async () => {
    set({ busy: true, error: null });
    try {
      const raw = await api.settingsGet(SETTINGS_KEY);
      const settings = raw ? normalizeAppSettings(JSON.parse(raw)) : defaultAppSettings();
      set({ loaded: true, busy: false, settings });
    } catch (e) {
      // 设置损坏不阻塞应用：回退默认并提示（设置页可重新保存覆盖）
      set({
        loaded: true,
        busy: false,
        settings: defaultAppSettings(),
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  setEnabled: (wb, enabled) => {
    if (wb === "read") return; // 读取工作台必需
    const current = get().settings;
    if (current.enabled[wb] === enabled) return;
    const next: AppSettings = { ...current, enabled: { ...current.enabled, [wb]: enabled } };
    set({ settings: next });
    void persist(next);
  },

  setShortcut: (action, binding) => {
    const raw = binding.trim();
    const normalized = raw ? normalizeShortcut(raw) : "";
    if (raw && !normalized) return;
    const current = get().settings;
    const next: AppSettings = { ...current, shortcuts: { ...current.shortcuts, [action]: normalized } };
    set({ settings: next });
    void persist(next);
  },

  resetShortcuts: () => {
    const next: AppSettings = { ...get().settings, shortcuts: { ...defaultAppSettings().shortcuts } };
    set({ settings: next });
    void persist(next);
  },
}));

async function persist(settings: AppSettings): Promise<void> {
  try {
    await api.settingsSet(SETTINGS_KEY, JSON.stringify(settings));
    if (useAppSettings.getState().error) useAppSettings.setState({ error: null });
  } catch (e) {
    useAppSettings.setState({ error: e instanceof Error ? e.message : String(e) });
  }
}
