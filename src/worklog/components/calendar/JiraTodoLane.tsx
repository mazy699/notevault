import type { Task } from "../../types";
import { useUi } from "../../stores/ui";
import { useTaskTypes } from "../../queries/hooks";
import { DEFAULT_TASK_TYPES, taskTypeColor } from "../../lib/colors";
import { todayStr } from "../../lib/date";
import { ExternalBadge } from "../task/ExternalBadge";

/**
 * 周视图补充区：外部来源、没有时间窗的待办。
 * 有截止日期的任务仍由矩阵里的虚线计划条展示，这里只收“未排期”的。
 */
export function JiraTodoLane({ tasks }: { tasks: Task[] }) {
  const openTask = useUi((s) => s.openTask);
  const openEntryEditor = useUi((s) => s.openEntryEditor);
  const taskTypes = useTaskTypes().data ?? DEFAULT_TASK_TYPES;

  if (tasks.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-dashed border-gray-300 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-gray-600">Jira 待办（未排期）</span>
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{tasks.length}</span>
        <span className="text-[11px] text-gray-400">
          有截止日期的任务会直接显示在上方矩阵的虚线计划条中；这里点击“开始记录”可直接补一条工作记录
        </span>
      </div>
      <div className="divide-y divide-gray-100">
        {tasks.map((task) => (
          <div key={task.id} className="flex items-center gap-2 py-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: taskTypeColor(taskTypes, task.type) }}
            />
            <button
              type="button"
              onClick={() => openTask(task.id)}
              className="min-w-0 flex-1 truncate text-left text-[13px] text-gray-800 hover:text-blue-600"
              title={task.title}
            >
              {task.title}
            </button>
            <ExternalBadge task={task} />
            <button
              type="button"
              onClick={() => openEntryEditor({ taskId: task.id, date: todayStr(), entry: null })}
              className="shrink-0 rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
            >
              开始记录
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
