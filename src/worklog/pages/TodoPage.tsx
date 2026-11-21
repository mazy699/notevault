import { useEffect, useState } from "react";
import { Modal } from "../components/common/Modal";
import {
  useTodoConvert,
  useTodoCreate,
  useTodoDelete,
  useTodoDeleteMany,
  useTodoAttach,
  useTodoToggle,
  useTodoUpdate,
  useTodos,
  useTaskList,
} from "../queries/hooks";
import { useUi } from "../stores/ui";
import { STATUS_COLORS, STATUS_LABELS } from "../lib/colors";
import type { Todo } from "../types";

type TodoFilter = "open" | "done" | "converted" | "all";
const DETAIL_PREVIEW_LIMIT = 60;

export function TodoPage() {
  const todosQuery = useTodos();
  const createMut = useTodoCreate();
  const updateMut = useTodoUpdate();
  const toggleMut = useTodoToggle();
  const deleteMut = useTodoDelete();
  const deleteManyMut = useTodoDeleteMany();
  const convertMut = useTodoConvert();
  const attachMut = useTodoAttach();
  const tasksQuery = useTaskList({});
  const openTask = useUi((s) => s.openTask);

  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState<TodoFilter>("open");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTodoId, setDetailTodoId] = useState<number | null>(null);
  const [detailTitle, setDetailTitle] = useState("");
  const [detailContent, setDetailContent] = useState("");
  const [convertOpen, setConvertOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  const [taskSearch, setTaskSearch] = useState("");

  const todos = todosQuery.data ?? [];
  const openCount = todos.filter((todo) => todo.status === "open").length;
  const doneCount = todos.filter((todo) => todo.status === "done").length;
  const convertedCount = todos.filter((todo) => todo.status === "converted").length;
  const visibleTodos = todos.filter((todo) => filter === "all" || todo.status === filter);
  const selectedTodos = todos.filter((todo) => selected.has(todo.id));
  const detailTodo = todos.find((todo) => todo.id === detailTodoId) ?? null;
  const taskTitleById = new Map((tasksQuery.data ?? []).map((task) => [task.id, task.title]));
  const attachableTasks = (tasksQuery.data ?? []).filter(
    (task) =>
      !["done", "cancelled"].includes(task.status) &&
      (!taskSearch.trim() || task.title.toLowerCase().includes(taskSearch.trim().toLowerCase()))
  );

  useEffect(() => {
    const validIds = new Set(todos.map((todo) => todo.id));
    setSelected((current) => new Set([...current].filter((id) => validIds.has(id))));
  }, [todos]);

  const add = (): void => {
    const content = draft.trim();
    if (!content) return;
    createMut.mutate(content, {
      onSuccess: () => {
        setDraft("");
        if (filter === "done") setFilter("open");
      },
      onError: (error) => window.alert(error instanceof Error ? error.message : String(error)),
    });
  };

  const openDetail = (todo: Todo): void => {
    setDetailTodoId(todo.id);
    setDetailTitle(todo.content);
    setDetailContent(todo.detail);
    setDetailOpen(true);
  };

  const saveDetail = (): void => {
    if (detailTodoId == null) return;
    updateMut.mutate(
      { id: detailTodoId, input: { content: detailTitle, detail: detailContent } },
      {
        onSuccess: () => setDetailOpen(false),
        onError: (error) => window.alert(error instanceof Error ? error.message : String(error)),
      }
    );
  };

  const toggleSelected = (id: number, checked: boolean): void => {
    if (todos.find((todo) => todo.id === id)?.status === "converted") return;
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const removeOne = (todo: Todo, closeDetail = false): void => {
    if (!window.confirm(`删除待办“${todo.content}”？`)) return;
    deleteMut.mutate(todo.id, {
      onSuccess: () => {
        if (closeDetail) setDetailOpen(false);
      },
      onError: (error) => window.alert(error instanceof Error ? error.message : String(error)),
    });
  };

  const removeSelected = (): void => {
    const ids = [...selected];
    if (!ids.length) return;
    if (!window.confirm(`删除已选中的 ${ids.length} 条待办？`)) return;
    deleteManyMut.mutate(ids, {
      onSuccess: () => setSelected(new Set()),
      onError: (error) => window.alert(error instanceof Error ? error.message : String(error)),
    });
  };

  const openConvert = (): void => {
    if (!selectedTodos.length) return;
    setTaskTitle(selectedTodos[0].content.slice(0, 40));
    setConvertOpen(true);
  };

  const convert = async (): Promise<void> => {
    if (!taskTitle.trim() || !selectedTodos.length) return;
    try {
      const task = await convertMut.mutateAsync({
        ids: selectedTodos.map((todo) => todo.id),
        title: taskTitle,
      });
      setConvertOpen(false);
      setSelected(new Set());
      openTask(task.id);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };

  const attachToTask = async (taskId: number): Promise<void> => {
    if (!selectedTodos.length) return;
    try {
      await attachMut.mutateAsync({
        ids: selectedTodos.map((todo) => todo.id),
        taskId,
      });
      setAttachOpen(false);
      setSelected(new Set());
      setTaskSearch("");
      openTask(taskId);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="h-full overflow-auto px-4 py-4">
      <div className="mx-auto max-w-[900px]">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-800">待办箱</h1>
            <p className="mt-0.5 text-[11px] text-gray-400">先随手记下，不必立刻成为任务；后续可合并整理</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>待处理 <b className="text-gray-900">{openCount}</b></span>
            <span>已完成 <b className="text-gray-900">{doneCount}</b></span>
            <span>已转入 <b className="text-gray-900">{convertedCount}</b></span>
          </div>
        </div>

        <div className="mb-4 flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) add();
            }}
            placeholder="记一条待办，按 Enter 添加…"
            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={add}
            disabled={!draft.trim() || createMut.isPending}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {createMut.isPending ? "添加中…" : "添加"}
          </button>
        </div>

        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
            {([
              ["open", `待处理 ${openCount}`],
              ["done", `已完成 ${doneCount}`],
              ["converted", `已转入 ${convertedCount}`],
              ["all", `全部 ${todos.length}`],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === key ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {selected.size > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5">
              <span className="text-xs text-blue-700">已选 {selected.size} 项</span>
              <button
                onClick={openConvert}
                className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
              >
                合并为新任务
              </button>
              <button
                onClick={() => setAttachOpen(true)}
                className="rounded border border-blue-200 bg-white px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
              >
                加入已有任务
              </button>
              <button
                onClick={removeSelected}
                disabled={deleteManyMut.isPending}
                className="rounded border border-red-200 bg-white px-2.5 py-1 text-xs text-red-500 hover:bg-red-50 disabled:opacity-50"
              >
                删除
              </button>
              <button onClick={() => setSelected(new Set())} className="px-1 text-xs text-blue-600 hover:underline">
                取消选择
              </button>
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {todosQuery.isLoading && <div className="py-16 text-center text-sm text-gray-400">加载中…</div>}
          {todosQuery.error && (
            <div className="py-16 text-center text-sm text-red-500">{String(todosQuery.error)}</div>
          )}
          {!todosQuery.isLoading && !todosQuery.error && visibleTodos.length === 0 && (
            <div className="px-4 py-16 text-center">
              <div className="text-sm text-gray-400">
                {filter === "open" && todos.length > 0 ? "待办已全部处理完" : "这里还没有待办"}
              </div>
              {filter === "open" && todos.length === 0 && (
                <div className="mt-1 text-[11px] text-gray-400">临时想法、待确认事项都可以先放进来</div>
              )}
            </div>
          )}
          {visibleTodos.map((todo) => {
            const isDone = todo.status === "done";
            const isConverted = todo.status === "converted";
            const isSelected = selected.has(todo.id);
            const detailPreview =
              todo.detail.length > DETAIL_PREVIEW_LIMIT
                ? `${todo.detail.slice(0, DETAIL_PREVIEW_LIMIT).trimEnd()}…`
                : todo.detail;
            return (
              <div
                key={todo.id}
                className={`group flex items-start gap-3 border-b border-gray-100 px-3 py-3 last:border-b-0 ${
                  isSelected ? "bg-blue-50/60" : "hover:bg-gray-50/70"
                }`}
              >
                <input
                  type="checkbox"
                  checked={!isConverted && isSelected}
                  disabled={isConverted}
                  onChange={(event) => toggleSelected(todo.id, event.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 accent-blue-600 disabled:opacity-30"
                  aria-label="选择待办"
                />

                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => openDetail(todo)}
                    className={`block w-full truncate text-left text-sm leading-5 ${
                      isDone
                        ? "text-gray-400 line-through"
                        : isConverted
                          ? "text-gray-600"
                          : "text-gray-800"
                    }`}
                    title={todo.content}
                  >
                    {todo.content}
                  </button>
                  {detailPreview.trim() && (
                    <button
                      type="button"
                      onClick={() => openDetail(todo)}
                    className="mt-0.5 block w-full truncate text-left text-xs leading-5 text-gray-500"
                    title={todo.detail}
                    >
                      {detailPreview}
                    </button>
                  )}
                  <div className="mt-1 text-[10px] text-gray-400">
                    {isConverted ? (
                      <span>
                        已转入：
                        {todo.linkedTaskId != null
                          ? taskTitleById.get(todo.linkedTaskId) ?? `任务 #${todo.linkedTaskId}`
                          : "关联任务已不存在"}
                      </span>
                    ) : (
                      <span>记录于 {todo.createdAt.slice(0, 16)}</span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {isConverted ? (
                    <button
                      type="button"
                      onClick={() => todo.linkedTaskId != null && openTask(todo.linkedTaskId)}
                      disabled={todo.linkedTaskId == null}
                      className="w-20 rounded border border-blue-200 bg-white px-2 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                    >
                      查看任务
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleMut.mutate(todo.id)}
                      disabled={toggleMut.isPending}
                      title={isDone ? "恢复为待处理" : "标记为已完成"}
                      className={`w-16 rounded border px-2 py-1.5 text-xs font-medium transition-colors ${
                        isDone
                          ? "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                          : "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
                      } disabled:opacity-50`}
                    >
                      {isDone ? "恢复" : "完成"}
                    </button>
                  )}
                  <button
                    onClick={() => removeOne(todo)}
                    className="rounded px-1.5 py-1.5 text-xs text-gray-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                  >
                    删除
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Modal open={detailOpen && detailTodo != null} onClose={() => setDetailOpen(false)} title="待办详情" width="w-[680px]">
        {detailTodo && (
          <div className="space-y-4">
            <label className="block text-xs text-gray-500">
              标题
              <input
                autoFocus
                value={detailTitle}
                onChange={(event) => setDetailTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) saveDetail();
                }}
                maxLength={200}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </label>

            <label className="block text-xs text-gray-500">
              补充内容
              <textarea
                value={detailContent}
                onChange={(event) => setDetailContent(event.target.value)}
                rows={9}
                maxLength={5000}
                placeholder="补充背景、待确认点、链接、下一步安排等…"
                className="mt-1 w-full resize-y rounded border border-gray-300 px-3 py-2 text-sm leading-relaxed focus:border-blue-500 focus:outline-none"
              />
            </label>

            <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
              <span>创建：{detailTodo.createdAt.slice(0, 16)}</span>
              <span>更新：{detailTodo.updatedAt.slice(0, 16)}</span>
            </div>

            {detailTodo.status === "converted" && (
              <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                <span>
                  已转入：
                  {detailTodo.linkedTaskId != null
                    ? taskTitleById.get(detailTodo.linkedTaskId) ?? `任务 #${detailTodo.linkedTaskId}`
                    : "关联任务已不存在"}
                </span>
                <button
                  onClick={() => detailTodo.linkedTaskId != null && openTask(detailTodo.linkedTaskId)}
                  disabled={detailTodo.linkedTaskId == null}
                  className="rounded border border-blue-300 bg-white px-2 py-0.5 font-medium hover:bg-blue-100 disabled:opacity-50"
                >
                  打开关联任务
                </button>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {detailTodo.status !== "converted" && (
                  <button
                    onClick={() => toggleMut.mutate(detailTodo.id)}
                    disabled={toggleMut.isPending}
                    className={`rounded border px-3 py-1.5 text-sm ${
                      detailTodo.status === "done"
                        ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
                        : "border-gray-300 text-gray-600 hover:bg-gray-50"
                    } disabled:opacity-50`}
                  >
                    {detailTodo.status === "done" ? "恢复为待处理" : "标记为已完成"}
                  </button>
                )}
                <button
                  onClick={() => removeOne(detailTodo, true)}
                  className="text-xs text-red-500 hover:text-red-600"
                >
                  删除待办
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setDetailOpen(false)}
                  className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  onClick={saveDetail}
                  disabled={!detailTitle.trim() || updateMut.isPending}
                  className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {updateMut.isPending ? "保存中…" : "保存"}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={convertOpen} onClose={() => setConvertOpen(false)} title="合并为新任务" width="w-[620px]">
        <div className="space-y-4">
          <label className="block text-xs text-gray-500">
            任务标题
            <input
              autoFocus
              value={taskTitle}
              onChange={(event) => setTaskTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) void convert();
              }}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </label>

          <div>
            <div className="mb-1.5 text-xs font-medium text-gray-500">将写入任务描述（{selectedTodos.length} 项）</div>
            <div className="max-h-[280px] space-y-1 overflow-auto rounded-lg border border-gray-200 bg-gray-50/60 p-3">
              {selectedTodos.map((todo) => (
                <div key={todo.id} className="flex gap-2 text-sm text-gray-700">
                  <span className="text-gray-400">•</span>
                  <span className="min-w-0">
                    <span className="block">{todo.content}</span>
                    {todo.detail.trim() && (
                      <span className="mt-0.5 line-clamp-2 block text-xs text-gray-400">{todo.detail}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setConvertOpen(false)}
              className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              onClick={() => void convert()}
              disabled={!taskTitle.trim() || convertMut.isPending}
              className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {convertMut.isPending ? "创建中…" : "创建任务并移除待办"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={attachOpen} onClose={() => setAttachOpen(false)} title="加入已有任务" width="w-[680px]">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="text-xs text-gray-500">
              将选中的 <b className="text-gray-900">{selectedTodos.length}</b> 条待办追加到任务描述
            </div>
            <input
              value={taskSearch}
              onChange={(event) => setTaskSearch(event.target.value)}
              placeholder="搜索任务标题…"
              className="w-56 rounded border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="max-h-[420px] overflow-auto rounded-lg border border-gray-200">
            {tasksQuery.isLoading && <div className="py-12 text-center text-sm text-gray-400">加载中…</div>}
            {!tasksQuery.isLoading && attachableTasks.length === 0 && (
              <div className="py-12 text-center text-sm text-gray-400">
                {taskSearch.trim() ? "没有匹配的任务" : "暂无待处理、进行中或搁置的任务"}
              </div>
            )}
            {attachableTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-3 border-b border-gray-100 px-3 py-2.5 last:border-b-0 hover:bg-gray-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-800">{task.title}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-400">
                    <span
                      className="inline-block rounded px-1.5 py-0.5 font-medium text-white"
                      style={{ backgroundColor: STATUS_COLORS[task.status] }}
                    >
                      {STATUS_LABELS[task.status]}
                    </span>
                    <span>最近活动 {task.lastActivity ?? "暂无"}</span>
                  </div>
                </div>
                <button
                  onClick={() => void attachToTask(task.id)}
                  disabled={attachMut.isPending}
                  className="shrink-0 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  加入
                </button>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => setAttachOpen(false)}
              className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              取消
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
