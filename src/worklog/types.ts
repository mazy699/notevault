// 渲染进程与主进程共享的 IPC 数据契约
// 命名与需求文档 §6 数据模型对应，日期一律 'yyyy-MM-dd' 字符串（本地时区）

export type TaskType = string;
export type TaskPriority = "high" | "medium" | "low";
export type TaskStatus = "todo" | "in_progress" | "on_hold" | "done" | "cancelled";

/** 外部任务来源（只读同步）；本地任务为 null */
export type ExternalSource = "jira" | "linear" | "github";

export interface TaskTypeDefinition {
  id: string;
  label: string;
  color: string;
  order: number;
  builtin: boolean;
}

/** 默认项目由迁移固定创建，id 恒为 1，不可删除 */
export const DEFAULT_PROJECT_ID = 1;

export interface Project {
  id: number;
  name: string;
  sort: number;
  createdAt: string;
}

export interface Task {
  id: number;
  title: string;
  description: string;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  estimateDays: number | null;
  windowStart: string | null;
  windowEnd: string | null;
  projectId: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  /** 外部来源（只读同步）；本地任务为 null */
  externalSource: ExternalSource | null;
  /** 外部系统内的唯一键，如 Jira 的 PROJ-123 */
  externalId: string | null;
  externalUrl: string | null;
  externalParentKey: string | null;
  externalParentSummary: string | null;
  /** 外部系统原始状态名（本地 status 是映射后的结果） */
  externalStatus: string | null;
  /** 外部系统更新时间，用于增量与跳过无变化项 */
  externalUpdated: string | null;
  externalSyncedAt: string | null;
  /** 上次全量同步时在外部系统已不可见（不自动删除） */
  externalMissing: boolean;
}

export interface WorkEntry {
  id: number;
  taskId: number | null;
  entryDate: string;
  content: string;
  effortHours: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskStats {
  occupiedDays: number;
  totalHours: number | null;
  lastActivity: string | null;
}

export interface TaskWithStats extends Task, TaskStats {}

/** 某一天的日历元信息（节假日口径由 holiday 表给出） */
export interface DayMeta {
  date: string;
  weekday: string;
  isWorkday: boolean;
  /** 节日名（放假）或 "班"（调休补班），普通日子为 null */
  tag: string | null;
  /** tag 是否为放假标记（true=放假红字，false=补班） */
  isOffTag: boolean;
}

export interface EntrySummary {
  id: number;
  snippet: string;
  effortHours: number | null;
}

export interface WeekCell {
  date: string;
  entries: EntrySummary[];
}

export interface TaskRow {
  task: Task;
  occupiedDays: number;
  totalHours: number | null;
  lastActivity: string | null;
  cells: WeekCell[];
  window: { start: string; end: string } | null;
}

export interface WeekMatrix {
  weekStart: string;
  days: DayMeta[];
  rows: TaskRow[];
  /** 外部来源、未排期（无时间窗）的待办，单独成区，不挤进甘特矩阵 */
  externalUnscheduled: Task[];
}

export interface Chip {
  taskId: number;
  title: string;
  type: TaskType;
  status: TaskStatus;
  /** true = 外部来源的计划日期（虚线展示），false/缺省 = 已记录 */
  planned?: boolean;
  externalSource?: ExternalSource | null;
  externalId?: string | null;
  externalMissing?: boolean;
}

export interface MonthDay {
  date: string;
  chips: Chip[];
  /** 外部来源的计划项（与已记录 chips 分层展示） */
  plans: Chip[];
}

export interface MonthOverview {
  gridStart: string;
  days: DayMeta[];
  monthDays: MonthDay[];
  /** 当月工作日数（按节假日口径） */
  workdays: number;
  /** 当月已过的工作日数（含今天；非当月时为 0 或全月） */
  workdaysElapsed: number;
}

export interface EntryGroup {
  task: Task | null;
  entries: WorkEntry[];
}

export interface DayLog {
  date: string;
  plan: string;
  groups: EntryGroup[];
}

export interface DayDetailStats {
  /** 当天有工作条目的任务数 */
  taskCount: number;
  /** 其中打断类（紧急插入/线上问题）数量 */
  interruptionCount: number;
  /** 独立记录条数 */
  independentCount: number;
  totalHours: number | null;
  /** 当天新建的笔记数 */
  noteCount: number;
}

export interface DayDetailData {
  date: string;
  weekday: string;
  isWorkday: boolean;
  tag: string | null;
  isOffTag: boolean;
  plan: string;
  groups: EntryGroup[];
  stats: DayDetailStats;
  notes: Note[];
}

export interface MorningData {
  prevDate: string;
  prevGroups: EntryGroup[];
  inProgress: TaskWithStats[];
  todayPlan: string;
}

export interface GroupedEntries {
  date: string;
  entries: WorkEntry[];
}

export interface TaskDetailData {
  task: Task;
  stats: TaskStats;
  days: GroupedEntries[];
}

export interface TaskListFilter {
  status?: string | null;
  type?: string | null;
  search?: string | null;
  projectId?: number | null;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  type: TaskType;
  priority: TaskPriority;
  estimateDays?: number | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  /** 不传或为空时归入默认项目 */
  projectId?: number | null;
  /** 快速新建打断任务时可直接带上今天的条目内容 */
  todayEntryContent?: string | null;
  /** 快速新建时同时记录今日投入工时 */
  todayEntryHours?: number | null;
}

export interface HolidayStatusData {
  years: number[];
}

export interface ImportReport {
  imported: number;
  years: number[];
}

export interface DataInfo {
  dataDir: string;
  dbFile: string;
}

export interface OnboardingStatus {
  /** 是否已完成新手引导（选择过"开始使用"） */
  done: boolean;
  /** 是否载有演示数据 */
  demoLoaded: boolean;
}

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** 被 ai.json 覆盖的字段名列表 */
  overrides: string[];
}

export interface AiTestResult {
  ok: boolean;
  reply?: string;
  error?: string;
}

export interface Report {
  id: number;
  type: string;
  rangeStart: string;
  rangeEnd: string;
  model: string | null;
  content: string;
  summaryContent: string;
  createdAt: string;
}

export interface WeeklyReportResult {
  id: number;
  rangeStart: string;
  rangeEnd: string;
  model: string;
  content: string;
  summaryContent: string;
}

export interface WeeklyReportStats {
  start: string;
  end: string;
  workdays: number;
  activeDays: number;
  taskCount: number;
  completedCount: number;
  interruptionCount: number;
  entryCount: number;
  independentCount: number;
  totalHours: number;
}

export interface Note {
  id: number;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export type TodoStatus = "open" | "done" | "converted";

export interface Todo {
  id: number;
  content: string;
  detail: string;
  status: TodoStatus;
  linkedTaskId: number | null;
  linkedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TodoConvertInput {
  ids: number[];
  title: string;
}

export interface TodoAttachInput {
  ids: number[];
  taskId: number;
}

export interface TodoUpdateInput {
  content: string;
  detail: string;
}

export interface NoteFilter {
  search?: string | null;
  tag?: string | null;
}

export interface NoteInput {
  title?: string;
  content: string;
  tags?: string[] | string;
}
