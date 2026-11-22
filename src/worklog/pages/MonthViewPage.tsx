import { useUi } from "../stores/ui";
import { useMonthOverview } from "../queries/hooks";
import { MonthGrid } from "../components/calendar/MonthGrid";
import { monthAdd, monthFirst, monthTitle, todayStr } from "../lib/date";

export function MonthViewPage() {
  const { currentDate, setAnchor } = useUi();
  const { data, isLoading, error } = useMonthOverview(currentDate);
  const title = monthTitle(monthFirst(currentDate));
  const isCurrentMonth = monthFirst(currentDate) === monthFirst(todayStr());

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAnchor(monthAdd(currentDate, -1))}
            className="rounded border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            ← 上个月
          </button>
          <span className="min-w-[130px] text-center text-sm font-semibold text-gray-800">{title}</span>
          <button
            onClick={() => setAnchor(monthAdd(currentDate, 1))}
            className="rounded border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            下个月 →
          </button>
          {!isCurrentMonth && (
            <button
              onClick={() => setAnchor(todayStr())}
              className="rounded bg-blue-50 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-100"
            >
              回到本月
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-gray-400">点击任务查看详情，点击日期查看当天详情；悬浮任务可高亮其全部参与日期</span>
          {data && (
            <span className="rounded bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
              本月工作日 {data.workdays} 天
              {isCurrentMonth && <span className="ml-1 font-normal text-blue-500">已过 {data.workdaysElapsed} 天</span>}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 pb-4">
        {isLoading && <div className="py-20 text-center text-sm text-gray-400">加载中…</div>}
        {error && <div className="py-20 text-center text-sm text-red-500">{String(error)}</div>}
        {data && <MonthGrid overview={data} />}
      </div>
    </div>
  );
}
