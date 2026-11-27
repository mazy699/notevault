import { useEffect, useRef, useState } from "react";
import {
  useDataInfo,
  useHolidayImport,
  useHolidayStatus,
  useImportJson,
  useProjects,
  useProjectCreate,
  useProjectRename,
  useProjectDelete,
  useTaskTypes,
  useTaskTypeCreate,
  useTaskTypeUpdate,
  useTaskTypeDelete,
} from "../queries/hooks";
import { api } from "../api/client";
import { DEFAULT_TASK_TYPES, taskTypeOptions } from "../lib/colors";
import { Select } from "../components/common/Select";
import { DEFAULT_PROJECT_ID, type TaskTypeDefinition } from "../types";
import type { JiraConfigInput, JiraConfigView } from "../../../shared/types";
import type { JiraSyncStatus } from "../data/sync/types";

export function SettingsPage() {
  const holidayStatus = useHolidayStatus();
  const dataInfo = useDataInfo();
  const importMut = useHolidayImport();
  const importJsonMut = useImportJson();
  const holidayFileRef = useRef<HTMLInputElement>(null);
  const jsonFileRef = useRef<HTMLInputElement>(null);
  const taskTypesQuery = useTaskTypes();
  const taskTypes = taskTypesQuery.data ?? DEFAULT_TASK_TYPES;

  const [defaultType, setDefaultType] = useState("urgent_insert");
  const [typeLoaded, setTypeLoaded] = useState(false);

  useEffect(() => {
    if (typeLoaded) return;
    setTypeLoaded(true);
    void api
      .settingsGet("quick_default_type")
      .then((v) => {
        if (v) setDefaultType(v);
      })
      .catch(() => undefined);
  }, [typeLoaded]);

  const years = holidayStatus.data?.years ?? [];
  const yearLabel =
    years.length === 0 ? "未导入" : `${Math.min(...years)} ~ ${Math.max(...years)}（${years.length} 年）`;
  const coveredCurrent = years.includes(new Date().getFullYear());

  const onHolidayFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const r = await importMut.mutateAsync(text);
      window.alert(`节假日导入成功：${r.years.join("、")} 年，共 ${r.imported} 天`);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  };

  const onJsonFile = async (file: File | undefined) => {
    if (!file) return;
    if (!window.confirm("导入将覆盖当前全部数据（任务/记录/节假日），确定继续？")) return;
    try {
      const text = await file.text();
      await importJsonMut.mutateAsync(text);
      window.alert("数据导入成功");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  };

  const doBackup = async () => {
    try {
      const p = await api.backupNow();
      window.alert(`备份完成：\n${p}`);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  };

  const doExport = async () => {
    try {
      const p = await api.exportJson();
      window.alert(`导出完成（JSON）：\n${p}`);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="h-full overflow-auto px-4 py-4">
      <div className="mx-auto max-w-[720px] space-y-4">
        <h1 className="text-base font-semibold text-gray-800">设置</h1>

        {/* 节假日 */}
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">法定节假日（中国）</h2>
          <p className="mb-3 text-xs leading-5 text-gray-400">
            数据来源 github.com/NateScarlet/holiday-cn，含调休补班。国务院年内动态公布，新一年安排出台后请下载对应年份 JSON 导入更新。
          </p>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">
              已覆盖：<b className={coveredCurrent ? "text-gray-900" : "text-red-500"}>{yearLabel}</b>
              {!coveredCurrent && <span className="ml-2 text-xs text-red-500">⚠ 未覆盖今年，请尽快导入新数据</span>}
            </span>
            <input
              ref={holidayFileRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                void onHolidayFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => holidayFileRef.current?.click()}
              disabled={importMut.isPending}
              className="ml-auto rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              导入节假日 JSON
            </button>
          </div>
        </section>

        {/* AI 接入 */}
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">AI 接入（周报等）</h2>
          <p className="mb-3 text-xs leading-5 text-gray-400">
            兼容 OpenAI 协议（DeepSeek / 智谱 GLM / Kimi / OpenAI / 内网 Ollama 等）。数据只在你点击"生成"时发送；敏感环境可将接口地址指向内网模型。
          </p>
          <AiSection />
        </section>

        {/* Jira 同步 */}
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">Jira 同步（只读）</h2>
          <p className="mb-3 text-xs leading-5 text-gray-400">
            把公司 Jira 中分配给你的子任务 / Bug 导入任务列表、周视图与月视图；只读，不回写 Jira。
            同步后很少需要手动建任务，但离线 / 临时任务仍可手动创建。
          </p>
          <JiraSection />
        </section>

        {/* 数据与备份 */}
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">数据与备份</h2>
          <p className="mb-3 text-xs leading-5 text-gray-400">
            每次写操作后自动落盘；应用启动时自动备份到 backups/ 目录，保留最近 10 份。
          </p>
          {dataInfo.data && (
            <div className="mb-3 rounded bg-gray-50 px-3 py-2 text-xs text-gray-500">
              <div>数据目录：{dataInfo.data.dataDir}</div>
              <div>数据库文件：{dataInfo.data.dbFile}</div>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => void doBackup()} className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
              立即备份
            </button>
            <button onClick={() => void doExport()} className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
              导出全部数据（JSON）
            </button>
            <input
              ref={jsonFileRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                void onJsonFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => jsonFileRef.current?.click()}
              disabled={importJsonMut.isPending}
              className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              从 JSON 导入（覆盖）
            </button>
          </div>
        </section>

        {/* 项目管理 */}
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">项目管理</h2>
          <p className="mb-3 text-xs leading-5 text-gray-400">
            任务可归属项目；新任务默认归入"默认项目"（不可删除）。删除项目时，其下任务会自动归入默认项目。
          </p>
          <ProjectList />
        </section>

        {/* 演示数据 */}
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">演示数据</h2>
          <p className="mb-3 text-xs leading-5 text-gray-400">
            一键写入一组模拟"排期任务被线上问题打断"的示例任务与记录，快速体验周视图色块、悬浮跨天高亮、日视图聚合等效果。
            清除时仅删除演示任务，不影响你新建的数据。
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                void api
                  .demoSeed()
                  .then((r) => {
                    window.alert(r.tasks > 0 ? `已写入 ${r.tasks} 个演示任务，去周视图看效果吧` : "演示数据已存在，无需重复载入");
                  })
                  .catch((e: unknown) => window.alert(e instanceof Error ? e.message : String(e)));
              }}
              className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700"
            >
              载入演示数据
            </button>
            <button
              onClick={() => {
                void api
                  .demoClear()
                  .then((n) => {
                    window.alert(n > 0 ? `已清除 ${n} 个演示任务` : "当前没有演示数据");
                  })
                  .catch((e: unknown) => window.alert(e instanceof Error ? e.message : String(e)));
              }}
              className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              一键清除演示数据
            </button>
          </div>
        </section>

        {/* 任务类型 */}
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">任务类型</h2>
          <p className="mb-3 text-xs leading-5 text-gray-400">
            内置“线上/排查”已合并原线上问题与调查排查。可以新增自定义类型，并设置标签颜色。
          </p>
          <TaskTypeManager types={taskTypes} />
        </section>

        {/* 偏好 */}
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">偏好</h2>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-gray-600">快速新建的默认任务类型</span>
            <Select
              value={defaultType}
              onChange={(v) => {
                setDefaultType(v);
                void api.settingsSet("quick_default_type", v).catch(() => undefined);
              }}
              options={taskTypeOptions(taskTypes)}
              className="w-40"
            />
            <span className="text-[11px] text-gray-400">打断发生时按 Ctrl+Shift+N 一键新建</span>
          </div>
        </section>
      </div>
    </div>
  );
}

function TaskTypeManager({ types }: { types: TaskTypeDefinition[] }) {
  const createMut = useTaskTypeCreate();
  const updateMut = useTaskTypeUpdate();
  const deleteMut = useTaskTypeDelete();
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#14b8a6");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editColor, setEditColor] = useState("#14b8a6");

  const alertErr = (error: unknown): void => {
    window.alert(error instanceof Error ? error.message : String(error));
  };

  const add = (): void => {
    if (!newLabel.trim()) return;
    createMut.mutate(
      { label: newLabel, color: newColor },
      {
        onSuccess: () => {
          setNewLabel("");
          setNewColor("#14b8a6");
        },
        onError: alertErr,
      }
    );
  };

  const saveEdit = (): void => {
    if (!editingId) return;
    updateMut.mutate(
      { id: editingId, label: editLabel, color: editColor },
      { onSuccess: () => setEditingId(null), onError: alertErr }
    );
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        {types.map((type) => (
          <div key={type.id} className="flex items-center gap-2 rounded border border-gray-100 px-3 py-2">
            {editingId === type.id ? (
              <>
                <input
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) saveEdit();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="min-w-0 flex-1 rounded border border-blue-400 px-2 py-1 text-sm focus:outline-none"
                />
                <input
                  type="color"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  className="h-7 w-9 rounded border border-gray-300 bg-white p-0.5"
                  title="选择颜色"
                />
                <button onClick={saveEdit} className="rounded bg-blue-600 px-2.5 py-1 text-xs text-white hover:bg-blue-700">
                  保存
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="rounded border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
                >
                  取消
                </button>
              </>
            ) : (
              <>
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: type.color }} />
                <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{type.label}</span>
                {type.builtin ? (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">内置</span>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setEditingId(type.id);
                        setEditLabel(type.label);
                        setEditColor(type.color);
                      }}
                      className="rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-blue-600"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`删除任务类型“${type.label}”？`)) {
                          deleteMut.mutate(type.id, { onError: alertErr });
                        }
                      }}
                      className="rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-red-50 hover:text-red-500"
                    >
                      删除
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) add();
          }}
          placeholder="新任务类型名称"
          className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
        <input
          type="color"
          value={newColor}
          onChange={(e) => setNewColor(e.target.value)}
          className="h-8 w-10 rounded border border-gray-300 bg-white p-0.5"
          title="选择颜色"
        />
        <button
          onClick={add}
          disabled={createMut.isPending || !newLabel.trim()}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          添加类型
        </button>
      </div>
    </div>
  );
}

