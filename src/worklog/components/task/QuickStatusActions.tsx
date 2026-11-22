import { useTaskSetStatus } from "../../queries/hooks";
import type { TaskStatus } from "../../types";

interface QuickStatusActionsProps {
  taskId: number;
  status: TaskStatus;
  className?: string;
  size?: "sm" | "md";
}

/** 任务行快捷状态操作：无需进入详情即可开始或完成。 */
export function QuickStatusActions({
  taskId,
  status,
  className = "",
  size = "md",
}: QuickStatusActionsProps) {
  const statusMut = useTaskSetStatus();

  const setStatus = (next: TaskStatus): void => {
    statusMut.mutate(
      { taskId, status: next },
      { onError: (error) => window.alert(error instanceof Error ? error.message : String(error)) }
    );
  };

  return (
    <div
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-md border border-gray-200 bg-white p-0.5 ${
        size === "sm" ? "h-8" : "h-9"
      } ${className}`}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setStatus("in_progress")}
        disabled={statusMut.isPending || status === "in_progress"}
        title="标记为进行中"
        className={`h-full rounded-[4px] px-2.5 font-medium transition-colors ${
          size === "sm" ? "min-w-[52px] text-[11px]" : "min-w-[64px] text-xs"
        } ${
          status === "in_progress"
            ? "bg-blue-600 text-white"
            : "text-gray-600 hover:bg-blue-50 hover:text-blue-700"
        } disabled:cursor-default`}
      >
        进行中
      </button>
      <button
        type="button"
        onClick={() => setStatus("done")}
        disabled={statusMut.isPending || status === "done"}
        title="标记为已完成"
        className={`h-full rounded-[4px] px-2.5 font-medium transition-colors ${
          size === "sm" ? "min-w-[48px] text-[11px]" : "min-w-[58px] text-xs"
        } ${
          status === "done"
            ? "bg-green-600 text-white"
            : "text-gray-600 hover:bg-green-50 hover:text-green-700"
        } disabled:cursor-default`}
      >
        完成
      </button>
    </div>
  );
}
