import type { WeekMatrix } from "../../types";
import { useUi } from "../../stores/ui";
import { useDemoSeed, useTaskTypes } from "../../queries/hooks";
import { DEFAULT_TASK_TYPES, rgba, taskTypeColor } from "../../lib/colors";
import { EFFORT_ALPHA, EFFORT_ALPHA_DARK, effortBucket, fmtHours } from "../../lib/effort";
import { todayStr } from "../../lib/date";

/**
 * 周视图：简化甘特。
 * - 行 = 任务，列 = 一周 7 天；
 * - 色块 = 当天有工作条目（只涂实际，中间自然断开）；
 * - 悬浮任意色块 → 同任务所有色块高亮，其余任务降低透明度；
 * - 浅色底带 = 期望时间窗（仅覆盖工作日），与色块的错位即"计划 vs 实际"。
 */
export function WeekGrid({
  matrix,
  emptyText = "本周还没有任务记录",
}: {
  matrix: WeekMatrix;
  emptyText?: string;
}) {
  const taskTypes = useTaskTypes().data ?? DEFAULT_TASK_TYPES;
  const hoverTaskId = useUi((s) => s.hoverTaskId);
  const setHover = useUi((s) => s.setHover);
  const openTask = useUi((s) => s.openTask);
  const openEntryEditor = useUi((s) => s.openEntryEditor);
  const openDayDetail = useUi((s) => s.openDayDetail);
  const nav = useUi((s) => s.nav);
  const theme = useUi((s) => s.theme);
  const demoMut = useDemoSeed();
  const today = todayStr();

  const cols = "260px repeat(7, minmax(0, 1fr))";

  const loadDemo = () => {
    demoMut.mutate(undefined, {
      onError: (e) => window.alert(e instanceof Error ? e.message : String(e)),
    });
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* 列头 */}
      <div className="grid border-b border-gray-200" style={{ gridTemplateColumns: cols }}>
        <div className="px-3 py-2 text-xs font-medium text-gray-400">任务</div>
        {matrix.days.map((d) => {
          const off = !d.isWorkday;
          const isToday = d.date === today;
          return (
            <div
              key={d.date}
              onClick={() => openDayDetail(d.date)}
              title="点击查看当天详情"
              className={`cursor-pointer border-l border-gray-100 px-2 py-2 text-center transition-colors ${
                isToday ? "bg-blue-50/80" : off ? "bg-gray-100/70" : ""
              }`}
            >
              <div
                className={`text-xs font-medium ${
                  isToday ? "text-blue-600" : off ? "text-gray-400" : "text-gray-700"
                }`}
              >
                {d.date.slice(5).replace("-", "/")} {d.weekday}
                {isToday && <span className="ml-1 rounded bg-blue-600 px-1 py-px text-[10px] font-normal text-white">今</span>}
              </div>
              {d.tag && d.isOffTag && <div className="text-[11px] font-medium text-red-500">{d.tag}</div>}
              {d.tag && !d.isOffTag && (
                <span className="mt-0.5 inline-block rounded bg-orange-100 px-1 text-[10px] font-medium text-orange-600">
                  {d.tag}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* 任务行 */}
      {matrix.rows.length === 0 && (
        <div className="px-4 py-16 text-center">
          <div className="mb-2 text-4xl">🗓️</div>
          <div className="mb-5 text-sm text-gray-400">{emptyText}</div>
          <div className="flex justify-center gap-2">
            <button
              onClick={() => nav("tasks")}
              className="rounded border border-gray-300 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              去新建任务
            </button>
            <button
              onClick={loadDemo}
              disabled={demoMut.isPending}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {demoMut.isPending ? "载入中…" : "载入演示数据看效果"}
            </button>
          </div>
        </div>
      )}

      {matrix.rows.map((row) => {
        const dimmed = hoverTaskId !== null && hoverTaskId !== row.task.id;
        const color = taskTypeColor(taskTypes, row.task.type);
        return (
          <div
            key={row.task.id}
            className={`grid border-b border-gray-100 transition-opacity last:border-b-0 ${
              dimmed ? "opacity-25" : ""
            }`}
            style={{ gridTemplateColumns: cols }}
            onMouseEnter={() => setHover(row.task.id)}
            onMouseLeave={() => setHover(null)}
          >
            {/* 任务名 */}
            <div
              className="cursor-pointer px-3 py-1.5 hover:bg-gray-50"
              title={row.task.title}
              onClick={() => openTask(row.task.id)}
            >
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <span className="truncate text-[13px] font-medium text-gray-800">{row.task.title}</span>
              </div>
              <div className="pl-4 text-[11px] text-gray-400">
                {row.task.estimateDays != null && <span>预估 {row.task.estimateDays} 天</span>}
                {row.task.estimateDays != null && row.occupiedDays > 0 && <span> / </span>}
                {row.occupiedDays > 0 && (
                  <span className={row.task.estimateDays != null && row.occupiedDays > row.task.estimateDays ? "text-red-500" : ""}>
                    实际 {row.occupiedDays} 天
                  </span>
                )}
                {row.totalHours != null && <span> · {fmtHours(row.totalHours)}</span>}
              </div>
            </div>

            {/* 七天格子 */}
            {row.cells.map((cell, i) => {
              const meta = matrix.days[i];
              const hasEntries = cell.entries.length > 0;
              const isToday = meta.date === today;
              const inWindow =
                !hasEntries &&
                row.window != null &&
                cell.date >= row.window.start &&
                cell.date <= row.window.end &&
                meta.isWorkday;
              const effortSum = cell.entries.reduce((acc, e) => acc + (e.effortHours ?? 0), 0);
              const bucket = effortBucket(effortSum || null);
              const tooltip = cell.entries
                .map((e) => `${e.effortHours != null ? `[${fmtHours(e.effortHours)}] ` : ""}${e.snippet}`)
                .join("\n");
              // 浅色块上用深色文字保证可读
              const textColor =
                theme === "light" && bucket === "light"
                  ? "rgba(30, 41, 59, 0.85)"
                  : "rgba(255, 255, 255, 0.95)";
              const subTextColor =
                theme === "light" && bucket === "light"
                  ? "rgba(30, 41, 59, 0.55)"
                  : "rgba(255, 255, 255, 0.8)";
              const alpha = theme === "dark" ? EFFORT_ALPHA_DARK[bucket] : EFFORT_ALPHA[bucket];
              return (
                <div
                  key={cell.date}
                  className={`relative h-[52px] border-l border-gray-100 transition-colors ${
                    meta.isWorkday ? "" : "bg-gray-100/60"
                  } ${isToday && meta.isWorkday ? "bg-blue-50/30" : ""} ${
                    hasEntries ? "cursor-pointer" : "cursor-pointer hover:bg-blue-50/60"
                  }`}
                  title={hasEntries ? tooltip : "点击补记录"}
                  onClick={() => {
                    if (hasEntries) openTask(row.task.id, cell.date);
                    else openEntryEditor({ taskId: row.task.id, date: cell.date, entry: null });
                  }}
                >
                  {inWindow && (
                    <div className="absolute inset-1 rounded border border-dashed border-blue-200 bg-blue-50/80" />
                  )}
                  {hasEntries && (
                    <div
                      className="absolute inset-x-1 inset-y-1.5 flex cursor-pointer items-center overflow-hidden rounded px-1.5 transition-all duration-150 hover:brightness-110"
                      style={{ backgroundColor: rgba(color, alpha), borderLeft: `3px solid ${color}` }}
                    >
                      <span className="truncate text-[11px] leading-tight" style={{ color: textColor }}>
                        {cell.entries[0].snippet}
                      </span>
                      {effortSum > 0 && (
                        <span className="ml-auto shrink-0 pl-1 text-[10px]" style={{ color: subTextColor }}>
                          {fmtHours(effortSum)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
