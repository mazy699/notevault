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
