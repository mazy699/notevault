import { useEffect, useState } from "react";
import { useUi } from "../../stores/ui";
import {
  useDayDetail,
  useDemoClear,
  useEntryCreate,
  useNoteUpsert,
  useOnboardingStatus,
  useTaskList,
} from "../../queries/hooks";
import { EntryGroupList } from "../../components/entry/EntryGroupList";
import { MarkdownView } from "../../components/common/MarkdownView";
import { addDaysStr, fmtDateCN, todayStr, weekdayCN } from "../../lib/date";
import { EFFORT_OPTIONS, fmtHours } from "../../lib/effort";
import type { Note } from "../../types";

/**
 * 日期详情侧栏：点击周视图列头 / 月视图日期格滑出。
 * 当天的统计、计划、按任务区块分组的记录、当天笔记、快速记录——原日视图的全部能力。
 */
export function DayDetailDrawer() {
  const date = useUi((s) => s.dayDetailDate);
  const close = useUi((s) => s.closeDayDetail);
  const openDayDetail = useUi((s) => s.openDayDetail);
  const isToday = date === todayStr();


  const { data, isLoading, error } = useDayDetail(date ?? todayStr());
  const onboarding = useOnboardingStatus();
  const demoClear = useDemoClear();

  const [plan, setPlan] = useState("");
  useEffect(() => setPlan(data?.plan ?? ""), [data?.date, data?.plan]);
  const noteMut = useNoteUpsert();

  const [taskSel, setTaskSel] = useState("none");
  const [content, setContent] = useState("");
  const [effort, setEffort] = useState("");
  const entryMut = useEntryCreate();
  const taskList = useTaskList({});
  const activeTasks = (taskList.data ?? []).filter((t) => ["todo", "in_progress", "on_hold"].includes(t.status));

  const addEntry = async (): Promise<void> => {
    if (!content.trim()) {
      window.alert("记录内容不能为空");
      return;
    }
    try {
      await entryMut.mutateAsync({
        taskId: taskSel === "none" ? null : Number(taskSel),
        entryDate: date ?? todayStr(),
        content,
        effortHours: effort.trim() === "" ? null : Number(effort),
      });
      setContent("");
      setEffort("");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  };

  if (date == null) return null;
  const dateStr = date;

  return (
    <>
      <div className="wl-fade fixed inset-0 z-30 bg-black/20" onClick={close} />
      <aside className="wl-slide fixed inset-y-0 right-0 z-40 flex w-[460px] max-w-[92vw] flex-col bg-white shadow-2xl">
        {/* 头部 */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-800">
              {fmtDateCN(dateStr)} {weekdayCN(dateStr)}
            </span>
            {isToday && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] text-blue-600">今天</span>}
            {data?.tag && data.isOffTag && <span className="text-[11px] font-medium text-red-500">{data.tag}</span>}
            {data?.tag && !data.isOffTag && (
              <span className="rounded bg-orange-100 px-1 text-[10px] font-medium text-orange-600">班</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => openDayDetail(addDaysStr(dateStr, -1))}
              className="rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100"
              title="前一天"
            >
              ←
            </button>
            <button
              onClick={() => openDayDetail(todayStr())}
              className="rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100"
            >
              今天
            </button>
            <button
              onClick={() => openDayDetail(addDaysStr(dateStr, 1))}
              className="rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100"
              title="后一天"
            >
              →
            </button>
            <button onClick={close} className="ml-1 text-gray-400 hover:text-gray-600" title="关闭">
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {isLoading && <div className="py-10 text-center text-sm text-gray-400">加载中…</div>}
          {error && <div className="py-6 text-center text-sm text-red-500">{String(error)}</div>}

          {data && (
            <div className="space-y-4">
              {onboarding.data?.demoLoaded && (
                <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-700">
                  <span>当前仍载有演示数据。演示记录不会进入 AI 周报；清除后会从日详情和统计中移除。</span>
                  <button
                    onClick={() => {
                      if (window.confirm("清除全部演示数据？不会影响你自己新建的记录。")) {
                        void demoClear.mutateAsync().catch((e: unknown) => {
                          window.alert(e instanceof Error ? e.message : String(e));
                        });
                      }
                    }}
                    disabled={demoClear.isPending}
                    className="shrink-0 rounded border border-amber-300 bg-white px-2 py-0.5 font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                  >
                    {demoClear.isPending ? "清除中…" : "清除演示数据"}
                  </button>
                </div>
              )}

              {/* 统计条 */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                <span>
                  任务 <b className="text-gray-900">{data.stats.taskCount}</b> 个
                </span>
                {data.stats.interruptionCount > 0 && (
                  <span className="text-orange-600">打断 {data.stats.interruptionCount} 个</span>
                )}
                {data.stats.independentCount > 0 && <span>独立记录 {data.stats.independentCount} 条</span>}
                {data.stats.totalHours != null && (
                  <span>
                    投入 <b className="text-gray-900">{fmtHours(data.stats.totalHours)}</b>
                  </span>
                )}
                {data.stats.noteCount > 0 && <span>笔记 {data.stats.noteCount} 篇</span>}
              </div>

              {/* 当日计划 */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500">当日计划</span>
                  {plan !== (data.plan ?? "") && (
                    <button
                      onClick={() => void noteMut.mutateAsync({ date: dateStr, planText: plan })}
                      className="rounded bg-blue-600 px-2.5 py-1 text-xs text-white hover:bg-blue-700"
                    >
                      保存
                    </button>
                  )}
                </div>
                <textarea
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                  rows={2}
                  placeholder="当天准备做什么？（可选）"
                  className="w-full resize-y rounded border border-gray-200 px-2 py-1.5 text-[13px] focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* 任务记录（区块分类） */}
              <div>
                <div className="mb-2 text-xs font-semibold text-gray-500">任务记录</div>
                {data.groups.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-300 py-6 text-center text-xs text-gray-400">
                    当天还没有记录
                  </div>
                ) : (
                  <EntryGroupList groups={data.groups} />
                )}
              </div>

              {/* 当天笔记 */}
              {data.notes.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500">当天笔记（{data.notes.length}）</span>
                    <button
                      onClick={() => {
                        close();
                        useUi.getState().nav("notes");
                      }}
                      className="text-[11px] text-blue-600 hover:underline"
                    >
                      去笔记页管理 →
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {data.notes.map((n: Note) => (
                      <div key={n.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {n.pinned && <span className="text-[11px]">📌</span>}
                          <span className="truncate text-[13px] font-medium text-gray-800">{n.title || "（无标题）"}</span>
                          {n.tags.map((t) => (
                            <span key={t} className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600">
                              {t}
                            </span>
                          ))}
                        </div>
                        <div className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-gray-500">
                          <MarkdownView text={n.content.slice(0, 100) + (n.content.length > 100 ? "…" : "")} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 快速记录 */}
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="mb-2 text-xs font-semibold text-gray-500">快速记录到 {fmtDateCN(dateStr)}</div>
                <div className="flex gap-2">
                  <select
                    value={taskSel}
                    onChange={(e) => setTaskSel(e.target.value)}
                    className="w-44 shrink-0 rounded border border-gray-300 px-2 py-1.5 text-xs"
                  >
                    <option value="none">独立记录（不挂任务）</option>
                    {activeTasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={effort}
                    onChange={(e) => setEffort(e.target.value)}
                    placeholder="小时"
                    className="w-20 shrink-0 rounded border border-gray-300 px-2 py-1.5 text-xs"
                  />
                </div>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={2}
                  placeholder="记点结论 / 进展…（支持 Markdown）"
                  className="mt-2 w-full resize-y rounded border border-gray-300 px-2 py-1.5 text-[13px] focus:border-blue-500 focus:outline-none"
                />
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex gap-1">
                    {EFFORT_OPTIONS.map((o: { label: string; v: number }) => (
                      <button
                        key={o.v}
                        onClick={() => setEffort(String(o.v))}
                        className="rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-100"
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => void addEntry()}
                    disabled={entryMut.isPending}
                    className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    保存记录
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
