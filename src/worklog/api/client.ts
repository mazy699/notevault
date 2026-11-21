import type {
  AiConfig,
  AiTestResult,
  CreateTaskInput,
  DayDetailData,
  DataInfo,
  DayLog,
  HolidayStatusData,
  ImportReport,
  MonthOverview,
  MorningData,
  Note,
  NoteFilter,
  NoteInput,
  OnboardingStatus,
  Project,
  Report,
  Task,
  TaskTypeDefinition,
  TaskDetailData,
  TaskListFilter,
  TaskWithStats,
  Todo,
  TodoAttachInput,
  TodoConvertInput,
  TodoUpdateInput,
  WeekMatrix,
  WeeklyReportStats,
  WeeklyReportResult,
  WorkEntry,
} from "../types";

async function call<T>(channel: string, payload?: unknown): Promise<T> {
  try {
    return (await window.api.invoke(channel, payload)) as T;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Electron 会给 remote method 错误加前缀，剥掉后展示干净的业务错误信息
    throw new Error(msg.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, ""));
  }
}

export interface EntryCreateInput {
  taskId: number | null;
  entryDate: string;
  content: string;
  effortHours: number | null;
}

export interface EntryUpdatePatch {
  entryDate?: string;
  content?: string;
  effortHours?: number | null;
}

export const api = {
  // 视图
  weekMatrix: (date: string) => call<WeekMatrix>("week_matrix", { date }),
  monthOverview: (date: string) => call<MonthOverview>("month_overview", { date }),
  dayLog: (date: string) => call<DayLog>("day_log", { date }),
  morningData: (today: string) => call<MorningData>("morning_data", { today }),

  // 任务
  taskList: (filter: TaskListFilter = {}) => call<TaskWithStats[]>("task_list", filter),
  taskGet: (taskId: number) => call<TaskDetailData>("task_get", { taskId }),
  taskCreate: (input: CreateTaskInput) => call<Task>("task_create", input),
  taskUpdate: (task: Task) => call<Task>("task_update", task),
  taskSetStatus: (taskId: number, status: string) => call<Task>("task_set_status", { taskId, status }),
  taskDelete: (taskId: number, hard: boolean) => call<void>("task_delete", { taskId, hard }),

  // 工作条目
  entryCreate: (input: EntryCreateInput) => call<WorkEntry>("entry_create", input),
  entryUpdate: (entryId: number, patch: EntryUpdatePatch) => call<WorkEntry>("entry_update", { entryId, patch }),
  entryDelete: (entryId: number) => call<void>("entry_delete", { entryId }),

  // 每日计划
  noteUpsert: (date: string, planText: string) => call<void>("note_upsert", { date, planText }),

  // 节假日
  holidayStatus: () => call<HolidayStatusData>("holiday_status"),
  holidayImport: (text: string) => call<ImportReport>("holiday_import", { text }),

  // 数据与备份
  backupNow: () => call<string>("backup_now"),
  exportJson: () => call<string>("export_json"),
  importJson: (text: string) => call<void>("import_json", { text }),
  settingsGet: (key: string) => call<string | null>("settings_get", { key }),
  settingsSet: (key: string, value: string) => call<void>("settings_set", { key, value }),
  dataInfo: () => call<DataInfo>("data_info"),

  // 演示数据
  demoSeed: () => call<{ tasks: number }>("demo_seed"),
  demoClear: () => call<number>("demo_clear"),

  // 项目管理
  projectList: () => call<Project[]>("project_list"),
  projectCreate: (name: string) => call<Project>("project_create", { name }),
  projectRename: (id: number, name: string) => call<Project>("project_rename", { id, name }),
  projectDelete: (id: number) => call<void>("project_delete", { id }),
  taskTypesList: () => call<TaskTypeDefinition[]>("task_types_list"),
  taskTypeCreate: (input: { label: string; color: string }) =>
    call<TaskTypeDefinition>("task_type_create", input),
  taskTypeUpdate: (id: string, input: { label: string; color: string }) =>
    call<TaskTypeDefinition>("task_type_update", { id, ...input }),
  taskTypeDelete: (id: string) => call<void>("task_type_delete", { id }),

  // 新手引导
  onboardingStatus: () => call<OnboardingStatus>("onboarding_status"),

  // AI
  aiGetConfig: () => call<AiConfig>("ai_get_config"),
  aiSaveConfig: (cfg: { baseUrl: string; apiKey: string; model: string }) => call<void>("ai_save_config", cfg),
  aiTestConnection: (cfg: { baseUrl: string; apiKey: string; model: string }) =>
    call<AiTestResult>("ai_test_connection", cfg),
  dayDetail: (date: string) => call<DayDetailData>("day_detail", { date }),
  weeklyReportStats: (date: string) => call<WeeklyReportStats>("weekly_report_stats", { date }),
  aiWeeklyReport: (date: string) => call<WeeklyReportResult>("ai_weekly_report", { date }),
  aiReportList: () => call<Report[]>("ai_report_list"),
  aiReportSave: (id: number, content: string, summaryContent: string) =>
    call<Report>("ai_report_save", { id, content, summaryContent }),
  aiReportDelete: (id: number) => call<void>("ai_report_delete", { id }),

  // 笔记
  noteList: (filter: NoteFilter = {}) => call<Note[]>("note_list", filter),
  noteCreate: (input: NoteInput) => call<Note>("note_create", input),
  noteUpdate: (id: number, input: NoteInput) => call<Note>("note_update", { id, input }),
  noteDelete: (id: number) => call<void>("note_delete", { id }),
  noteTogglePin: (id: number) => call<Note>("note_toggle_pin", { id }),

  // 待办箱
  todoList: () => call<Todo[]>("todo_list"),
  todoCreate: (content: string) => call<Todo>("todo_create", { content }),
  todoUpdate: (id: number, input: TodoUpdateInput) => call<Todo>("todo_update", { id, input }),
  todoToggle: (id: number) => call<Todo>("todo_toggle", { id }),
  todoDelete: (id: number) => call<void>("todo_delete", { id }),
  todoDeleteMany: (ids: number[]) => call<number>("todo_delete_many", { ids }),
  todoConvert: (input: TodoConvertInput) => call<Task>("todo_convert", input),
  todoAttach: (input: TodoAttachInput) => call<Task>("todo_attach", input),
};
