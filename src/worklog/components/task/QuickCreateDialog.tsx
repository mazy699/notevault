import { useEffect, useState } from "react";
import { Modal } from "../common/Modal";
import { Select } from "../common/Select";
import { useUi } from "../../stores/ui";
import { useTaskCreate, useTaskSetStatus, useProjects, useTaskTypes } from "../../queries/hooks";
import {
  DEFAULT_TASK_TYPES,
  PRIORITY_OPTIONS,
  taskTypeOptions,
} from "../../lib/colors";
import { DEFAULT_PROJECT_ID } from "../../types";
import { api } from "../../api/client";
import { EFFORT_OPTIONS } from "../../lib/effort";
import { addDaysStr, todayStr } from "../../lib/date";
import type { TaskPriority, TaskStatus } from "../../types";

/** 快速新建的初始状态选项："auto" 沿用创建默认（待办；填了今日记录则进行中） */
const INITIAL_STATUS_OPTIONS: { value: "auto" | TaskStatus; label: string }[] = [
  { value: "auto", label: "自动" },
  { value: "todo", label: "待办" },
  { value: "in_progress", label: "进行中" },
  { value: "done", label: "已完成" },
  { value: "on_hold", label: "挂起" },
  { value: "cancelled", label: "取消" },
];

/** 快速新建：打断任务一步落地（默认类型=紧急插入，可在设置页修改默认值） */
export function QuickCreateDialog() {
  const open = useUi((s) => s.quickOpen);
  const setOpen = useUi((s) => s.setQuickOpen);

  const [title, setTitle] = useState("");
  const [type, setType] = useState("urgent_insert");
  const [priority, setPriority] = useState<TaskPriority>("high");
  const [projectId, setProjectId] = useState<string>(String(DEFAULT_PROJECT_ID));
  const [status, setStatus] = useState<"auto" | TaskStatus>("auto");
  const [start, setStart] = useState(todayStr());
  // 与 start 取同一次 todayStr，避免零点跨日时两者取到不同日期
  const [end, setEnd] = useState(() => addDaysStr(start, 1));
  const [estimateH, setEstimateH] = useState("4");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [effort, setEffort] = useState("");
  const [loaded, setLoaded] = useState(false);
  const projects = useProjects();
  const taskTypes = useTaskTypes().data ?? DEFAULT_TASK_TYPES;
  const typeOptions = taskTypeOptions(taskTypes);

  useEffect(() => {
    if (!open || loaded) return;
    setLoaded(true);
    void api
      .settingsGet("quick_default_type")
      .then((v) => {
        if (v) setType(v);
      })
      .catch(() => undefined);
  }, [open, loaded]);

  const createMut = useTaskCreate();
  const statusMut = useTaskSetStatus();

  const submit = async () => {
    if (!title.trim()) {
      window.alert("标题不能为空");
      return;
    }
    const hours = estimateH.trim() === "" ? null : Number(estimateH);
    if (hours != null && !(hours > 0 && hours <= 800)) {
      window.alert("预估工时应为 0~800 之间的小时数（800h = 100 工作日）");
      return;
    }
    try {
      const task = await createMut.mutateAsync({
        title,
        description: description.trim() || undefined,
        type,
        priority,
        projectId: Number(projectId) || DEFAULT_PROJECT_ID,
        windowStart: start || null,
        windowEnd: end || null,
        // 工时按 8h = 1 工作日折算为预估工作量（4h = 0.5 天）
        estimateDays: hours == null ? null : Math.round((hours / 8) * 100) / 100,
        todayEntryContent: content.trim() || null,
        todayEntryHours: effort.trim() === "" ? null : Number(effort),
      });
      // 选定了初始状态且与创建默认不同时，创建后立即应用
      if (status !== "auto" && task.status !== status) {
        await statusMut.mutateAsync({ taskId: task.id, status });
      }
      setTitle("");
      setDescription("");
      setContent("");
      setEffort("");
      setStatus("auto");
      const t = todayStr();
      setStart(t);
      setEnd(addDaysStr(t, 1));
      setEstimateH("4");
      setOpen(false);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="快速新建任务" width="w-[480px]">
      <div className="space-y-3">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            // 中文输入法选词回车不触发提交
            if (e.key === "Enter" && !e.nativeEvent.isComposing) void submit();
          }}
          placeholder="任务标题（如：排查线上订单超时）"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <div className="flex gap-3">
          <div className="flex-1 text-xs text-gray-500">
            项目
            <Select
              value={projectId}
              onChange={setProjectId}
              options={(projects.data ?? []).map((p) => ({ value: String(p.id), label: p.name }))}
              className="mt-1 w-full"
            />
          </div>
          <div className="flex-1 text-xs text-gray-500">
            类型
            <Select
              value={type}
              onChange={setType}
              options={typeOptions}
              className="mt-1 w-full"
            />
          </div>
          <div className="w-28 text-xs text-gray-500">
            优先级
            <Select
              value={priority}
              onChange={(v) => setPriority(v as TaskPriority)}
              options={PRIORITY_OPTIONS}
              className="mt-1 w-full"
            />
          </div>
        </div>
        <div className="flex gap-3">
          <label className="flex-1 text-xs text-gray-500">
            开始日
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            />
          </label>
          <label className="flex-1 text-xs text-gray-500">
            结束日
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            />
          </label>
          <label className="w-32 text-xs text-gray-500">
            预估工时(h)
            <input
              type="number"
              min={0}
              max={800}
              step={0.5}
              value={estimateH}
              onChange={(e) => setEstimateH(e.target.value)}
              placeholder="清空不设置"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            />
          </label>
        </div>
        <p className="text-[11px] leading-4 text-gray-400">
          开始/结束为期望时间窗（默认今天 → 明天）；工时按 8h = 1 工作日折算（默认 4h = 0.5 天），清空则不设置。
        </p>
        <div className="flex items-end gap-3">
          <div className="w-36 text-xs text-gray-500">
            初始状态
            <Select
              value={status}
              onChange={(v) => setStatus(v as "auto" | TaskStatus)}
              options={INITIAL_STATUS_OPTIONS}
              className="mt-1 w-full"
            />
          </div>
          <p className="flex-1 pb-1.5 text-[11px] leading-4 text-gray-400">
            选"自动"按默认规则：待办；填了今日记录则为进行中。指定状态在创建后应用。
          </p>
        </div>
        <label className="block text-xs text-gray-500">
          任务描述（选填，背景 / 结论 / 备注）
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1 w-full resize-y rounded border border-gray-300 px-2 py-1.5 text-[13px] focus:border-blue-500 focus:outline-none"
          />
        </label>
        <label className="block text-xs text-gray-500">
          今日记录（选填，写一句话也行）
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            className="mt-1 w-full resize-y rounded border border-gray-300 px-2 py-1.5 text-[13px] focus:border-blue-500 focus:outline-none"
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-gray-400">今日投入</span>
            {EFFORT_OPTIONS.map((option) => (
              <button
                key={option.v}
                type="button"
                onClick={() => setEffort(String(option.v))}
                className={`rounded border px-1.5 py-0.5 text-[11px] ${
                  Number(effort) === option.v
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {option.label}
              </button>
            ))}
            <input
              type="number"
              min={0}
              max={24}
              step={0.5}
              value={effort}
              onChange={(e) => setEffort(e.target.value)}
              placeholder="自定义小时"
              className="ml-auto w-24 rounded border border-gray-300 px-2 py-1 text-[11px] focus:border-blue-500 focus:outline-none"
            />
          </div>
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={() => setOpen(false)} className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
            取消
          </button>
          <button
            onClick={() => void submit()}
            disabled={createMut.isPending}
            className="rounded bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {createMut.isPending ? "创建中…" : "创建"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
