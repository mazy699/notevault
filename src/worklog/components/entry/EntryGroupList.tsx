import type { EntryGroup } from "../../types";
import { MarkdownView } from "../common/MarkdownView";
import { useUi } from "../../stores/ui";
import { useEntryDelete, useTaskTypes } from "../../queries/hooks";
import { fmtHours } from "../../lib/effort";
import { DEFAULT_TASK_TYPES, STATUS_LABELS, taskTypeColor } from "../../lib/colors";

/** 按任务分组的条目列表：日视图与晨会页共用；bare 模式（任务详情页内）不重复显示任务头 */
export function EntryGroupList({ groups, bare = false }: { groups: EntryGroup[]; bare?: boolean }) {
  const openTask = useUi((s) => s.openTask);
  const openEntryEditor = useUi((s) => s.openEntryEditor);
  const delMut = useEntryDelete();
  const taskTypes = useTaskTypes().data ?? DEFAULT_TASK_TYPES;

  const remove = (id: number) => {
    if (window.confirm("删除这条工作记录？")) {
      delMut.mutate(id, { onError: (e) => window.alert(e instanceof Error ? e.message : String(e)) });
    }
  };

  return (
    <div className={bare ? "space-y-2" : "space-y-4"}>
      {groups.map((g, gi) => (
        <div key={g.task ? `t${g.task.id}` : `i${gi}`} className="rounded-xl border border-gray-200 bg-white shadow-sm">
          {!bare && (
            <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5">
              {g.task ? (
                <>
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: taskTypeColor(taskTypes, g.task.type) }} />
                  <button className="text-sm font-medium text-gray-800 hover:text-blue-600" onClick={() => openTask(g.task!.id)}>
                    {g.task.title}
                  </button>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">{STATUS_LABELS[g.task.status]}</span>
                </>
              ) : (
                <span className="text-sm font-medium text-gray-600">🗒 独立记录</span>
              )}
            </div>
          )}
          <div className="divide-y divide-gray-50">
            {g.entries.map((e) => (
              <div key={e.id} className="group px-4 py-2.5">
                <div className="mb-1 flex items-center gap-2 text-[11px] text-gray-400">
                  <span>{e.createdAt.slice(11, 16)}</span>
                  {e.effortHours != null && (
                    <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-600">{fmtHours(e.effortHours)}</span>
                  )}
                  {e.entryDate !== e.createdAt.slice(0, 10) && <span className="text-amber-500">补记</span>}
                  <span className="ml-auto flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      className="rounded px-1.5 py-0.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
                      onClick={() => openEntryEditor({ taskId: e.taskId, date: e.entryDate, entry: e })}
                    >
                      编辑
                    </button>
                    <button
                      className="rounded px-1.5 py-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                      onClick={() => remove(e.id)}
                    >
                      删除
                    </button>
                  </span>
                </div>
                <MarkdownView text={e.content} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
