import { useEffect, useState } from "react";
import { Modal } from "../common/Modal";
import { useUi } from "../../stores/ui";
import { useEntryCreate, useEntryUpdate, useTaskDetail, useTaskTypes } from "../../queries/hooks";
import { EFFORT_OPTIONS, fmtHours } from "../../lib/effort";
import { DEFAULT_TASK_TYPES, taskTypeColor, taskTypeLabel } from "../../lib/colors";

/** 工作条目编辑器：新建（默认今天，可补记任意日期）与编辑共用 */
export function EntryEditorDialog() {
  const editor = useUi((s) => s.entryEditor);
  const close = useUi((s) => s.closeEntryEditor);
  const taskDetail = useTaskDetail(editor?.taskId ?? null);
  const taskTypes = useTaskTypes().data ?? DEFAULT_TASK_TYPES;

  const [date, setDate] = useState("");
  const [content, setContent] = useState("");
  const [effort, setEffort] = useState("");

  useEffect(() => {
    if (!editor) return;
    setDate(editor.entry?.entryDate ?? editor.date);
    setContent(editor.entry?.content ?? "");
    setEffort(editor.entry?.effortHours != null ? String(editor.entry.effortHours) : "");
  }, [editor]);

  const createMut = useEntryCreate();
  const updateMut = useEntryUpdate();
  const busy = createMut.isPending || updateMut.isPending;

  if (!editor) return null;
  const isEdit = editor.entry != null;
  const task = taskDetail.data?.task;

  const save = async () => {
    const effortHours = effort.trim() === "" ? null : Number(effort);
    if (content.trim() === "") {
      window.alert("记录内容不能为空");
      return;
    }
    try {
      if (isEdit && editor.entry) {
        await updateMut.mutateAsync({ entryId: editor.entry.id, patch: { entryDate: date, content, effortHours } });
      } else {
        await createMut.mutateAsync({ taskId: editor.taskId, entryDate: date, content, effortHours });
      }
      close();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Modal open onClose={close} title={isEdit ? "编辑工作条目" : "新增工作条目"}>
      <div className="space-y-3">
        {editor.taskId != null && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: task ? taskTypeColor(taskTypes, task.type) : "#94a3b8" }} />
            <span className="font-medium text-gray-800">{task ? task.title : "…"}</span>
            {task && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{taskTypeLabel(taskTypes, task.type)}</span>}
          </div>
        )}
        {editor.taskId == null && <div className="text-sm font-medium text-gray-700">独立记录（不挂任务）</div>}

        <label className="block text-xs text-gray-500">
          日期（可补记历史）
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          />
        </label>

        <label className="block text-xs text-gray-500">
          记录内容（支持 Markdown，可贴 SQL / 代码块）
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            autoFocus
            className="mt-1 w-full resize-y rounded border border-gray-300 px-2 py-1.5 font-mono text-[13px] leading-relaxed focus:border-blue-500 focus:outline-none"
            placeholder={"调查结论 / 进展 / SQL…\n```sql\nSELECT * FROM t WHERE id = 1;\n```"}
          />
        </label>

        <div className="text-xs text-gray-500">
          投入量（选填）
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              min={0}
              step={0.5}
              value={effort}
              onChange={(e) => setEffort(e.target.value)}
              placeholder="小时"
              className="w-28 rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            />
            <div className="flex gap-1">
              {EFFORT_OPTIONS.map((o) => (
                <button
                  key={o.v}
                  onClick={() => setEffort(String(o.v))}
                  className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                >
                  {o.label}
                </button>
              ))}
            </div>
            {effort !== "" && Number(effort) > 0 && <span className="text-xs text-gray-400">= {fmtHours(Number(effort))}</span>}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={close} className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
            取消
          </button>
          <button
            onClick={() => void save()}
            disabled={busy}
            className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