const AI_PRESETS = [
  { label: "DeepSeek 官方", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { label: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
  { label: "Moonshot Kimi", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
  { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { label: "Ollama 本地", baseUrl: "http://localhost:11434/v1", model: "" },
];

/** AI 接入配置：预设快捷填充 + 测试连接；ai.json 字段可覆盖 UI 配置 */
function AiSection() {
  const [cfg, setCfg] = useState({ baseUrl: "", apiKey: "", model: "" });
  const [overrides, setOverrides] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [savedHint, setSavedHint] = useState(false);

  useEffect(() => {
    if (loaded) return;
    setLoaded(true);
    void api
      .aiGetConfig()
      .then((c) => {
        setCfg({ baseUrl: c.baseUrl, apiKey: c.apiKey, model: c.model });
        setOverrides(c.overrides);
      })
      .catch(() => undefined);
  }, [loaded]);

  const alertErr = (e: unknown): void => window.alert(e instanceof Error ? e.message : String(e));

  const save = (): void => {
    void api
      .aiSaveConfig(cfg)
      .then(() => {
        setSavedHint(true);
        setTimeout(() => setSavedHint(false), 1500);
      })
      .catch(alertErr);
  };

  const test = (): void => {
    setTesting(true);
    setTestResult(null);
    void api
      .aiTestConnection(cfg)
      .then((r) => {
        setTesting(false);
        setTestResult({ ok: r.ok, text: r.ok ? `连接正常${r.reply ? "：" + r.reply : ""}` : r.error ?? "未知错误" });
      })
      .catch(alertErr);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-gray-500">预设：</span>
        {AI_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => setCfg((c) => ({ ...c, baseUrl: p.baseUrl, model: p.model || c.model }))}
            className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <label className="text-xs text-gray-500">
          接口地址
          <input
            value={cfg.baseUrl}
            onChange={(e) => setCfg((c) => ({ ...c, baseUrl: e.target.value }))}
            placeholder="https://api.deepseek.com/v1"
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 font-mono text-[13px] focus:border-blue-500 focus:outline-none"
          />
        </label>
        <label className="text-xs text-gray-500">
          API Key（本地模型可留空）
          <input
            type="password"
            value={cfg.apiKey}
            onChange={(e) => setCfg((c) => ({ ...c, apiKey: e.target.value }))}
            placeholder="sk-..."
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 font-mono text-[13px] focus:border-blue-500 focus:outline-none"
          />
        </label>
        <label className="text-xs text-gray-500">
          模型名（以服务商套餐文档为准）
          <input
            value={cfg.model}
            onChange={(e) => setCfg((c) => ({ ...c, model: e.target.value }))}
            placeholder="deepseek-chat"
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 font-mono text-[13px] focus:border-blue-500 focus:outline-none"
          />
        </label>
      </div>
      {overrides.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
          以下字段正被数据目录下的 ai.json 覆盖（以文件为准）：{overrides.join("、")}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          保存配置
        </button>
        <button
          onClick={test}
          disabled={testing}
          className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {testing ? "测试中…" : "测试连接"}
        </button>
        {savedHint && <span className="text-xs text-green-600">已保存 ✓</span>}
        {testResult && (
          <span className={`text-xs ${testResult.ok ? "text-green-600" : "text-red-500"}`}>{testResult.text}</span>
        )}
      </div>
      <p className="text-[11px] leading-5 text-gray-400">
        进阶：在数据目录下放置 ai.json（字段 baseUrl / apiKey / model / promptTemplate），非空字段将覆盖以上 UI
        配置，promptTemplate 可自定义周报格式（需包含 {"{{DATA}}"} 占位符）。
      </p>
    </div>
  );
}

/** Jira 只读同步配置：token 由宿主保存，前端只拿到掩码 */
function JiraSection() {
  const [cfg, setCfg] = useState<JiraConfigView | null>(null);
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<JiraSyncStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [savedHint, setSavedHint] = useState(false);

  const alertErr = (e: unknown): void => window.alert(e instanceof Error ? e.message : String(e));

  const reload = async (): Promise<void> => {
    const [c, s] = await Promise.all([api.jiraConfigGet(), api.jiraStatus()]);
    setCfg(c);
    setStatus(s);
  };

  useEffect(() => {
    if (loaded) return;
    setLoaded(true);
    void reload().catch(alertErr);
  }, [loaded]);

  if (!cfg) return <div className="text-xs text-gray-400">加载中…</div>;

  const update = (patch: Partial<JiraConfigView>): void =>
    setCfg((c) => (c ? { ...c, ...patch } : c));

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      const input: JiraConfigInput = {
        baseUrl: cfg.baseUrl,
        authType: cfg.authType,
        email: cfg.email,
        jql: cfg.jql,
        includeStorySubtasks: cfg.includeStorySubtasks,
        intervalMinutes: cfg.intervalMinutes,
        enabled: cfg.enabled,
        token: token.trim() ? token.trim() : null,
      };
      const next = await api.jiraConfigSave(input);
      setCfg(next);
      setToken("");
      setSavedHint(true);
      setTimeout(() => setSavedHint(false), 1500);
    } catch (e) {
      alertErr(e);
    } finally {
      setSaving(false);
    }
  };

  const test = async (): Promise<void> => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api.jiraTest();
      setTestResult({ ok: r.ok, text: r.message });
    } catch (e) {
      setTestResult({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  };

  const runSync = async (full: boolean): Promise<void> => {
    if (
      full &&
      !window.confirm(
        "全量同步会重新拉取全部匹配的 issue，并把 Jira 中已消失的任务标记为“已不可见”（不会删除任务与本地记录）。继续？"
      )
    ) {
      return;
    }
    setSyncing(true);
    try {
      const r = await api.jiraSync(full);
      await reload();
      const lines = [`拉取 ${r.fetched} 条`, `新增 ${r.created}`, `更新 ${r.updated}`, `跳过 ${r.skipped}`];
      if (r.missing) lines.push(`标记消失 ${r.missing}`);
      if (r.warnings.length) lines.push(`警告：${r.warnings.join("；")}`);
      window.alert(`同步完成：${lines.join("，")}`);
    } catch (e) {
      alertErr(e);
    } finally {
      setSyncing(false);
    }
  };

  const clear = async (): Promise<void> => {
    if (!window.confirm("清除 Jira 连接配置与 Token？已导入的任务和本地工作记录不会被删除。")) return;
    try {
      await api.jiraConfigClear();
      setToken("");
      setTestResult(null);
      await reload();
    } catch (e) {
      alertErr(e);
    }
  };

  const inputCls =
    "mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none";

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={cfg.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
        />
        启用自动同步（应用打开期间按间隔拉取，关闭应用即停止）
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-gray-500">
          Jira 地址（含 context path，不要带 /rest）
          <input
            value={cfg.baseUrl}
            onChange={(e) => update({ baseUrl: e.target.value })}
            placeholder="https://jira.company.com"
            className={inputCls}
          />
        </label>
        <label className="text-xs text-gray-500">
          认证方式
          <Select
            value={cfg.authType}
            onChange={(v) => update({ authType: v as JiraConfigView["authType"] })}
            options={[
              { value: "pat", label: "Server / DC · PAT" },
              { value: "cloud", label: "Cloud · 邮箱 + API Token" },
            ]}
            className="mt-1 w-full"
          />
        </label>
        <label className="text-xs text-gray-500">
          邮箱（仅 Cloud）
          <input
            value={cfg.email}
            onChange={(e) => update({ email: e.target.value })}
            placeholder="you@company.com"
            className={inputCls}
          />
        </label>
        <label className="text-xs text-gray-500">
          Token / PAT
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={
              cfg.hasToken ? `已保存 ****${cfg.tokenHint ?? ""}，留空表示不修改` : "粘贴 API Token 或 PAT"
            }
            className={`${inputCls} font-mono text-[13px]`}
          />
        </label>
        <label className="text-xs text-gray-500">
          同步间隔（分钟，5–240）
          <input
            type="number"
            min={5}
            max={240}
            value={cfg.intervalMinutes}
            onChange={(e) => update({ intervalMinutes: Number(e.target.value) || 15 })}
            className={inputCls}
          />
        </label>
        <label className="flex items-end gap-2 pb-1 text-xs text-gray-500">
          <input
            type="checkbox"
            checked={cfg.includeStorySubtasks}
            onChange={(e) => update({ includeStorySubtasks: e.target.checked })}
          />
          同步“我负责的 Story”下的全部子任务
        </label>
      </div>

      <label className="block text-xs text-gray-500">
        JQL（高级；留空使用默认）
        <textarea
          value={cfg.jql}
          onChange={(e) => update({ jql: e.target.value })}
          rows={2}
          className="mt-1 w-full resize-y rounded border border-gray-300 px-2 py-1.5 font-mono text-[12px] focus:border-blue-500 focus:outline-none"
        />
      </label>
      <p className="text-[11px] leading-5 text-gray-400">
        默认：<code>assignee = currentUser() AND issuetype in (Sub-task, Bug) ORDER BY updated ASC</code>。
        Cloud 地址填 <code>https://xxx.atlassian.net</code>；只同步子任务可删掉 Bug。测试与同步使用已保存的配置，
        修改后请先点“保存配置”。Token 只存本机 <code>%APPDATA%/worklog/jira.json</code>，不进数据库、不进 JSON
        导出；请求由宿主代发，前端只拿掩码。
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => void save()}
          disabled={saving}
          className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存配置"}
        </button>
        <button
          onClick={() => void test()}
          disabled={testing}
          className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {testing ? "测试中…" : "测试连接"}
        </button>
        <button
          onClick={() => void runSync(false)}
          disabled={syncing}
          className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {syncing ? "同步中…" : "立即同步"}
        </button>
        <button
          onClick={() => void runSync(true)}
          disabled={syncing}
          className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          全量同步
        </button>
        <button
          onClick={() => void clear()}
          className="rounded border border-gray-200 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50"
        >
          清除配置
        </button>
        {savedHint && <span className="text-xs text-green-600">已保存 ✓</span>}
      </div>

      {testResult && (
        <div className={`text-xs ${testResult.ok ? "text-green-600" : "text-red-500"}`}>
          {testResult.text}
        </div>
      )}

      <div className="rounded bg-gray-50 px-3 py-2 text-xs text-gray-500">
        {status?.lastSync ? <span>上次同步：{status.lastSync}</span> : <span>尚未同步</span>}
        {status?.lastResult && (
          <span className={status.lastResult.ok ? "ml-3 text-green-600" : "ml-3 text-red-500"}>
            {status.lastResult.ok
              ? `拉取 ${status.lastResult.fetched} · 新增 ${status.lastResult.created} · 更新 ${status.lastResult.updated} · 跳过 ${status.lastResult.skipped}${
                  status.lastResult.missing ? ` · 消失 ${status.lastResult.missing}` : ""
                }`
              : `失败：${status.lastResult.error ?? "未知错误"}`}
          </span>
        )}
      </div>

      {status?.lastResult?.warnings?.length ? (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
          {status.lastResult.warnings.join("；")}
        </div>
      ) : null}
    </div>
  );
}

/** 项目管理列表：新增 / 内联重命名 / 删除（默认项目受保护） */function ProjectList() {
  const projects = useProjects();
  const createMut = useProjectCreate();
  const renameMut = useProjectRename();
  const deleteMut = useProjectDelete();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const alertErr = (e: unknown): void => window.alert(e instanceof Error ? e.message : String(e));

  const add = (): void => {
    if (!newName.trim()) return;
    createMut.mutate(newName, {
      onSuccess: () => setNewName(""),
      onError: alertErr,
    });
  };

  const saveRename = (): void => {
    if (editingId == null) return;
    renameMut.mutate(
      { id: editingId, name: editName },
      {
        onSuccess: () => setEditingId(null),
        onError: alertErr,
      }
    );
  };

  const remove = (id: number, name: string): void => {
    if (window.confirm(`删除项目「${name}」？其下任务将自动归入默认项目。`)) {
      deleteMut.mutate(id, { onError: alertErr });
    }
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        {(projects.data ?? []).map((p) => (
          <div key={p.id} className="flex items-center gap-2 rounded border border-gray-100 px-3 py-1.5">
            {editingId === p.id ? (
              <>
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) saveRename();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="flex-1 rounded border border-blue-400 px-2 py-1 text-sm focus:outline-none"
                />
                <button onClick={saveRename} className="rounded bg-blue-600 px-2.5 py-1 text-xs text-white hover:bg-blue-700">
                  保存
                </button>
                <button onClick={() => setEditingId(null)} className="rounded border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50">
                  取消
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-gray-800">{p.name}</span>
                {p.id === DEFAULT_PROJECT_ID ? (
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-600">默认 · 不可删除</span>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setEditingId(p.id);
                        setEditName(p.name);
                      }}
                      className="rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-blue-600"
                    >
                      重命名
                    </button>
                    <button
                      onClick={() => remove(p.id, p.name)}
                      className="rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-red-50 hover:text-red-500"
                    >
                      删除
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) add();
          }}
          placeholder="新项目名称（如：订单系统）"
          className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          onClick={add}
          disabled={createMut.isPending}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          添加项目
        </button>
      </div>
    </div>
  );
}
