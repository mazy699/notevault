import { useEffect, useState } from "react";
import { useMorningData, useNoteUpsert, useDayLog, useTaskTypes } from "../queries/hooks";
import { EntryGroupList } from "../components/entry/EntryGroupList";
import { useUi } from "../stores/ui";
import { todayStr, weekdayCN, fmtDateCN } from "../lib/date";
import { DEFAULT_TASK_TYPES, STATUS_LABELS, taskTypeColor } from "../lib/colors";

/** 晨会复盘：上一工作日实际记录 + 进行中任务 + 今日计划（每天早上 1~2 分钟） */
export function MorningPage() {
  const today = todayStr();
  const { data, isLoading, error } = useMorningData(today);
  const dayLog = useDayLog(today);
  const noteMut = useNoteUpsert();
  const taskTypes = useTaskTypes().data ?? DEFAULT_TASK_TYPES;
  const [plan, setPlan] = useState("");
  const nav = useUi((s) => s.nav);

  useEffect(() => setPlan(data?.todayPlan ?? ""), [data?.todayPlan, today]);

  return (
    <div className="h-full overflow-auto px-4 py-4">
      <div className="mx-auto max-w-[900px]">
        <div className="mb-4 flex items-baseline justify-between">
          <h1 className="text-lg font-semibold text-gray-800">早上好 ☀ 今天是 {fmtDateCN(today)} {weekdayCN(today)}</h1>
          <span className="text-[11px] text-gray-400">记录驱动：昨天做了什么由工作记录自动汇总，不需要另外写日志</span>
        </div>

        {isLoading && <div className="py-16 text-center text-sm text-gray-400">加载中…</div>}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            晨会数据加载失败：{String(error)}
          </div>
        )}

        {data && (
          <div className="space-y-4">
            {/* 上一工作日回顾 */}
            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">
                  上一工作日 · {fmtDateCN(data.prevDate)} {weekdayCN(data.prevDate)} 实际完成
                </h2>
                <button className="text-xs text-blue-600 hover:underline" onClick={() => useUi.getState().openDayDetail(data?.prevDate ?? todayStr())}>
                  查看整天 →
                </button>
              </div>
              {data.prevGroups.length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-400">上一工作日没有工作记录</div>
              ) : (
                <EntryGroupList groups={data.prevGroups} />
              )}
            </section>

            {/* 进行中任务 */}
            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-gray-700">当前进行中 / 搁置的任务</h2>
              {data.inProgress.length === 0 ? (
                <div className="py-4 text-center text-sm text-gray-400">暂无进行中的任务，去周视图规划吧</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {data.inProgress.map((t) => (
                    <button
                      key={t.id}
                      className="flex w-full items-center gap-2 px-1 py-2 text-left hover:bg-gray-50"
                      onClick={() => useUi.getState().openTask(t.id)}
                    >
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: taskTypeColor(taskTypes, t.type) }} />
                      <span className="text-sm font-medium text-gray-800">{t.title}</span>
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">{STATUS_LABELS[t.status]}</span>
                      <span className="ml-auto text-[11px] text-gray-400">
                        最近活动 {t.lastActivity ?? "无"} · 已占用 {t.occupiedDays} 天
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* 今日计划 */}
            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-1.5 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">今日计划</h2>
                <div className="flex gap-2">
                  {plan !== (dayLog.data?.plan ?? "") && (
                    <button
                      onClick={() => void noteMut.mutateAsync({ date: today, planText: plan })}
                      className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
                    >
                      保存并开始今天
                    </button>
                  )}
                  <button onClick={() => nav("week")} className="rounded border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50">
                    跳过，去周视图
                  </button>
                </div>
              </div>
              <textarea
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                rows={3}
                placeholder={"例如：\n1. 继续订单模块开发（推进 day2）\n2. 跟进线上告警的修复验证"}
                className="w-full resize-y rounded border border-gray-200 px-2 py-1.5 text-[13px] focus:border-blue-500 focus:outline-none"
              />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
