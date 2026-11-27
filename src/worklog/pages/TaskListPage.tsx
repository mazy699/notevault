import { useState } from "react";
import { useTaskList, useProjects, useTaskTypes } from "../queries/hooks";
import { useUi } from "../stores/ui";
import { Select } from "../components/common/Select";
import { QuickStatusActions } from "../components/task/QuickStatusActions";
import {
  DEFAULT_TASK_TYPES,
  PRIORITY_LABELS,
  STATUS_OPTIONS,
  taskTypeColor,
  taskTypeLabel,
  taskTypeOptions,
} from "../lib/colors";

export function TaskListPage() {
  const [status, setStatus] = useState<string>("");
  const [type, setType] = useState<string>("");
  const [project, setProject] = useState<string>("");
  const [source, setSource] = useState<string>("");
  const [search, setSearch] = useState("");
  const projects = useProjects();
  const taskTypes = useTaskTypes().data ?? DEFAULT_TASK_TYPES;
  const typeOptions = taskTypeOptions(taskTypes);
  const { data, isLoading } = useTaskList({
    status: status || null,
    type: type || null,
    search: search || null,
    projectId: project ? Number(project) : null,
    source: source || null,
  });
  const openTask = useUi((s) => s.openTask);
  const projectNameById = new Map((projects.data ?? []).map((p) => [p.id, p.name]));

  return (
    <div className="h-full overflow-auto px-4 py-4">
      <div className="mx-auto max-w-[1000px]">
        <div className="mb-3 flex items-center gap-2">
          <h1 className="text-base font-semibold text-gray-800">任务列表</h1>
          <span className="text-[11px] text-gray-400">已完成/已取消的任务保留全部历史记录与色块</span>
        </div>

        <div className="mb-3 flex gap-2">
          <Select
            value={project}
            onChange={setProject}
            options={[{ value: "", label: "全部项目" }, ...(projects.data ?? []).map((p) => ({ value: String(p.id), label: p.name }))]}
            className="w-36"
          />
          <Select
            value={status}
            onChange={setStatus}
            options={[{ value: "", label: "全部状态" }, ...STATUS_OPTIONS]}
            className="w-32"
          />
          <Select
            value={type}
            onChange={setType}
            options={[{ value: "", label: "全部类型" }, ...typeOptions]}
            className="w-32"
          />
          <Select
            value={source}
            onChange={setSource}
            options={[
              { value: "", label: "全部来源" },
              { value: "local", label: "仅本地" },
              { value: "jira", label: "Jira 同步" },
            ]}
            className="w-32"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索标题 / 描述"
            className="flex-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {isLoading && <div className="py-16 text-center text-sm text-gray-400">加载中…</div>}
          {data && data.length === 0 && (
            <div className="py-16 text-center text-sm text-gray-400">没有匹配的任务</div>
          )}
          {data &&
            data.map((t) => (
              <div
                key={t.id}
                className="grid grid-cols-[minmax(0,1fr)_140px_136px] items-center gap-4 border-b border-gray-100 px-4 py-2.5 text-left last:border-b-0 hover:bg-blue-50/40"
              >
                <button type="button" onClick={() => openTask(t.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: taskTypeColor(taskTypes, t.type) }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`truncate text-sm font-medium ${t.status === "cancelled" ? "text-gray-400 line-through" : "text-gray-800"}`}>
                        {t.title}
                      </span>
                      {t.externalSource === "jira" && (
                        <span
                          className="shrink-0 rounded bg-blue-100 px-1 py-px font-mono text-[10px] font-medium text-blue-700"
                          title="来自 Jira 同步的任务"
                        >
                          {t.externalId}
                        </span>
                      )}
                      {t.externalMissing && (
                        <span
                          className="shrink-0 rounded bg-amber-100 px-1 py-px text-[10px] font-medium text-amber-700"
                          title="已从 Jira 同步结果中消失（被转派/关闭/删除），本地记录保留"
                        >
                          源缺失
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {projectNameById.get(t.projectId) ? `${projectNameById.get(t.projectId)} · ` : ""}
                      {taskTypeLabel(taskTypes, t.type)} · 优先级 {PRIORITY_LABELS[t.priority]}
                      {t.lastActivity ? ` · 最近活动 ${t.lastActivity}` : " · 尚无记录"}
                    </div>
                  </div>
                </button>
                <div className="text-right text-[11px]">
                  {t.status !== "in_progress" && t.status !== "done" && (
                    <div className="mb-1 text-gray-500">
                      {t.status === "todo"
                        ? "待开始"
                        : t.status === "on_hold"
                          ? "搁置"
                          : t.status === "cancelled"
                            ? "已取消"
                            : t.status}
                    </div>
                  )}
                  <div className="text-gray-400">
                    {t.estimateDays != null ? `预估 ${t.estimateDays} 天` : "未预估"}
                    {` / 实际 ${t.occupiedDays} 天`}
                  </div>
                </div>
                <QuickStatusActions taskId={t.id} status={t.status} className="justify-self-end" />
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
