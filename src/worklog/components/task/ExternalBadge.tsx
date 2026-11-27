import type { Task } from "../../types";
import { openExternalUrl } from "../../lib/open";

/**
 * 外部来源标记：Jira issue key（点击用系统浏览器打开）+ 父 Story + 已消失提示。
 * 只读同步的视觉标识，不参与任务编辑。
 */
export function ExternalBadge({
  task,
  showParent = false,
  className = "",
}: {
  task: Task;
  showParent?: boolean;
  className?: string;
}) {
  if (!task.externalSource || !task.externalId) return null;
  const label = task.externalSource === "jira" ? "Jira" : task.externalSource;
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (task.externalUrl) void openExternalUrl(task.externalUrl);
        }}
        className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-100"
        title={task.externalUrl ?? "打开外部任务"}
      >
        {label} · {task.externalId}
      </button>
      {task.externalMissing && (
        <span
          className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700"
          title="上次全量同步时在 Jira 中已不可见（任务与本地记录均保留）"
        >
          已不可见
        </span>
      )}
      {showParent && task.externalParentKey && (
        <span className="truncate text-[10px] text-gray-400" title={task.externalParentSummary ?? ""}>
          {task.externalParentKey}
          {task.externalParentSummary ? ` · ${task.externalParentSummary}` : ""}
        </span>
      )}
    </span>
  );
}
