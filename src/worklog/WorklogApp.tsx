import { useEffect } from "react";
import { useUi } from "./stores/ui";
import { WeekViewPage } from "./pages/WeekViewPage";
import { MonthViewPage } from "./pages/MonthViewPage";
import { MorningPage } from "./pages/MorningPage";
import { TaskListPage } from "./pages/TaskListPage";
import { TaskDetailPage } from "./pages/TaskDetailPage";
import { SettingsPage } from "./pages/SettingsPage";
import { QuickCreateDialog } from "./components/task/QuickCreateDialog";
import { EntryEditorDialog } from "./components/entry/EntryEditorDialog";
import { OnboardingModal } from "./components/common/OnboardingModal";
import { WeeklyReportDialog } from "./components/ai/WeeklyReportDialog";
import { DayDetailDrawer } from "./components/calendar/DayDetailDrawer";
import { NotesPage } from "./pages/NotesPage";
import { TodoPage } from "./pages/TodoPage";
import type { Page } from "./lib/nav";

const TABS: { key: Page; label: string }[] = [
  { key: "week", label: "周视图" },
  { key: "month", label: "月视图" },
];

const SIDES: { key: Page; label: string }[] = [
  { key: "morning", label: "☀ 晨会" },
  { key: "todos", label: "待办箱" },
  { key: "tasks", label: "任务" },
  { key: "notes", label: "📝 笔记" },
  { key: "settings", label: "设置" },
];

export default function WorklogApp() {
  const page = useUi((s) => s.page);
  const nav = useUi((s) => s.nav);
  const setQuickOpen = useUi((s) => s.setQuickOpen);
  const theme = useUi((s) => s.theme);
  const toggleTheme = useUi((s) => s.toggleTheme);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        setQuickOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setQuickOpen]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-blue-600 text-xs font-bold text-white">记</div>
            <span className="font-semibold text-gray-800">WorkLog</span>
          </div>
          <nav className="flex gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => nav(t.key)}
                className={`rounded px-3 py-1.5 text-sm transition-colors ${
                  page === t.key ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
            title={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
            className="mr-1 rounded border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50"
          >
            {theme === "dark" ? "浅色" : "深色"}
          </button>
          {SIDES.map((t) => (
            <button
              key={t.key}
              onClick={() => nav(t.key)}
              className={`rounded px-3 py-1.5 text-sm transition-colors ${
                page === t.key ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {t.label}
            </button>
          ))}
          <button
            onClick={() => setQuickOpen(true)}
            title="Ctrl+Shift+N"
            className="ml-2 rounded bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600"
          >
            ＋ 快速新建
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1">
        <div key={page} className="wl-page h-full">
          {page === "week" && <WeekViewPage />}
          {page === "month" && <MonthViewPage />}
          {page === "morning" && <MorningPage />}
          {page === "todos" && <TodoPage />}
          {page === "tasks" && <TaskListPage />}
        {page === "task" && <TaskDetailPage />}
        {page === "notes" && <NotesPage />}
        {page === "settings" && <SettingsPage />}
        </div>
      </main>

      <QuickCreateDialog />
      <EntryEditorDialog />
      <OnboardingModal />
      <WeeklyReportDialog />
      <DayDetailDrawer />
    </div>
  );
}
