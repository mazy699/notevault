import { useEffect, useState } from "react";
import { Modal } from "../common/Modal";
import { MarkdownView } from "../common/MarkdownView";
import { useUi } from "../../stores/ui";
import { useOnboardingStatus } from "../../queries/hooks";
import { api } from "../../api/client";
import { copyText } from "../../lib/clipboard";
import { addDaysStr, weekMonday } from "../../lib/date";
import type { AiConfig, Report, WeeklyReportStats } from "../../types";
import { resolveReportPanel } from "./report-dialog-state";

type ReportView = "summary" | "detail";

/** AI 周报：本周统计概览 -> 简洁版/明细版 -> 复制或回看历史 */
export function WeeklyReportDialog() {
  const open = useUi((s) => s.aiReportOpen);
  const setOpen = useUi((s) => s.setAiReportOpen);
  const currentDate = useUi((s) => s.currentDate);
  const nav = useUi((s) => s.nav);
  const onboarding = useOnboardingStatus();

  const [config, setConfig] = useState<AiConfig | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [content, setContent] = useState("");
  const [summaryContent, setSummaryContent] = useState("");
  const [reportId, setReportId] = useState<number | null>(null);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const [history, setHistory] = useState<Report[]>([]);
  const [stats, setStats] = useState<WeeklyReportStats | null>(null);
  const [statsDate, setStatsDate] = useState(currentDate);
  const [statsLoading, setStatsLoading] = useState(false);
  const [view, setView] = useState<ReportView>("summary");
  const [showPreview, setShowPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const monday = weekMonday(currentDate);
  const sunday = addDaysStr(monday, 6);

  useEffect(() => {
    if (!open) return;
    void api
      .aiGetConfig()
      .then(setConfig)
      .catch(() => setConfig({ baseUrl: "", apiKey: "", model: "", overrides: [] }));
    void api
      .aiReportList()
      .then((list) => {
        setHistory(list);
        // 调试/截图用：?aireport-content=1 自动载入最近一份周报
        if (new URLSearchParams(window.location.search).get("aireport-content") === "1" && list.length) {
          openFromHistory(list[0]);
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setStatsDate(currentDate);
  }, [open, currentDate]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatsLoading(true);
    void api
      .weeklyReportStats(statsDate)
      .then((value) => {
        if (!cancelled) setStats(value);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, statsDate]);

  const configured = config != null && config.baseUrl.trim() !== "" && config.model.trim() !== "";
  const activeContent = view === "summary" ? summaryContent : content;
  const hasActiveReport = phase === "done" && reportId != null;
  const reportPanel = resolveReportPanel(hasActiveReport, configured);
  const period =
    hasActiveReport && range
      ? range
      : stats
        ? { start: stats.start, end: stats.end }
        : { start: monday, end: sunday };

  const updateActiveContent = (value: string): void => {
    if (view === "summary") setSummaryContent(value);
    else setContent(value);
    setDirty(true);
  };

  const generate = async (): Promise<void> => {
    const generateDate = hasActiveReport && range ? range.start : currentDate;
    setPhase("loading");
    setError("");
    try {
      const result = await api.aiWeeklyReport(generateDate);
      setContent(result.content);
      setSummaryContent(result.summaryContent);
      setReportId(result.id);
      setRange({ start: result.rangeStart, end: result.rangeEnd });
      setStatsDate(result.rangeStart);
      setView("summary");
      setPhase("done");
      setDirty(false);
      void api.aiReportList().then(setHistory).catch(() => undefined);
      void api.weeklyReportStats(result.rangeStart).then(setStats).catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  const openFromHistory = (report: Report): void => {
    setContent(report.content);
    setSummaryContent(report.summaryContent);
    setReportId(report.id);
    setRange({ start: report.rangeStart, end: report.rangeEnd });
    setStatsDate(report.rangeStart);
    setView(report.summaryContent.trim() ? "summary" : "detail");
    setPhase("done");
    setError("");
    setDirty(false);
  };

  const saveEdit = async (): Promise<void> => {
    if (reportId == null) return;
    try {
      await api.aiReportSave(reportId, content, summaryContent);
      setDirty(false);
      void api.aiReportList().then(setHistory).catch(() => undefined);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  };

  const deleteReport = async (report: Report): Promise<void> => {
    if (!window.confirm(`确定删除 ${report.rangeStart} ~ ${report.rangeEnd} 的周报吗？`)) return;
    setDeletingId(report.id);
    try {
      await api.aiReportDelete(report.id);
      const list = await api.aiReportList();
      setHistory(list);
      if (reportId === report.id) {
        setContent("");
        setSummaryContent("");
        setReportId(null);
        setRange(null);
        setStatsDate(currentDate);
        setPhase("idle");
        setDirty(false);
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  };

  const doCopy = async (): Promise<void> => {
    const ok = await copyText(activeContent);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      window.alert("复制失败，请手动选择文本复制");
    }
  };

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="AI 周报" width="w-[1080px]">
      <div className="space-y-4">
        <section className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50/60">
          <div className="flex items-start justify-between gap-4 px-4 py-3">
            <div>
              <div className="text-[11px] font-medium text-gray-400">报告周期</div>
              <div className="mt-0.5 text-base font-semibold text-gray-900">
                {period.start} ~ {period.end}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                工作日 {stats?.workdays ?? "—"} 天
                <span className="mx-1.5 text-gray-300">/</span>
                模型 {config?.model || "未配置"}
              </div>
            </div>
            {configured && (
              <button
                onClick={() => void generate()}
                disabled={phase === "loading"}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {phase === "loading"
                  ? "生成中…"
                  : hasActiveReport && range && range.start !== monday
                    ? "重新生成此周"
                    : reportId != null
                      ? "重新生成本周"
                      : "生成本周周报"}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 border-t border-gray-200 bg-white md:grid-cols-4">
            <Metric label="投入工时" value={stats ? `${stats.totalHours}h` : "—"} tone="blue" loading={statsLoading} />
            <Metric label="活跃任务" value={stats ? `${stats.taskCount} 个` : "—"} tone="violet" loading={statsLoading} />
            <Metric label="记录天数" value={stats ? `${stats.activeDays} 天` : "—"} tone="green" loading={statsLoading} />
            <Metric
              label="打断事项"
              value={stats ? `${stats.interruptionCount} 个` : "—"}
              tone="amber"
              loading={statsLoading}
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-200 px-4 py-2 text-[11px] text-gray-500">
            <span>已完成 {stats?.completedCount ?? 0} 个任务</span>
            <span>共 {stats?.entryCount ?? 0} 条记录</span>
            <span>独立记录 {stats?.independentCount ?? 0} 条</span>
            <span>统计口径不含演示数据</span>
            {onboarding.data?.demoLoaded && (
              <span className="ml-auto rounded bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                演示记录已自动排除
              </span>
            )}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          <main className="min-w-0">
            {reportPanel === "configure" && (
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-5 py-10 text-center">
                <div className="text-sm font-medium text-gray-700">还没有配置 AI 接口</div>
                <p className="mx-auto mt-1 max-w-[560px] text-xs leading-5 text-gray-500">
                  配置接口地址、API Key 和模型名后，即可生成约 100 字的简洁版和完整明细。演示数据不会发送给 AI。
                </p>
                <button
                  onClick={() => {
                    setOpen(false);
                    nav("settings");
                  }}
                  className="mt-4 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  去设置页配置
                </button>
              </div>
            )}

            {reportPanel === "generator" && (
              <>
                {error && (
                  <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                    {error}
                  </div>
                )}

                {phase === "idle" && !error && (
                  <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-5 py-14 text-center">
                    <div className="text-sm font-medium text-gray-700">准备生成本周周报</div>
                    <p className="mt-1 text-xs leading-5 text-gray-500">
                      AI 会生成约 100 字的简洁版，以及保留任务分组的完整明细。
                    </p>
                  </div>
                )}
              </>
            )}

            {reportPanel === "report" && (
              <>
                {!configured && (
                  <div className="mb-3 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                    当前未配置 AI 接口，历史周报仍可查看、编辑和复制。
                  </div>
                )}

                {error && (
                  <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                    {error}
                  </div>
                )}

                <section className="rounded-lg border border-gray-200 bg-white">
                    <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-3 py-2">
                      <div className="flex rounded border border-gray-200 p-0.5">
                        <button
                          onClick={() => setView("summary")}
                          className={`rounded px-3 py-1 text-xs ${
                            view === "summary" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          简洁版
                        </button>
                        <button
                          onClick={() => setView("detail")}
                          className={`rounded px-3 py-1 text-xs ${
                            view === "detail" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          完整明细
                        </button>
                      </div>
                      <div className="flex rounded border border-gray-200 p-0.5">
                        <button
                          onClick={() => setShowPreview(false)}
                          className={`rounded px-2.5 py-1 text-xs ${
                            !showPreview ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => setShowPreview(true)}
                          className={`rounded px-2.5 py-1 text-xs ${
                            showPreview ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          预览
                        </button>
                      </div>
                      <button
                        onClick={() => void doCopy()}
                        className="rounded border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
                      >
                        {copied ? "已复制" : `复制${view === "summary" ? "简洁版" : "明细版"}`}
                      </button>
                      {dirty && reportId != null && (
                        <button
                          onClick={() => void saveEdit()}
                          className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                        >
                          保存修改
                        </button>
                      )}
                      <span className="ml-auto text-[11px] text-gray-400">
                        {dirty ? "有未保存修改" : view === "summary" ? "约 100 字，适合直接复制" : "保留任务分组明细"}
                      </span>
                    </div>

                    {view === "summary" && !summaryContent.trim() && (
                      <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        这份历史周报没有简洁版，重新生成后会自动补齐。
                      </div>
                    )}

                    {showPreview ? (
                      <div className="max-h-[52vh] min-h-[360px] overflow-auto p-4">
                        <MarkdownView text={activeContent} />
                      </div>
                    ) : (
                      <textarea
                        value={activeContent}
                        onChange={(event) => updateActiveContent(event.target.value)}
                        rows={16}
                        placeholder={view === "summary" ? "简洁版内容" : "完整明细"}
                        className="min-h-[360px] w-full resize-y border-0 px-4 py-3 font-mono text-[13px] leading-relaxed focus:outline-none"
                      />
                    )}
                </section>
              </>
            )}
          </main>

          <aside className="min-w-0 border-l border-gray-200 pl-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold text-gray-500">往期周报</div>
              <div className="text-[11px] text-gray-400">最近 {history.length} 份</div>
            </div>
            <div className="max-h-[560px] space-y-2 overflow-auto pr-1">
              {history.length === 0 && (
                <div className="rounded border border-dashed border-gray-200 px-3 py-8 text-center text-xs text-gray-400">
                  暂无历史
                </div>
              )}
              {history.map((report) => (
                <div
                  key={report.id}
                  className={`flex overflow-hidden rounded border transition-colors ${
                    reportId === report.id
                      ? "border-blue-300 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => openFromHistory(report)}
                    className="min-w-0 flex-1 px-3 py-2 text-left"
                  >
                    <span className="block text-xs font-medium">
                      {report.rangeStart.slice(5)} ~ {report.rangeEnd.slice(5)}
                    </span>
                    <span className="mt-1 flex items-center justify-between gap-2 text-[10px] text-gray-400">
                      <span>{report.createdAt.slice(0, 16)}</span>
                      <span className="truncate">{report.model || "未记录模型"}</span>
                    </span>
                    <span className="mt-1 block truncate text-[11px] text-gray-500">
                      {report.summaryContent ||
                        report.content.replace(/[#*`>-]/g, " ").replace(/\s+/g, " ").trim()}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteReport(report)}
                    disabled={deletingId === report.id}
                    className="shrink-0 border-l border-gray-200 px-2 text-[11px] text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    title="删除这条周报"
                  >
                    {deletingId === report.id ? "删除中" : "删除"}
                  </button>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </Modal>
  );
}

function Metric({
  label,
  value,
  tone,
  loading,
}: {
  label: string;
  value: string;
  tone: "blue" | "violet" | "green" | "amber";
  loading: boolean;
}) {
  const tones = {
    blue: "bg-blue-500",
    violet: "bg-violet-500",
    green: "bg-green-500",
    amber: "bg-amber-500",
  };

  return (
    <div className="border-b border-r border-gray-100 px-4 py-3 last:border-r-0 md:border-b-0">
      <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
        <span className={`h-1.5 w-1.5 rounded-full ${tones[tone]}`} />
        {label}
      </div>
      <div className="mt-1.5 text-xl font-semibold tabular-nums text-gray-900">{loading ? "加载中…" : value}</div>
    </div>
  );
}
