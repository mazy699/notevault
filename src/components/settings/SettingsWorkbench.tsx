/** 设置中心：外观/工作台启停/自定义快捷键/密码自动上锁/关于 */
import { useEffect, useState } from "react";
import {
  BookOpenText,
  CalendarClock,
  GitCompare,
  KeyRound,
  RotateCcw,
  Settings,
  StickyNote,
  X,
} from "lucide-react";
import { api } from "../../api/client";
import { useUi } from "../../stores/ui";
import { useAppSettings } from "../../stores/appSettings";
import { usePw } from "../../stores/pw";
import {
  SHORTCUT_DEFS,
  shortcutConflict,
  shortcutDef,
  shortcutFromEvent,
  type ShortcutActionId,
  type WorkbenchSwitchId,
} from "../../lib/shortcuts";
import { AUTOLOCK_SETTING_KEY, normalizeAutoLockMinutes, parseAutoLockMinutes } from "../../lib/autolock";

const WORKBENCH_META: Array<{
  id: WorkbenchSwitchId;
  label: string;
  desc: string;
  Icon: typeof BookOpenText;
}> = [
  { id: "read", label: "读取工作台", desc: "Markdown / HTML / 代码笔记浏览（必需）", Icon: BookOpenText },
  { id: "diff", label: "对比工作台", desc: "文本 / 文件 / Git 历史差异", Icon: GitCompare },
  { id: "pw", label: "密码工作台", desc: "本地凭证、密码生成与历史", Icon: KeyRound },
  { id: "worklog", label: "工作日志", desc: "日历 / 任务 / 周报 / AI 总结", Icon: CalendarClock },
  { id: "snippets", label: "常用语", desc: "便签式快捷文本（卡片 / 搜索 / 拖动）", Icon: StickyNote },
];

