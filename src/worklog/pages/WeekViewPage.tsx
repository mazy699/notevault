import { useUi } from "../stores/ui";
import { useWeekMatrix, useOnboardingStatus, useInvalidateAll, useTaskTypes } from "../queries/hooks";
import { api } from "../api/client";
import { WeekGrid } from "../components/calendar/WeekGrid";
import { JiraTodoLane } from "../components/calendar/JiraTodoLane";
import { addDaysStr, todayStr, weekMonday } from "../lib/date";
import { DEFAULT_TASK_TYPES } from "../lib/colors";

export function WeekViewPage() {
  const {
    currentDate,
    setAnchor,
    setAiReportOpen,
    showCompletedTasks,
    toggleShowCompletedTasks,
  } = useUi();
  const { data, isLoading, error } = useWeekMatrix(currentDate);
  const onboarding = useOnboardingStatus();
  const taskTypes = useTaskTypes().data ?? DEFAULT_TASK_TYPES;
  const invalidate = useInvalidateAll();

  const monday = weekMonday(currentDate);
  const sunday = addDaysStr(monday, 6);
  const isCurrentWeek = monday === weekMonday(todayStr());
  const completedCount = data?.rows.filter((row) => row.task.status === "done").length ?? 0;
  const visibleData =
    data && !showCompletedTasks
      ? { ...data, rows: data.rows.filter((row) => row.task.status !== "done") }
      : data;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAnchor(addDaysStr(monday, -7))}
            className="rounded border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            ← 上一周
          </button>
          <span className="min-w-[150px] text-center text-sm font-semibold text-gray-800">
            {monday.slice(5).replace("-", "/")} ~ {sunday.slice(5).replace("-", "/")}
          </span>
          <button
            onClick={() => setAnchor(addDaysStr(monday, 7))}
            className="rounded border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            下一周 →
          </button>
          {!isCurrentWeek && (
            <button
              onClick={() => setAnchor(todayStr())}
              className="rounded bg-blue-50 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-100"
            >
              回到本周
            </button>
          )}
          <button
            onClick={() => setAiReportOpen(true)}
            className="ml-2 flex items-center gap-1 rounded border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm text-violet-700 hover:bg-violet-100"
            title="把本周记录整理成简短周报（需在设置页配置 AI 接口）"
          >
            🤖 AI 周报
          </button>
          <button
            onClick={toggleShowCompletedTasks}
            aria-pressed={showCompletedTasks}
            className={`rounded border px-3 py-1.5 text-sm transition-colors ${
              showCompletedTasks
                ? "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                : "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
            }`}
          >
            {showCompletedTasks ? "隐藏已完成" : `显示已完成${completedCount ? ` (${completedCount})` : ""}`}
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {taskTypes.map((type) => (
            <span key={type.id} className="flex items-center gap-1 text-[11px] text-gray-500">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: type.color }} />
              {type.label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 pb-4">
        {onboarding.data?.demoLoaded && (
          <div className="mb-2 flex items-center justify-between rounded border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
            <span>当前展示的是演示数据，供你熟悉功能；正式使用前清掉即可，不会影响你自己记录的内容。</span>
            <button
              onClick={() => {
                if (window.confirm("清除全部演示任务与演示项目？（你自己新建的数据不受影响）")) {
                  void api
                    .demoClear()
                    .then(() => invalidate())
                    .catch((e: unknown) => window.alert(e instanceof Error ? e.message : String(e)));
                }
              }}
              className="ml-3 shrink-0 rounded border border-amber-300 bg-white px-2 py-0.5 font-medium text-amber-800 hover:bg-amber-100"
            >
              清掉演示数据，开始正式使用
            </button>
          </div>
        )}
        {isLoading && <div className="py-20 text-center text-sm text-gray-400">加载中…</div>}
        {error && <div className="py-20 text-center text-sm text-red-500">{String(error)}</div>}
        {visibleData && (
          <WeekGrid
            matrix={visibleData}
            emptyText={
              !showCompletedTasks && completedCount > 0
                ? "本周任务均为已完成，已按当前筛选隐藏"
                : "本周还没有任务记录"
            }
          />
        )}
        {visibleData && <JiraTodoLane tasks={visibleData.externalUnscheduled} />}
        {visibleData && visibleData.rows.length > 0 && (
          <div className="mt-2 px-1 text-[11px] leading-5 text-gray-400">
            色块 = 当天有工作记录（只涂实际工作的天）；悬浮任一色块可高亮该任务的全部参与日期；点击色块进入任务详情，点击空白格直接补记录；浅蓝虚线为期望时间窗。
          </div>
        )}
      </div>
    </div>
  );
}
