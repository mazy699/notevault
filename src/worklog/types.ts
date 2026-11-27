// 渲染进程与主进程共享的 IPC 数据契约
// 命名与需求文档 §6 数据模型对应，日期一律 'yyyy-MM-dd' 字符串（本地时区）

export type TaskType = string;
export type TaskPriority = "high" | "medium" | "low";
export type TaskStatus = "todo" | "in_progress" | "on_hold" | "done" | "cancelled";

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
  /** 外部任务源："jira"（后续可扩展 linear/github），本地任务为 null */
  externalSource: string | null;
  /** 外部系统唯一标识（如 Jira issue key：PROJ-123） */
  externalId: string | null;
  /** 外部系统详情页链接 */
  externalUrl: string | null;
  /** 父任务标识（如 Jira Story key），非子任务为 null */
  externalParentKey: string | null;
  /** 父任务标题（父级上下文展示） */
  externalParentSummary: string | null;
  /** 外部系统侧最后更新时间 */
  externalUpdated: string | null;
  /** 已从源（JQL 结果）消失：仅标记不删除 */
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
}

export interface Chip {
  taskId: number;
  title: string;
  type: TaskType;
  status: TaskStatus;
  /** 计划条：来自外部任务的时间窗（尚无工作条目），按 duedate 展示 */
  planned?: boolean;
  /** 计划已过期（duedate 早于今天且未完成） */
  overdue?: boolean;
}

export interface MonthDay {
  date: string;
  chips: Chip[];
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
  /** 来源筛选："local"=仅本地任务，"jira"=仅 Jira 同步任务 */
  source?: string | null;
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

// ---------------- Jira 同步（Phase 1：只读导入） ----------------

export type JiraAuthType = "pat" | "basic";

/** Jira 连接配置（不含 token：token 单独存 setting，读取时只返回是否存在） */
export interface JiraConfig {
  /** Jira 实例根地址，如 https://jira.example.com（Server/DC）或 https://xxx.atlassian.net（Cloud） */
  baseUrl: string;
  /** 认证方式：PAT（Bearer，Server/DC 常用）或 邮箱 + API Token（Cloud） */
  authType: JiraAuthType;
  /** basic 认证的登录邮箱 */
  email: string;
  /** 过滤条件（JQL）；为空时使用默认口径 */
  jql: string;
  /** 定时同步间隔（分钟），应用打开期间生效 */
  intervalMinutes: number;
  /** 是否启用自动同步 */
  enabled: boolean;
}

/** 保存配置时的输入（token 为空表示保留旧值） */
export interface JiraConfigInput {
  baseUrl: string;
  authType: JiraAuthType;
  email: string;
  token: string;
  jql: string;
  intervalMinutes: number;
  enabled: boolean;
}

export interface JiraConfigView {
  config: JiraConfig;
  /** 是否已保存过 token */
  hasToken: boolean;
}

/** 默认 JQL：分配给我的子任务 + Bug（Bug 后续可按需删减） */
export const DEFAULT_JIRA_JQL = "assignee = currentUser() AND issuetype in (Sub-task, Bug) ORDER BY updated ASC";

export interface JiraSyncStatus {
  lastSyncAt: string | null;
  lastResult: "ok" | "error" | null;
  lastError: string | null;
  /** 上次同步命中的 issue 数 */
  lastCount: number | null;
}

export interface JiraSyncResult {
  created: number;
  updated: number;
  /** 本次标记为"已从源消失"的任务数 */
  markedMissing: number;
  totalIssues: number;
}

export interface JiraTestResult {
  ok: boolean;
  /** 连接成功时的用户显示名 / 失败原因（已脱敏） */
  message: string;
}
