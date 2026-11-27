import type { MonthOverview } from "../../types";
import { useUi } from "../../stores/ui";
import { DEFAULT_TASK_TYPES, STATUS_COLORS, rgba, taskTypeColor } from "../../lib/colors";
import { useTaskTypes } from "../../queries/hooks";
import { todayStr } from "../../lib/date";

/** 月视图：日历格子 + 任务 chip（上限 3 个），悬浮 chip 跨天高亮同任务 */
export function MonthGrid({ overview }: { overview: MonthOverview }) {
  const taskTypes = useTaskTypes().data ?? DEFAULT_TASK_TYPES;
  const hoverTaskId = useUi((s) => s.hoverTaskId);
  const setHover = useUi((s) => s.setHover);
  const openTask = useUi((s) => s.openTask);
  const setAnchor = useUi((s) => s.setAnchor);
  const openDayDetail = useUi((s) => s.openDayDetail);
  const theme = useUi((s) => s.theme);
  const today = todayStr();

  const chipsByDate = new Map(overview.monthDays.map((d) => [d.date, d.chips]));
  const weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50/60">
        {weekdays.map((w) => (
          <div key={w} className="px-2 py-1.5 text-center text-xs font-medium text-gray-400">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {overview.days.map((meta) => {
          const chips = chipsByDate.get(meta.date) ?? [];
          const off = !meta.isWorkday;
          const isToday = meta.date === today;
          const shown = chips.slice(0, 3);
          const rest = chips.length - shown.length;
          return (
            <div
              key={meta.date}
              className={`min-h-[96px] cursor-pointer border-b border-r border-gray-100 p-1.5 transition-colors last:border-r-0 hover:bg-blue-50/40 ${
                off ? "bg-gray-50/80" : ""
              } ${isToday ? "bg-blue-50/50 ring-1 ring-inset ring-blue-200" : ""}`}
              title="点击查看当天详情"
              onClick={() => {
                setAnchor(meta.date);
                openDayDetail(meta.date);
              }}
            >
              <div className="mb-1 flex items-center gap-1">
                <span
                  className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-medium ${
                    isToday
                      ? "bg-blue-600 text-white"
                      : meta.isOffTag
                        ? "text-red-500"
                        : off
                          ? "text-gray-400"
                          : "text-gray-600"
                  }`}
                >
                  {Number(meta.date.slice(8))}
                </span>
                {meta.tag && meta.isOffTag && <span className="truncate text-[10px] text-red-400">{meta.tag}</span>}
                {meta.tag && !meta.isOffTag && (
                  <span className="rounded bg-orange-100 px-1 text-[10px] font-medium text-orange-600">班</span>
                )}
              </div>
              <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                {shown.map((chip) => {
                  const dimmed = hoverTaskId !== null && hoverTaskId !== chip.taskId;
                  const done = chip.status === "done";
                  const color = taskTypeColor(taskTypes, chip.type);
                  // 计划条：外部任务按 duedate 展示（尚无当天记录），虚线边区分"计划 vs 实际"
                  const planned = chip.planned === true;
                  const overdue = planned && chip.overdue === true;
                  const chipColor = overdue ? "#ef4444" : color;
                  return (
                    <div
                      key={`${chip.taskId}-${chip.planned ? "plan" : "entry"}`}
                      className={`flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 transition-opacity hover:brightness-95 ${
                        dimmed ? "opacity-20" : ""
                      }`}
                      style={{
                        backgroundColor: rgba(chipColor, theme === "dark" ? 0.3 : 0.12),
                        borderLeft: planned ? `3px dashed ${chipColor}` : `3px solid ${chipColor}`,
                      }}
                      title={`${planned ? "[计划] " : ""}${chip.title}${done ? "（已完成）" : ""}${planned ? "（Jira 截止日期，尚无当天记录）" : ""}`}
                      onMouseEnter={() => setHover(chip.taskId)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => openTask(chip.taskId)}
                    >
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: done ? STATUS_COLORS.done : chipColor }}
                      />
                      <span className={`truncate text-[11px] text-gray-700 ${done ? "line-through opacity-60" : ""}`}>
                        {planned ? "计划·" : ""}
                        {chip.title}
                      </span>
                    </div>
                  );
                })}
                {rest > 0 && <div className="px-1.5 text-[10px] text-gray-400">+{rest} 个任务</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
