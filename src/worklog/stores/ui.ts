import { create } from "zustand";
import { todayStr } from "../lib/date";
import type { Page } from "../lib/nav";
import type { WorkEntry } from "../types";

export interface EntryEditorState {
  taskId: number | null;
  date: string;
  entry: WorkEntry | null;
}

export type Theme = "light" | "dark";

const THEME_KEY = "worklog-theme";
const SHOW_COMPLETED_TASKS_KEY = "worklog-show-completed-tasks";

const initialShowCompletedTasks = (): boolean => {
  try {
    return localStorage.getItem(SHOW_COMPLETED_TASKS_KEY) === "1";
  } catch {
    return false;
  }
};

const applyTheme = (theme: Theme): void => {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#0f172a" : "#f8fafc");
};

interface UiState {
  theme: Theme;
  showCompletedTasks: boolean;
  page: Page;
  /** 进入任务详情前的页面，返回时回到那里 */
  taskReturnPage: Page;
  /** 日/周/月视图的锚点日期 */
  currentDate: string;
  taskId: number | null;
  /** 任务详情页要定位到的日期 */
  taskFocusDate: string | null;
  /** 日期详情侧栏锚定的日期（null = 关闭） */
  dayDetailDate: string | null;
  hoverTaskId: number | null;
  quickOpen: boolean;
  /** AI 周报对话框 */
  aiReportOpen: boolean;
  entryEditor: EntryEditorState | null;
  toggleTheme: () => void;
  toggleShowCompletedTasks: () => void;
  nav: (page: Page) => void;
  setAnchor: (date: string) => void;
  openTask: (id: number, focusDate?: string | null) => void;
  openDayDetail: (date: string) => void;
  closeDayDetail: () => void;
  setHover: (id: number | null) => void;
  setQuickOpen: (open: boolean) => void;
  setAiReportOpen: (open: boolean) => void;
  openEntryEditor: (state: EntryEditorState) => void;
  closeEntryEditor: () => void;
}

export const useUi = create<UiState>()((set) => ({
  theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  showCompletedTasks: initialShowCompletedTasks(),
  page: "week",
  taskReturnPage: "week",
  currentDate: todayStr(),
  taskId: null,
  taskFocusDate: null,
  dayDetailDate: null,
  hoverTaskId: null,
  quickOpen: false,
  aiReportOpen: false,
  entryEditor: null,
  toggleTheme: () =>
    set((s) => {
      const theme: Theme = s.theme === "dark" ? "light" : "dark";
      applyTheme(theme);
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch {
        /* 隐私模式下仅保留当前会话主题 */
      }
      return { theme };
    }),
  toggleShowCompletedTasks: () =>
    set((s) => {
      const showCompletedTasks = !s.showCompletedTasks;
      try {
        localStorage.setItem(SHOW_COMPLETED_TASKS_KEY, showCompletedTasks ? "1" : "0");
      } catch {
        /* 隐私模式下仅保留当前会话状态 */
      }
      return { showCompletedTasks };
    }),
  nav: (page) => set({ page }),
  setAnchor: (currentDate) => set({ currentDate }),
  openTask: (taskId, taskFocusDate = null) =>
    set((s) => ({ page: "task", taskId, taskFocusDate, taskReturnPage: s.page })),
  openDayDetail: (dayDetailDate) => set({ dayDetailDate }),
  closeDayDetail: () => set({ dayDetailDate: null }),
  setHover: (hoverTaskId) => set({ hoverTaskId }),
  setQuickOpen: (quickOpen) => set({ quickOpen }),
  setAiReportOpen: (aiReportOpen) => set({ aiReportOpen }),
  openEntryEditor: (entryEditor) => set({ entryEditor }),
  closeEntryEditor: () => set({ entryEditor: null }),
}));
