import { useEffect, useState } from "react";
import { useTaskDelete, useTaskDetail, useTaskUpdate, useEntryCreate, useProjects, useTaskTypes } from "../queries/hooks";
import { useUi } from "../stores/ui";
import { EntryGroupList } from "../components/entry/EntryGroupList";
import { EFFORT_OPTIONS, fmtHours } from "../lib/effort";
import {
  DEFAULT_TASK_TYPES,
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  taskTypeColor,
  taskTypeOptions,
} from "../lib/colors";
import { Select } from "../components/common/Select";
import { ExternalBadge } from "../components/task/ExternalBadge";
import { DEFAULT_PROJECT_ID } from "../types";
import { todayStr, weekdayCN } from "../lib/date";
import type { TaskPriority, TaskStatus } from "../types";

export function TaskDetailPage() {
  const returnPage = useUi((s) => s.taskReturnPage);
  const taskId = useUi((s) => s.taskId);
  const focusDate = useUi((s) => s.taskFocusDate);
  const nav = useUi((s) => s.nav);
  const { data, isLoading } = useTaskDetail(taskId);

  const [title, setTitle] = useState("");
  const [type, setType] = useState("planned_dev");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [projectSel, setProjectSel] = useState<string>(String(DEFAULT_PROJECT_ID));
  const [estimate, setEstimate] = useState("");
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [description, setDescription] = useState("");
  const [savedHint, setSavedHint] = useState(false);
  const projects = useProjects();
  const taskTypes = useTaskTypes().data ?? DEFAULT_TASK_TYPES;
  const typeOptions = taskTypeOptions(taskTypes);

  useEffect(() => {
    const t = data?.task;
    if (!t) return;
    setTitle(t.title);
    setType(t.type);
    setPriority(t.priority);
    setStatus(t.status);
    setProjectSel(String(t.projectId));
    setEstimate(t.estimateDays != null ? String(t.estimateDays) : "");
    setWindowStart(t.windowStart ?? "");
    setWindowEnd(t.windowEnd ?? "");
    setDescription(t.description);
  }, [data?.task]);

  const updateMut = useTaskUpdate();
  const deleteMut = useTaskDelete();
  const entryMut = useEntryCreate();

  const [entryDate, setEntryDate] = useState(focusDate ?? todayStr());
  const [entryContent, setEntryContent] = useState("");
  const [entryEffort, setEntryEffort] = useState("");

  if (taskId == null) {
    return <div className="py-20 text-center text-sm text-gray-400">未选择任务</div>;
  }
  if (isLoading) return <div className="py-20 text-center text-sm text-gray-400">加载中…</div>;
  if (!data) return <div className="py-20 text-center text-sm text-red-500">任务不存在</div>;

  const task = data.task;

  const save = async () => {
    try {
      await updateMut.mutateAsync({
        ...task,
        title,
        type,
        priority,
        status,
        estimateDays: estimate.trim() === "" ? null : Number(estimate),
        windowStart: windowStart || null,
        windowEnd: windowEnd || null,
        projectId: Number(projectSel) || DEFAULT_PROJECT_ID,
        description,
      });
      setSavedHint(true);
      setTimeout(() => setSavedHint(false), 1500);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  };

  const addEntry = async () => {
    if (!entryContent.trim()) {
      window.alert("记录内容不能为空");
      return;
    }
    try {
      await entryMut.mutateAsync({
        taskId: task.id,
        entryDate: entryDate,
        content: entryContent,
        effortHours: entryEffort.trim() === "" ? null : Number(entryEffort),
      });
      setEntryContent("");
      setEntryEffort("");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  };

  const removeTask = () => {
    if (window.confirm(`取消并归档任务「${task.title}」？（软删除，历史记录保留，可在任务列表筛选"已取消"查看）`)) {
      deleteMut.mutate(
        { taskId: task.id, hard: false },
        {
          onSuccess: () => nav("tasks"),
          onError: (e) => window.alert(e instanceof Error ? e.message : String(e)),
        }
      );
    }
  };

  const deleteForever = () => {
    const entryCount = data.days.reduce((count, day) => count + day.entries.length, 0);
    const detail =
      entryCount > 0
        ? `该任务及其 ${entryCount} 条工作记录都会被永久删除，且无法恢复。`
        : "该任务会被永久删除，且无法恢复。";
    if (window.confirm(`永久删除任务「${task.title}」？\n\n${detail}`)) {
      deleteMut.mutate(
        { taskId: task.id, hard: true },
        {
          onSuccess: () => nav("tasks"),
          onError: (e) => window.alert(e instanceof Error ? e.message : String(e)),
        }
      );
    }
  };

  const deviation = task.estimateDays != null && data.stats.occupiedDays > task.estimateDays;

  return (
    <div className="h-full overflow-auto px-4 py-4">
      <div className="mx-auto max-w-[860px]">
        <button className="mb-3 text-xs text-gray-400 hover:text-blue-600" onClick={() => nav(returnPage)}>
          ← 返回
        </button>

        {/* 头部：属性编辑 */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: taskTypeColor(taskTypes, type) }} />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="flex-1 rounded border border-transparent px-1 py-1 text-lg font-semibold text-gray-900 hover:border-gray-200 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {task.externalSource && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <ExternalBadge task={task} showParent />
              <span className="text-[11px] text-gray-400">
                标题 / 状态 / 日期以 Jira 为准，下次同步会覆盖；本地工作记录不受影响
              </span>
            </div>
          )}

          {task.externalMissing && (
            <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
              该任务在上次全量同步时已不在 Jira 结果中（可能已转派 / 关闭 / 删除）。任务与本地记录都保留；
              如确认不再需要，可在下方手动归档。
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="text-xs text-gray-500">
              所属项目
              <Select
                value={projectSel}
                onChange={setProjectSel}
                options={(projects.data ?? []).map((p) => ({ value: String(p.id), label: p.name }))}
                className="mt-1 w-full"
              />
            </div>
            <div className="text-xs text-gray-500">
              类型
              <Select value={type} onChange={setType} options={typeOptions} className="mt-1 w-full" />
            </div>
            <div className="text-xs text-gray-500">
              优先级
              <Select value={priority} onChange={(v) => setPriority(v as TaskPriority)} options={PRIORITY_OPTIONS} className="mt-1 w-full" />
            </div>
            <div className="text-xs text-gray-500">
              状态
              <Select value={status} onChange={(v) => setStatus(v as TaskStatus)} options={STATUS_OPTIONS} className="mt-1 w-full" />
            </div>
            <label className="text-xs text-gray-500">
              预估工作量（工作日）
              <input
                type="number"
                min={0}
                step={0.5}
                value={estimate}
                onChange={(e) => setEstimate(e.target.value)}
                placeholder="如 3"
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-gray-500">
              期望时间窗 · 开始
              <input type="date" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-gray-500">
              期望时间窗 · 结束
              <input type="date" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
            </label>
          </div>

          {/* 自动统计 */}
          <div className="mt-3 flex items-center gap-4 rounded bg-gray-50 px-3 py-2 text-xs text-gray-600">
            <span>
              实际占用 <b className="text-gray-900">{data.stats.occupiedDays}</b> 天
            </span>
            {data.stats.totalHours != null && (
              <span>
                累计投入 <b className="text-gray-900">{fmtHours(data.stats.totalHours)}</b>
              </span>
            )}
            {task.estimateDays != null && (
              <span className={deviation ? "text-red-500" : ""}>
                预估 {task.estimateDays} 天{deviation ? `（已超出 ${data.stats.occupiedDays - task.estimateDays} 天）` : ""}
              </span>
            )}
            <span>最近活动 {data.stats.lastActivity ?? "无"}</span>
            {task.externalSource && (
              <span className="text-gray-400">
                Jira 状态 {task.externalStatus ?? "—"} · 同步于 {task.externalSyncedAt ?? "—"}
              </span>
            )}
          </div>

          <label className="mt-3 block text-xs text-gray-500">
            任务描述 / 背景（Markdown）
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full resize-y rounded border border-gray-200 px-2 py-1.5 text-[13px] focus:border-blue-500 focus:outline-none"
            />
          </label>

          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={removeTask} className="text-xs text-gray-400 hover:text-amber-600">
                取消并归档
              </button>
              <button onClick={deleteForever} className="text-xs font-medium text-red-500 hover:text-red-600">
                永久删除
              </button>
            </div>
            <div className="flex items-center gap-2">
              {savedHint && <span className="text-xs text-green-600">已保存 ✓</span>}
              <button
                onClick={() => void save()}
                disabled={updateMut.isPending}
                className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                保存修改
              </button>
            </div>
          </div>
        </div>

        {/* 新增条目 */}
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-2 text-xs font-semibold text-gray-500">记录工作进展（按日期存档，默认今天）</div>
          <div className="flex gap-2">
            <input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="w-40 rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
            <span className="self-center text-xs text-gray-400">{entryDate ? weekdayCN(entryDate) : ""}</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={entryEffort}
              onChange={(e) => setEntryEffort(e.target.value)}
              placeholder="小时（选填）"
              className="w-28 rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
            {EFFORT_OPTIONS.map((o) => (
              <button
                key={o.v}
                onClick={() => setEntryEffort(String(o.v))}
                className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
              >
                {o.label}
              </button>
            ))}
          </div>
          <textarea
            value={entryContent}
            onChange={(e) => setEntryContent(e.target.value)}
            rows={4}
            placeholder="今天做了什么、调查结论、贴 SQL / 代码…（支持 Markdown）"
            className="mt-2 w-full resize-y rounded border border-gray-300 px-2 py-1.5 font-mono text-[13px] focus:border-blue-500 focus:outline-none"
          />
          <div className="mt-2 flex justify-end">
            <button
              onClick={() => void addEntry()}
              disabled={entryMut.isPending}
              className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              保存记录
            </button>
          </div>
        </div>

        {/* 历史条目（按日期倒序） */}
        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold text-gray-500">工作记录 · 按日期</div>
          {data.days.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white py-10 text-center text-sm text-gray-400">
              还没有工作记录
            </div>
          ) : (
            <div className="space-y-3">
              {data.days.map((d) => (
                <div key={d.date} id={`day-${d.date}`} className={d.date === focusDate ? "rounded-xl ring-2 ring-blue-300" : ""}>
                  <div className="mb-1 px-1 text-[11px] font-medium text-gray-400">
                    {d.date} {weekdayCN(d.date)}
                  </div>
                  <EntryGroupList groups={[{ task, entries: d.entries }]} bare />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
