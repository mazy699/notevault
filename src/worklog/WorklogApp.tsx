import { useEffect } from "react";
import { Inbox, ListTodo, NotebookPen, Plus, Settings, Sunrise } from "lucide-react";
import { useUi } from "./stores/ui";
import { useJiraAutoSync } from "./queries/hooks";
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

const SIDES: { key: Page; label: string; Icon: typeof Sunrise }[] = [
  { key: "morning", label: "晨会", Icon: Sunrise },
  { key: "todos", label: "待办箱", Icon: Inbox },
  { key: "tasks", label: "任务", Icon: ListTodo },
  { key: "notes", label: "笔记", Icon: NotebookPen },
  { key: "settings", label: "设置", Icon: Settings },
];

export default function WorklogApp() {
  const page = useUi((s) => s.page);
  const nav = useUi((s) => s.nav);
  const setQuickOpen = useUi((s) => s.setQuickOpen);
  useJiraAutoSync();

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
      {/* 统一风格顶栏：与 NoteVault 读取/对比/密码工作台同款（品牌 + 分段页签 + 工具按钮） */}
      <header className="topbar">
        <div className="brand">
          <span className="logo-dot">N</span>
          NoteVault
        </div>
        <div className="seg">
          {TABS.map((t) => (
            <button key={t.key} className={page === t.key ? "active" : ""} onClick={() => nav(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        {SIDES.map((t) => (
          <button
            key={t.key}
            className={`icon-btn labeled${page === t.key ? " active" : ""}`}
            title={t.label}
            onClick={() => nav(t.key)}
          >
            <t.Icon size={15} />
            {t.label}
          </button>
        ))}
        <button className="btn-ghost" onClick={() => setQuickOpen(true)} title="快速新建（Ctrl+Shift+N）">
          <Plus size={14} />
          快速新建
        </button>
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
