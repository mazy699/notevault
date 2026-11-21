import { useState } from "react";
import { Modal } from "./Modal";
import { api } from "../../api/client";
import { useInvalidateAll, useOnboardingStatus } from "../../queries/hooks";

/**
 * 新手引导（首次启动自动出现）：
 * 1. 简要说明核心理念与操作 → 可载入演示数据试一试；
 * 2. 之后正式使用时，可一键清掉演示数据开始（设置页也可随时清除）。
 */
export function OnboardingModal() {
  const { data } = useOnboardingStatus();
  const invalidate = useInvalidateAll();
  const [busy, setBusy] = useState<string | null>(null);

  if (!data || data.done) return null;

  const dismiss = async (): Promise<void> => {
    await api.settingsSet("onboarding_done", "1");
    await invalidate();
  };

  const loadAndTry = async (): Promise<void> => {
    setBusy("demo");
    try {
      await api.demoSeed();
      await dismiss();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const clearAndStart = async (): Promise<void> => {
    setBusy("clear");
    try {
      await api.demoClear();
      await dismiss();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open onClose={() => void dismiss()} title="欢迎使用 WorkLog" width="w-[640px]">
      <div className="space-y-4 text-sm leading-relaxed text-gray-600">
        <p>
          这是一个<b className="text-gray-800">记录驱动</b>的工作日志与排期工具：你在任务里随手记下的每天进展，
          会自动变成日历色块、每日日志和晨会回顾——<b className="text-gray-800">不需要另外维护计划或日志</b>。
        </p>
        <ul className="space-y-2 rounded-xl bg-gray-50 p-3">
          <li>
            📅 <b>周视图（首页）</b>：色块 = 当天实际做了这个任务（被打断会自然断开）；悬浮色块可高亮该任务的全部参与日期；浅蓝虚线是期望时间窗。
          </li>
          <li>
            ⚡ <b>打断处理</b>：线上问题、紧急插入用 <kbd className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[11px]">Ctrl+Shift+N</kbd> 一键记录，排期任务不用动，偏差自动可见。
          </li>
          <li>
            ☀ <b>晨会</b>：每天早上自动汇总上一工作日的实际记录 + 今日计划。
          </li>
          <li>
            🗂 <b>项目</b>：任务可归属项目（默认在"默认项目"下），设置页可管理。
          </li>
          <li>
            🤖 <b>AI 周报</b>：在设置页配置 DeepSeek 等 OpenAI 兼容接口，一键把本周记录整理成简短周报。
          </li>
          <li>
            📝 <b>笔记</b>：调查结论、SQL 备忘随手记，标签 + 搜索方便回看。
          </li>
          <li>
            💾 数据保存在本机 SQLite，启动时自动备份。
          </li>
        </ul>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          {data.demoLoaded && (
            <button
              onClick={() => void clearAndStart()}
              disabled={busy !== null}
              className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {busy === "clear" ? "清除中…" : "清掉演示数据，开始正式使用"}
            </button>
          )}
          <button
            onClick={() => void loadAndTry()}
            disabled={busy !== null}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy === "demo" ? "载入中…" : "载入演示数据，试一试"}
          </button>
          <button
            onClick={() => void dismiss()}
            disabled={busy !== null}
            className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            直接开始使用
          </button>
        </div>
        <p className="text-right text-[11px] text-gray-400">
          提示：演示数据可随时在 设置 → 演示数据 中清除，不会影响你正式记录的内容。
        </p>
      </div>
    </Modal>
  );
}