export function SettingsWorkbench() {
  const { loaded, error: settingsError, settings, load, setEnabled, setShortcut, resetShortcuts } = useAppSettings();
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  const autoRefresh = useUi((s) => s.autoRefresh);
  const toggleAutoRefresh = useUi((s) => s.toggleAutoRefresh);
  const workbench = useUi((s) => s.workbench);
  const setWorkbench = useUi((s) => s.setWorkbench);

  const [capturing, setCapturing] = useState<ShortcutActionId | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [autolock, setAutolock] = useState("30");
  const [ping, setPing] = useState<{ host: string; version: string } | null>(null);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  useEffect(() => {
    let alive = true;
    api
      .settingsGet(AUTOLOCK_SETTING_KEY)
      .then((raw) => {
        if (alive) setAutolock(String(parseAutoLockMinutes(raw)));
      })
      .catch(() => {});
    api
      .ping()
      .then((p) => {
        if (alive) setPing({ host: p.host, version: p.version });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const toggleWorkbench = (id: WorkbenchSwitchId, on: boolean) => {
    if (id === "read") return;
    setEnabled(id, on);
    if (!on && workbench === id) setWorkbench("read");
  };

  const handleCapture = (e: React.KeyboardEvent, action: ShortcutActionId) => {
    if (capturing !== action) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      setCapturing(null);
      setCaptureError(null);
      return;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      setShortcut(action, "");
      setCapturing(null);
      setCaptureError(null);
      return;
    }
    const binding = shortcutFromEvent(e);
    if (!binding) {
      setCaptureError("请按下包含 Ctrl/Alt/Shift/Meta 的组合键（字母/数字/F1-F12）");
      return;
    }
    const conflict = shortcutConflict(settings.shortcuts, action, binding);
    if (conflict) {
      setCaptureError(`与「${shortcutDef(conflict).label}」冲突，请换一个组合`);
      return;
    }
    setShortcut(action, binding);
    setCapturing(null);
    setCaptureError(null);
  };

  const commitAutolock = () => {
    if (autolock.trim() === "") {
      setAutolock(String(usePw.getState().autoLockMinutes));
      return;
    }
    const normalized = normalizeAutoLockMinutes(Number(autolock));
    if (normalized === null) {
      setAutolock(String(usePw.getState().autoLockMinutes));
      return;
    }
    setAutolock(String(normalized));
    void usePw.getState().setAutoLockMinutes(normalized);
  };

  const globalDefs = SHORTCUT_DEFS.filter((d) => d.scope === "global");
  const snippetDefs = SHORTCUT_DEFS.filter((d) => d.scope === "snippets");

  return (
    <div className="content-col">
      <div className="topbar">
        <div className="brand">
          <span className="logo-dot">N</span>
          NoteVault
        </div>
        <div className="seg">
          <button className="active">
            <Settings size={13} style={{ display: "inline", marginRight: 4, verticalAlign: -2 }} />
            设置
          </button>
        </div>
        <span style={{ flex: 1 }} />
        <span className="settings-top-meta">
          {ping ? `v${ping.version} · ${ping.host === "tauri" ? "桌面版" : "Web 版"}` : loaded ? "" : "正在加载设置…"}
        </span>
      </div>

      <div className="settings-wrap">
        <div className="settings-inner">
          {settingsError && (
            <div className="settings-banner warn">
              <span>设置读取失败，已暂用默认值：{settingsError}</span>
              <button className="btn-ghost" onClick={() => void load()}>
                重新加载
              </button>
            </div>
          )}

          <section className="settings-section">
            <h3>通用与外观</h3>
            <p className="settings-desc">这些设置即时生效；快捷键与工作台启停保存在 settings.json。</p>
            <div className="settings-row">
              <div className="settings-row-main">
                <div className="settings-row-title">主题</div>
                <div className="settings-row-desc">与状态栏主题按钮同步</div>
              </div>
              <div className="seg">
                <button className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")}>
                  浅色
                </button>
                <button className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}>
                  深色
                </button>
              </div>
            </div>
            <div className="settings-row">
              <div className="settings-row-main">
                <div className="settings-row-title">读取工作台自动刷新</div>
                <div className="settings-row-desc">检测笔记库外部文件变化并刷新（与顶栏按钮同步）</div>
              </div>
              <button
                className={`settings-switch${autoRefresh ? " on" : ""}`}
                role="switch"
                aria-checked={autoRefresh}
                title={autoRefresh ? "关闭自动刷新" : "开启自动刷新"}
                onClick={toggleAutoRefresh}
              />
            </div>
          </section>

          <section className="settings-section">
            <h3>工作台</h3>
            <p className="settings-desc">关闭后活动栏隐藏对应图标、快捷键失效；数据保留，可随时重新启用。</p>
            {WORKBENCH_META.map(({ id, label, desc, Icon }) => (
              <div className="settings-row" key={id}>
                <Icon size={16} className="settings-row-icon" />
                <div className="settings-row-main">
                  <div className="settings-row-title">{label}</div>
                  <div className="settings-row-desc">{desc}</div>
                </div>
                <button
                  className={`settings-switch${settings.enabled[id] ? " on" : ""}`}
                  role="switch"
                  aria-checked={settings.enabled[id]}
                  title={id === "read" ? "读取工作台为必需项" : settings.enabled[id] ? "禁用" : "启用"}
                  disabled={id === "read"}
                  onClick={() => toggleWorkbench(id, !settings.enabled[id])}
                />
              </div>
            ))}
          </section>

          <section className="settings-section">
            <h3>快捷键</h3>
            <p className="settings-desc">
              点击按键框后按下组合键；Backspace/Delete 清除，Esc 取消。需包含 Ctrl/Alt/Shift/Meta，
              同一组合不能重复。
            </p>
            <div className="settings-subh">工作台切换（全局）</div>
            {globalDefs.map((def) => (
              <ShortcutRow
                key={def.id}
                label={def.label}
                binding={settings.shortcuts[def.id]}
                capturing={capturing === def.id}
                onStart={() => {
                  setCapturing(def.id);
                  setCaptureError(null);
                }}
                onCancel={() => setCapturing(null)}
                onKeyDown={(e) => handleCapture(e, def.id)}
                onClear={() => setShortcut(def.id, "")}
              />
            ))}
            <div className="settings-subh">常用语工作台</div>
            {snippetDefs.map((def) => (
              <ShortcutRow
                key={def.id}
                label={def.label}
                binding={settings.shortcuts[def.id]}
                capturing={capturing === def.id}
                onStart={() => {
                  setCapturing(def.id);
                  setCaptureError(null);
                }}
                onCancel={() => setCapturing(null)}
                onKeyDown={(e) => handleCapture(e, def.id)}
                onClear={() => setShortcut(def.id, "")}
              />
            ))}
            {captureError && <div className="settings-error">{captureError}</div>}
            <div className="settings-actions">
              <button
                className="btn-ghost"
                onClick={() => {
                  resetShortcuts();
                  setCapturing(null);
                  setCaptureError(null);
                }}
              >
                <RotateCcw size={14} /> 恢复默认快捷键
              </button>
            </div>
          </section>

          <section className="settings-section">
            <h3>密码库</h3>
            <p className="settings-desc">主密码与「上锁」按钮仍在密码工作台顶栏；自动上锁时间已迁移到此处。</p>
            <div className="settings-row">
              <div className="settings-row-main">
                <div className="settings-row-title">自动上锁</div>
                <div className="settings-row-desc">无操作超过设定分钟后自动上锁；0 = 关闭（默认 30，最大 1440）</div>
              </div>
              <label className="settings-inline">
                <input
                  type="number"
                  min={0}
                  max={1440}
                  value={autolock}
                  onChange={(e) => setAutolock(e.target.value)}
                  onBlur={commitAutolock}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      commitAutolock();
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                />
                <span>分钟</span>
              </label>
            </div>
          </section>

          <section className="settings-section">
            <h3>关于</h3>
            <div className="settings-row">
              <div className="settings-row-main">
                <div className="settings-row-title">应用版本</div>
              </div>
              <span className="settings-mono">{ping ? `v${ping.version}` : "—"}</span>
            </div>
            <div className="settings-row">
              <div className="settings-row-main">
                <div className="settings-row-title">当前宿主</div>
              </div>
              <span className="settings-mono">
                {ping ? (ping.host === "tauri" ? "桌面版 (Tauri)" : "Web 版") : "—"}
              </span>
            </div>
            <div className="settings-row">
              <div className="settings-row-main">
                <div className="settings-row-title">数据目录</div>
                <div className="settings-row-desc">
                  settings.json / passwords.json / snippets.json 位于 %APPDATA%\notevault；
                  工作日志位于 %APPDATA%\worklog\worklog.db
                </div>
              </div>
            </div>
            <div className="settings-row">
              <div className="settings-row-main">
                <div className="settings-row-title">快捷键与设置持久化</div>
                <div className="settings-row-desc">settings.json 中的 app_settings 键；自动上锁沿用 pw_autolock_minutes。</div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function ShortcutRow({
  label,
  binding,
  capturing,
  onStart,
  onCancel,
  onKeyDown,
  onClear,
}: {
  label: string;
  binding: string;
  capturing: boolean;
  onStart: () => void;
  onCancel: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onClear: () => void;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-main">
        <div className="settings-row-title">{label}</div>
      </div>
      <button
        className={`settings-key${capturing ? " capturing" : ""}`}
        title={capturing ? "按下组合键（Esc 取消，Backspace 清除）" : "点击后按下新组合键"}
        onClick={onStart}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (capturing) onCancel();
        }}
      >
        {capturing ? "按下组合键…" : binding || "未设置"}
      </button>
      <button className="icon-btn" title="清除快捷键" onClick={onClear} disabled={!binding && !capturing}>
        <X size={13} />
      </button>
    </div>
  );
}
