import { exportStore, inTxn, openStore, q, run, type Database, type Store } from "./db";
import type { WlPersist } from "./persist";
import * as taskMod from "./task";
import * as entryMod from "./entry";
import * as daylogMod from "./daylog";
import * as overviewMod from "./overview";
import * as holidayMod from "./holiday";
import * as settingsMod from "./settings";
import * as workdayMod from "./workday";
import * as projectMod from "./project";
import * as reportMod from "./report";
import * as aiMod from "./ai";
import * as noteMod from "./note";
import * as todoMod from "./todo";
import * as demoMod from "./demo";
import * as taskTypeMod from "./task-types";
import * as jiraSyncMod from "./sync";
import { addDaysStr, nowStr, weekMonday } from "./dates";
import { DEFAULT_PROJECT_ID } from "../types";
import type { JiraConfigInput, JiraConfigView } from "../../../shared/types";
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

/**
 * 数据服务门面：所有命令的落点（原 Electron IPC 命令 1:1 对应）。
 * 约定：每个写操作后立即整库落盘（个人工具数据量小，写放大可忽略，换取崩溃安全）。
 * 接入 NoteVault 后：sql.js 运行在前端，文件读写经 WlPersist（宿主 wl_* 命令）完成。
 */
export class DataService {
  private store!: Store;
  private persist!: WlPersist;
  /** 串行写盘链，保证多次保存按序落盘 */
  private saveChain: Promise<void> = Promise.resolve();
  /** 宿主 AI 代理 fetch（没有则用浏览器原生 fetch） */
  private fetchImpl: typeof fetch | undefined;
  /** Jira 宿主桥（配置 + REST 请求）；未注入时同步命令不可用 */
  private jiraTransport: jiraSyncMod.JiraTransport | undefined;
  /** 同一时间只允许一个同步任务 */
  private jiraSyncInFlight: Promise<jiraSyncMod.JiraSyncResult> | null = null;
  /** ai.json 覆盖配置（启动时读入缓存，与原 Electron 行为等价） */
  private aiFileCache: aiMod.AiFileConfig | null = null;
  dataDir = "";
  dbFile = "";

  async init(persist: WlPersist): Promise<void> {
    this.persist = persist;
    const info = await persist.info();
    this.dataDir = info.dataDir;
    this.dbFile = info.dbFile;
    const bytes = await persist.loadDb();
    this.store = await openStore(bytes);
    const aiRaw = await persist.readAux("ai.json");
    this.aiFileCache = parseAiFile(aiRaw);
    holidayMod.seedBuiltinHolidays(this.store.db);
    demoMod.cleanupLegacyDemoData(this.store.db);
    taskTypeMod.normalizeLegacyTaskTypes(this.store.db);
    this.save();
    await this.flush();
  }

  /** 注入宿主 AI 代理 fetch（跨宿主 CORS 兼容）；不注入则用原生 fetch */
  setFetchImpl(f: typeof fetch | undefined): void {
    this.fetchImpl = f;
  }

  /** 注入 Jira 宿主桥（配置存宿主文件，token 不经过数据层） */
  setJiraTransport(t: jiraSyncMod.JiraTransport | undefined): void {
    this.jiraTransport = t;
  }

  /** 等待所有挂起写盘完成 */
  async flush(): Promise<void> {
    await this.saveChain;
  }

  /**
   * 命令分发（与原 Web 宿主 web/server.ts 的路由表 1:1 对应）。
   * 前端直接调用，无需走宿主 IPC。
   */
  async dispatch(channel: string, payload?: Record<string, unknown>): Promise<unknown> {
    const p = payload ?? {};
    const routes: Record<string, () => unknown> = {
      task_create: () => this.taskCreate(p as unknown as CreateTaskInput),
      task_update: () => this.taskUpdate(p as unknown as Task),
      task_set_status: () => this.taskSetStatus(Number(p.taskId), String(p.status)),
      task_delete: () => this.taskDelete(Number(p.taskId), p.hard === true),
      task_list: () => this.taskList((p ?? {}) as TaskListFilter),
      task_get: () => this.taskGet(Number(p.taskId)),
      entry_create: () => this.entryCreate(p as unknown as entryMod.CreateEntryInput),
      entry_update: () => this.entryUpdate(Number(p.entryId), (p.patch ?? {}) as { entryDate?: string; content?: string; effortHours?: number | null }),
      entry_delete: () => this.entryDelete(Number(p.entryId)),
      week_matrix: () => this.weekMatrix(String(p.date)),
      month_overview: () => this.monthOverview(String(p.date)),
      day_log: () => this.dayLog(String(p.date)),
      day_detail: () => this.dayDetail(String(p.date)),
      note_upsert: () => this.noteUpsert(String(p.date), String(p.planText ?? "")),
      morning_data: () => this.morningData(String(p.today)),
      holiday_status: () => this.holidayStatus(),
      holiday_import: () => this.holidayImport(String(p.text)),
      backup_now: () => this.backupNow(),
      export_json: () => this.exportJson(),
      import_json: () => this.importJson(String(p.text)),
      settings_get: () => this.settingsGet(String(p.key)),
      settings_set: () => this.settingsSet(String(p.key), String(p.value)),
      data_info: () => this.dataInfo(),
      demo_seed: () => this.demoSeed(),
      demo_clear: () => this.demoClear(),
      project_list: () => this.projectList(),
      project_create: () => this.projectCreate(String(p.name)),
      project_rename: () => this.projectRename(Number(p.id), String(p.name)),
      project_delete: () => this.projectDelete(Number(p.id)),
      task_types_list: () => this.taskTypesList(),
      task_type_create: () => this.taskTypeCreate({ label: String(p.label ?? ""), color: String(p.color ?? "") }),
      task_type_update: () => this.taskTypeUpdate(String(p.id), { label: String(p.label ?? ""), color: String(p.color ?? "") }),
      task_type_delete: () => this.taskTypeDelete(String(p.id)),
      onboarding_status: () => this.onboardingStatus(),
      ai_get_config: () => this.aiGetConfig(),
      ai_save_config: () => this.aiSaveConfig({ baseUrl: String(p.baseUrl ?? ""), apiKey: String(p.apiKey ?? ""), model: String(p.model ?? "") }),
      ai_test_connection: () => this.aiTestConnection({ baseUrl: String(p.baseUrl ?? ""), apiKey: String(p.apiKey ?? ""), model: String(p.model ?? "") }),
      weekly_report_stats: () => this.weeklyReportStats(String(p.date)),
      ai_weekly_report: () => this.aiWeeklyReport(String(p.date)),
      ai_report_list: () => this.aiReportList(),
      ai_report_save: () => this.aiReportSave(Number(p.id), String(p.content), String(p.summaryContent ?? "")),
      ai_report_delete: () => this.aiReportDelete(Number(p.id)),
      note_list: () => this.noteList((p ?? {}) as NoteFilter),
      note_create: () => this.noteCreate(p as unknown as NoteInput),
      note_update: () => this.noteUpdate(Number(p.id), p.input as unknown as NoteInput),
      note_delete: () => this.noteDelete(Number(p.id)),
      note_toggle_pin: () => this.noteTogglePin(Number(p.id)),
      todo_list: () => this.todoList(),
      todo_create: () => this.todoCreate(String(p.content)),
      todo_update: () => this.todoUpdate(Number(p.id), p.input as unknown as TodoUpdateInput),
      todo_toggle: () => this.todoToggle(Number(p.id)),
      todo_delete: () => this.todoDelete(Number(p.id)),
      todo_delete_many: () => this.todoDeleteMany(Array.isArray(p.ids) ? p.ids.map(Number) : []),
      todo_convert: () => this.todoConvert(p as unknown as TodoConvertInput),
      todo_attach: () => this.todoAttachToTask(p as unknown as TodoAttachInput),
      jira_config_get: () => this.jiraConfigGet(),
      jira_config_save: () => this.jiraConfigSave(p as unknown as JiraConfigInput),
      jira_config_clear: () => this.jiraConfigClear(),
      jira_test: () => this.jiraTest(),
      jira_sync: () => this.jiraSync({ full: p.full === true }),
      jira_status: () => this.jiraStatus(),
    };
    const handler = routes[channel];
    if (!handler) throw new Error(`未知命令: ${channel}`);
    return await handler();
  }

  private get db(): Database {
    return this.store.db;
  }

  save(): void {
    const bytes = exportStore(this.store);
    this.saveChain = this.saveChain
      .then(() => this.persist.saveDb(bytes))
      .catch((e) => {
        // 写盘失败不阻塞后续操作，但需在控制台可见
        console.error("[worklog] 保存失败", e);
      });
  }

  // ---------- 任务 ----------
  taskCreate(input: CreateTaskInput): Task {
    const t = taskMod.createTask(this.db, input);
    this.save();
    return t;
  }

  taskUpdate(task: Task): Task {
    const t = taskMod.updateTask(this.db, task);
    this.save();
    return t;
  }

  taskSetStatus(taskId: number, status: string): Task {
    const t = taskMod.setTaskStatus(this.db, taskId, status);
    this.save();
    return t;
  }

  taskDelete(taskId: number, hard: boolean): void {
    taskMod.deleteTask(this.db, taskId, hard);
    this.save();
  }

  taskList(filter: TaskListFilter): TaskWithStats[] {
    return taskMod.listTasks(this.db, filter ?? {});
  }

  taskGet(taskId: number): TaskDetailData {
    return taskMod.getTaskDetail(this.db, taskId);
  }

  // ---------- 工作条目 ----------
  entryCreate(input: entryMod.CreateEntryInput): WorkEntry {
    const e = entryMod.createEntry(this.db, input);
    this.save();
    return e;
  }

  entryUpdate(entryId: number, patch: { entryDate?: string; content?: string; effortHours?: number | null }): WorkEntry {
    const e = entryMod.updateEntry(this.db, entryId, patch);
    this.save();
    return e;
  }

  entryDelete(entryId: number): void {
    entryMod.removeEntry(this.db, entryId);
    this.save();
  }

  // ---------- 视图 ----------
  dayDetail(date: string): DayDetailData {
    const log = daylogMod.getDayLog(this.db, date);
    const meta = workdayMod.dayMeta(this.db, date);
    const notes = noteMod.listNotesCreatedBy(this.db, date);
    const taskCount = log.groups.filter((g) => g.task).length;
    const interruptionCount = log.groups.filter(
      (g) => g.task && (g.task.type === "urgent_insert" || g.task.type === "prod_issue")
    ).length;
    const independentGroup = log.groups.find((g) => g.task === null);
    const total = log.groups
      .flatMap((g) => g.entries)
      .reduce((acc, e) => acc + (e.effortHours ?? 0), 0);
    return {
      date: log.date,
      weekday: meta.weekday,
      isWorkday: meta.isWorkday,
      tag: meta.tag,
      isOffTag: meta.isOffTag,
      plan: log.plan,
      groups: log.groups,
      stats: {
        taskCount,
        interruptionCount,
        independentCount: independentGroup ? independentGroup.entries.length : 0,
        totalHours: total > 0 ? total : null,
        noteCount: notes.length,
      },
      notes,
    };
  }

  weekMatrix(date: string): WeekMatrix {
    return overviewMod.weekMatrix(this.db, date);
  }

  monthOverview(date: string): MonthOverview {
    return overviewMod.monthOverview(this.db, date);
  }

  weeklyReportStats(date: string): WeeklyReportStats {
    return aiMod.buildWeeklyReportStats(this.db, date);
  }

  dayLog(date: string): DayLog {
    return daylogMod.getDayLog(this.db, date);
  }

  noteUpsert(date: string, planText: string): void {
    daylogMod.upsertNote(this.db, date, planText);
    this.save();
  }

  morningData(today: string) {
    const prevDate = workdayMod.previousWorkday(this.db, today);
    const prevGroups = daylogMod.getDayLog(this.db, prevDate).groups;
    const inProgress = taskMod.listTasks(this.db, { status: "in_progress" });
    const todayPlan = daylogMod.getNote(this.db, today);
    return { prevDate, prevGroups, inProgress, todayPlan };
  }

  // ---------- 节假日 ----------
  holidayStatus(): HolidayStatusData {
    return { years: holidayMod.holidayYears(this.db) };
  }

  holidayImport(text: string): ImportReport {
    const r = holidayMod.importHolidays(this.db, text);
    this.save();
    return r;
  }

  // ---------- 数据与备份 ----------
  /** 备份当前整库（宿主负责时间戳命名与 10 份轮转），返回备份路径 */
  async backupNow(): Promise<string> {
    await this.flush();
    return this.persist.backupDb(exportStore(this.store));
  }

  /** 导出 JSON 文本（保存文件由调用方/宿主完成） */
  exportJson(): string {
    return JSON.stringify(this.exportAll(), null, 2);
  }

  importJson(text: string): void {
    this.importAll(text);
    this.save();
  }

  settingsGet(key: string): string | null {
    return settingsMod.getSetting(this.db, key);
  }

  settingsSet(key: string, value: string): void {
    settingsMod.setSetting(this.db, key, value);
    this.save();
  }

  dataInfo(): DataInfo {
    return { dataDir: this.dataDir, dbFile: this.dbFile };
  }

  // ---------- 项目管理 ----------
  projectList(): Project[] {
    return projectMod.listProjects(this.db);
  }

  projectCreate(name: string): Project {
    const p = projectMod.createProject(this.db, name);
    this.save();
    return p;
  }

  projectRename(id: number, name: string): Project {
    const p = projectMod.renameProject(this.db, id, name);
    this.save();
    return p;
  }

  projectDelete(id: number): void {
    projectMod.deleteProject(this.db, id);
    this.save();
  }

  // ---------- 任务类型 ----------
  taskTypesList(): TaskTypeDefinition[] {
    return taskTypeMod.listTaskTypes(this.db);
  }

  taskTypeCreate(input: { label: string; color: string }): TaskTypeDefinition {
    const item = taskTypeMod.createTaskType(this.db, input.label, input.color);
    this.save();
    return item;
  }

  taskTypeUpdate(id: string, input: { label: string; color: string }): TaskTypeDefinition {
    const item = taskTypeMod.updateTaskType(this.db, id, input.label, input.color);
    this.save();
    return item;
  }

  taskTypeDelete(id: string): void {
    taskTypeMod.deleteTaskType(this.db, id);
    this.save();
  }

  // ---------- 新手引导 ----------
  onboardingStatus(): OnboardingStatus {
    const done = this.settingsGet("onboarding_done") === "1";
    let demoLoaded = false;
    const raw = this.settingsGet("demo_task_ids");
    if (raw && raw !== "[]") {
      try {
        const parsed: unknown = JSON.parse(raw);
        demoLoaded = Array.isArray(parsed) && parsed.length > 0;
      } catch {
        demoLoaded = false;
      }
    }
    return { done, demoLoaded };
  }

  // ---------- 演示数据 ----------
  /** 一键写入演示数据（幂等：已有演示任务时不重复写入）；返回写入的任务数 */
  demoSeed(): { tasks: number } {
    const existing = this.settingsGet("demo_task_ids");
    if (existing && existing !== "[]") return { tasks: 0 };
    const day = (offset: number): string => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      const p = (n: number): string => (n < 10 ? `0${n}` : String(n));
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    };
    const ids: number[] = [];
    const projIds: number[] = [];

    // 演示项目：覆盖"多项目并行"的真实场景
    const projA = this.projectCreate("订单系统重构");
    const projB = this.projectCreate("数据平台");
    projIds.push(projA.id, projB.id);

    // 场景 1：排期任务跨三周推进、两度被打断（项目 A，接近完成）
    const t1 = this.taskCreate({
      title: "订单拆单逻辑重构（预估 5 天）",
      type: "planned_dev",
      priority: "medium",
      estimateDays: 5,
      projectId: projA.id,
      windowStart: day(-16),
      windowEnd: day(-2),
    });
    ids.push(t1.id);
    this.entryCreate({ taskId: t1.id, entryDate: day(-16), content: "完成拆单规则梳理与方案设计", effortHours: 4 });
    this.entryCreate({ taskId: t1.id, entryDate: day(-13), content: "核心规则引擎编码\n```sql\nSELECT rule_id, COUNT(*) FROM split_rule GROUP BY rule_id;\n```", effortHours: 6 });
    this.entryCreate({ taskId: t1.id, entryDate: day(-12), content: "被线上问题打断，只推进了单测骨架", effortHours: 2 });
    this.entryCreate({ taskId: t1.id, entryDate: day(-9), content: "拆单主流程编码联调", effortHours: 7 });
    this.entryCreate({ taskId: t1.id, entryDate: day(-8), content: "联调修正边界场景", effortHours: 5 });
    this.entryCreate({ taskId: t1.id, entryDate: day(-4), content: "回归测试与文档补全", effortHours: 6 });
    this.entryCreate({ taskId: t1.id, entryDate: day(-3), content: "预发验证通过，待正式发布", effortHours: 3 });

    // 场景 2：排期任务（项目 B）本周刚开始
    const t2 = this.taskCreate({
      title: "指标口径统一改造（预估 3 天）",
      type: "planned_dev",
      priority: "medium",
      estimateDays: 3,
      projectId: projB.id,
      windowStart: day(-1),
      windowEnd: day(4),
    });
    ids.push(t2.id);
    this.entryCreate({ taskId: t2.id, entryDate: day(-1), content: "梳理现有指标口径，输出差异清单", effortHours: 5 });

    // 场景 3：线上问题前天爆发、昨天解决（默认项目，已完成）
    const t3 = this.taskCreate({ title: "线上支付回调超时告警", type: "prod_issue", priority: "high" });
    ids.push(t3.id);
    this.entryCreate({ taskId: t3.id, entryDate: day(-2), content: "定位到第三方网关抖动，加长超时重试", effortHours: 5 });
    this.entryCreate({ taskId: t3.id, entryDate: day(-1), content: "观察一天无复发，关闭告警\n```sql\nSELECT * FROM pay_callback WHERE rt > 3000 ORDER BY id DESC LIMIT 20;\n```", effortHours: 3 });
    this.taskSetStatus(t3.id, "done");

    // 场景 4：紧急插入开发，两天完成（项目 A，已完成）
    const t4 = this.taskCreate({ title: "紧急：大促按钮样式修复", type: "urgent_insert", priority: "high", projectId: projA.id });
    ids.push(t4.id);
    this.entryCreate({ taskId: t4.id, entryDate: day(-2), content: "修复样式并提测", effortHours: 4 });
    this.entryCreate({ taskId: t4.id, entryDate: day(-1), content: "上线验证通过", effortHours: 2 });
    this.taskSetStatus(t4.id, "done");

    // 场景 5：调查排查进行中（默认项目，今天的浅色块）
    const t5 = this.taskCreate({ title: "日常巡检：库存慢查询", type: "daily_ops", priority: "high" });
    ids.push(t5.id);
    this.entryCreate({ taskId: t5.id, entryDate: day(-10), content: "收集慢日志，锁定库存流水表", effortHours: 3 });
    this.entryCreate({ taskId: t5.id, entryDate: day(-9), content: "分析执行计划，疑似缺少联合索引", effortHours: 2 });
    this.entryCreate({ taskId: t5.id, entryDate: day(0), content: "在影子库验证新索引效果", effortHours: 1 });

    // 场景 6：等待外部依赖而搁置（项目 B）
    const t6 = this.taskCreate({ title: "数据血缘可视化", type: "planned_dev", priority: "low", projectId: projB.id });
    ids.push(t6.id);
    this.entryCreate({ taskId: t6.id, entryDate: day(-6), content: "初版技术调研：对比两个图库方案", effortHours: 2 });
    this.taskSetStatus(t6.id, "on_hold");

    // 场景 7：未来排期（默认项目，待开始，显示时间窗）
    const t7 = this.taskCreate({
      title: "报表导出功能",
      type: "planned_dev",
      priority: "low",
      estimateDays: 2,
      windowStart: day(2),
      windowEnd: day(8),
    });
    ids.push(t7.id);

    // 独立记录：不挂任务的事项
    this.entryCreate({ taskId: null, entryDate: day(-5), content: "参加架构评审会，评审订单服务拆分方案", effortHours: 2 });
    this.entryCreate({ taskId: null, entryDate: day(-2), content: "帮同事排查测试环境数据库连接问题", effortHours: null });

    this.noteUpsert(
      day(0),
      "1. 继续库存慢查询验证，视结果上索引\n2. 推进指标口径改造\n3. 跟进订单拆单重构发布"
    );
    // 示例笔记：调查结论类轻笔记
    const note1 = this.noteCreate({
      content:
        "库存流水表慢查询结论：\n- 缺 (warehouse_id, created_at) 联合索引\n- 影子库验证后 QPS 提升 6 倍\n```sql\nCREATE INDEX idx_flow_wh_time ON stock_flow(warehouse_id, created_at);\n```",
      tags: ["SQL", "调查"],
    });
    const note2 = this.noteCreate({
      content: "订单服务发布清单：提单 → 预发 → 灰度 → 全量；灰度期间重点盯支付回调成功率与告警群。",
      tags: ["清单", "发布"],
    });
    // 示例周报：AI 周报对话框的历史里可直接看到效果
    const monday = weekMonday(day(0));
    const sampleReport = reportMod.saveReport(this.db, {
      type: "weekly",
      rangeStart: monday,
      rangeEnd: addDaysStr(monday, 6),
      model: "mock",
      content: aiMod.MOCK_WEEKLY_REPORT,
      summaryContent: aiMod.MOCK_WEEKLY_SUMMARY,
    });
    const entryIds = ids.length
      ? q<{ id: number }>(
          this.db,
          `SELECT id FROM work_entry WHERE task_id IN (${ids.map(() => "?").join(",")})`,
          ids
        ).map((r) => Number(r.id))
      : [];
    const independentEntryIds = q<{ id: number }>(
      this.db,
      "SELECT id FROM work_entry WHERE task_id IS NULL AND content IN (?, ?)",
      ["参加架构评审会，评审订单服务拆分方案", "帮同事排查测试环境数据库连接问题"]
    ).map((r) => Number(r.id));
    demoMod.writeDemoSets(this.db, {
      taskIds: ids,
      entryIds: [...entryIds, ...independentEntryIds],
      projectIds: projIds,
      reportIds: [sampleReport.id],
      noteIds: [note1.id, note2.id],
      planDates: [day(0)],
    });
    return { tasks: ids.length };
  }

  /** 清除演示数据：硬删除演示任务与演示项目（不影响用户新建的数据）；返回删除的任务数 */
  demoClear(): number {
    const sets = demoMod.readDemoSets(this.db);
    if (!sets.taskIds.length && !sets.entryIds.length && !sets.planDates.length) return 0;

    let n = 0;
    for (const id of sets.entryIds) {
      try {
        entryMod.removeEntry(this.db, id);
      } catch {
        /* 已删除则跳过 */
      }
    }
    if (sets.taskIds.length) {
      run(
        this.db,
        `DELETE FROM work_entry WHERE task_id IN (${sets.taskIds.map(() => "?").join(",")})`,
        sets.taskIds
      );
    }
    for (const id of sets.taskIds) {
      try {
        taskMod.deleteTask(this.db, id, true);
        n++;
      } catch {
        /* 已被用户自行删除则跳过 */
      }
    }
    for (const pid of sets.projectIds) {
      try {
        projectMod.deleteProject(this.db, pid);
      } catch {
        /* 已删除则跳过 */
      }
    }
    for (const rid of sets.reportIds) {
      try {
        reportMod.deleteReport(this.db, rid);
      } catch {
        /* 已删除则跳过 */
      }
    }
    for (const nid of sets.noteIds) {
      try {
        noteMod.deleteNote(this.db, nid);
      } catch {
        /* 已删除则跳过 */
      }
    }
    for (const date of sets.planDates) {
      run(this.db, "DELETE FROM daily_note WHERE date = ?", [date]);
    }
    demoMod.writeDemoSets(this.db, {
      taskIds: [],
      entryIds: [],
      projectIds: [],
      reportIds: [],
      noteIds: [],
      planDates: [],
    });
    this.save();
    return n;
  }

  // ---------- AI ----------
  private readAiFile(): aiMod.AiFileConfig | null {
    return this.aiFileCache;
  }

  private aiSettingsGetter = (key: string): string | null => this.settingsGet(key);

  aiGetConfig(): AiConfig {
    return aiMod.resolveAiConfig(this.aiSettingsGetter, this.readAiFile());
  }

  aiSaveConfig(input: { baseUrl: string; apiKey: string; model: string }): void {
    this.settingsSet("ai_base_url", input.baseUrl.trim());
    this.settingsSet("ai_api_key", input.apiKey.trim());
    this.settingsSet("ai_model", input.model.trim());
  }

  private async aiChat(cfg: AiConfig, userContent: string, timeoutMs: number, maxTokens?: number): Promise<string> {
    if (!cfg.baseUrl.trim() || !cfg.model.trim()) {
      throw new Error("尚未配置 AI 接口：请在 设置 → AI 接入 填写接口地址与模型名");
    }
    return aiMod.chatCompletion(
      { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model },
      [{ role: "user", content: userContent }],
      { timeoutMs, maxTokens, fetchImpl: this.fetchImpl }
    );
  }

  async aiTestConnection(cfg: { baseUrl: string; apiKey: string; model: string }): Promise<AiTestResult> {
    if (!cfg.baseUrl.trim() || !cfg.model.trim()) {
      return { ok: false, error: "请先填写接口地址与模型名" };
    }
    if (this.settingsGet("ai_mock") === "1") {
      return { ok: true, reply: "正常（mock 测试模式）" };
    }
    try {
      const reply = await aiMod.chatCompletion(
        { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model },
        [{ role: "user", content: "连接测试，只回复两个字：正常" }],
        { timeoutMs: 20000, maxTokens: 16, temperature: 0, fetchImpl: this.fetchImpl }
      );
      return { ok: true, reply: reply.trim().slice(0, 50) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async aiWeeklyReport(date: string): Promise<WeeklyReportResult> {
    const data = aiMod.buildWeeklyReportData(this.db, date);
    let content: string;
    let summaryContent: string;
    let model: string;
    if (this.settingsGet("ai_mock") === "1") {
      content = aiMod.MOCK_WEEKLY_REPORT;
      summaryContent = aiMod.MOCK_WEEKLY_SUMMARY;
      model = "mock";
    } else {
      const cfg = this.aiGetConfig();
      const template = aiMod.resolveAiConfig(this.aiSettingsGetter, this.readAiFile()).promptTemplate
        ?? aiMod.DEFAULT_WEEKLY_TEMPLATE;
      const prompt = aiMod.buildWeeklyPrompt(template, data.start, data.end, data.workdays, data.dataText);
      content = await this.aiChat(cfg, prompt, 90000);
      const summaryPrompt = aiMod.buildWeeklySummaryPrompt(
        aiMod.DEFAULT_WEEKLY_SUMMARY_TEMPLATE,
        content
      );
      summaryContent = await this.aiChat(cfg, summaryPrompt, 60000, 300).catch(() =>
        content.replace(/[#*`>-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120)
      );
      model = cfg.model;
    }
    const saved = reportMod.saveReport(this.db, {
      type: "weekly",
      rangeStart: data.start,
      rangeEnd: data.end,
      model,
      content,
      summaryContent,
    });
    this.save();
    return {
      id: saved.id,
      rangeStart: saved.rangeStart,
      rangeEnd: saved.rangeEnd,
      model,
      content,
      summaryContent,
    };
  }

  aiReportList(): Report[] {
    const demoReportIds = new Set(demoMod.readDemoSets(this.db).reportIds);
    return reportMod
      .listReports(this.db, "weekly", 12)
      .filter((report) => !demoReportIds.has(report.id));
  }

  aiReportSave(id: number, content: string, summaryContent: string): Report {
    if (!content.trim()) throw new Error("周报内容不能为空");
    const r = reportMod.updateReportContent(this.db, id, content, summaryContent);
    this.save();
    return r;
  }

  aiReportDelete(id: number): void {
    if (!reportMod.getReport(this.db, id)) throw new Error("周报不存在");
    reportMod.deleteReport(this.db, id);
    this.save();
  }

  // ---------- 笔记 ----------
  noteList(filter: NoteFilter): Note[] {
    return noteMod.listNotes(this.db, filter ?? {});
  }

  noteCreate(input: NoteInput): Note {
    const n = noteMod.createNote(this.db, input);
    this.save();
    return n;
  }

  noteUpdate(id: number, input: NoteInput): Note {
    const n = noteMod.updateNote(this.db, id, input);
    this.save();
    return n;
  }

  noteDelete(id: number): void {
    noteMod.deleteNote(this.db, id);
    this.save();
  }

  noteTogglePin(id: number): Note {
    const n = noteMod.toggleNotePin(this.db, id);
    this.save();
    return n;
  }

  // ---------- 待办箱 ----------
  todoList(): Todo[] {
    return todoMod.listTodos(this.db);
  }

  todoCreate(content: string): Todo {
    const todo = todoMod.createTodo(this.db, content);
    this.save();
    return todo;
  }

  todoUpdate(id: number, input: TodoUpdateInput): Todo {
    const todo = todoMod.updateTodo(this.db, id, input);
    this.save();
    return todo;
  }

  todoToggle(id: number): Todo {
    const todo = todoMod.toggleTodo(this.db, id);
    this.save();
    return todo;
  }

  todoDelete(id: number): void {
    todoMod.deleteTodo(this.db, id);
    this.save();
  }

  todoDeleteMany(ids: number[]): number {
    const count = todoMod.deleteTodos(this.db, ids);
    this.save();
    return count;
  }

  todoConvert(input: TodoConvertInput): Task {
    const ids = [...new Set(input.ids.map(Number).filter(Number.isFinite))];
    if (!ids.length) throw new Error("请先选择待办");
    const todos = ids.map((id) => todoMod.getTodo(this.db, id));
    if (todos.some((todo) => todo === null)) throw new Error("部分待办已不存在，请刷新后重试");
    const task = taskMod.createTask(this.db, {
      title: input.title,
      description: todoMod.appendTodosToDescription("", todos as Todo[]),
      type: "planned_dev",
      priority: "medium",
    });
    todoMod.linkTodosToTask(this.db, ids, task.id);
    this.save();
    return task;
  }

  todoAttachToTask(input: TodoAttachInput): Task {
    const ids = [...new Set(input.ids.map(Number).filter(Number.isFinite))];
    if (!ids.length) throw new Error("请先选择待办");
    const todos = ids.map((id) => todoMod.getTodo(this.db, id));
    if (todos.some((todo) => todo === null)) throw new Error("部分待办已不存在，请刷新后重试");
    const current = taskMod.getTaskDetail(this.db, Number(input.taskId)).task;
    const updated = taskMod.updateTask(this.db, {
      ...current,
      description: todoMod.appendTodosToDescription(current.description, todos as Todo[]),
    });
    todoMod.linkTodosToTask(this.db, ids, updated.id);
    this.save();
    return updated;
  }

  // ---------- Jira 只读同步（Issue #25） ----------
  private requireJiraTransport(): jiraSyncMod.JiraTransport {
    if (!this.jiraTransport) throw new Error("Jira 同步通道未初始化");
    return this.jiraTransport;
  }

  async jiraConfigGet(): Promise<JiraConfigView> {
    return this.requireJiraTransport().getConfig();
  }

  async jiraConfigSave(input: JiraConfigInput): Promise<JiraConfigView> {
    return this.requireJiraTransport().saveConfig(input);
  }

  async jiraConfigClear(): Promise<void> {
    await this.requireJiraTransport().clearConfig();
    // 只清同步状态，不删除已导入的任务与本地记录
    run(this.db, "DELETE FROM setting WHERE key IN ('jira_last_sync','jira_last_result')");
    this.save();
  }

  async jiraTest(): Promise<jiraSyncMod.JiraTestResult> {
    return jiraSyncMod.testConnection(this.requireJiraTransport());
  }

  jiraStatus(): jiraSyncMod.JiraSyncStatus {
    const lastSync = this.settingsGet("jira_last_sync");
    const raw = this.settingsGet("jira_last_result");
    let lastResult: jiraSyncMod.JiraSyncResult | null = null;
    if (raw) {
      try {
        lastResult = JSON.parse(raw) as jiraSyncMod.JiraSyncResult;
      } catch {
        lastResult = null;
      }
    }
    return { lastSync, lastResult };
  }

  /** 手动/自动同步共用入口；并发调用复用同一个进行中的任务 */
  async jiraSync(opts: { full?: boolean } = {}): Promise<jiraSyncMod.JiraSyncResult> {
    if (this.jiraSyncInFlight) return this.jiraSyncInFlight;
    this.jiraSyncInFlight = this.runJiraSync(opts).finally(() => {
      this.jiraSyncInFlight = null;
    });
    return this.jiraSyncInFlight;
  }

  private async runJiraSync(opts: { full?: boolean }): Promise<jiraSyncMod.JiraSyncResult> {
    const transport = this.requireJiraTransport();
    const at = nowStr();
    const lastSync = this.settingsGet("jira_last_sync");
    const full = opts.full === true || !lastSync;
    try {
      const cfg = await transport.getConfig();
      if (!cfg.baseUrl) throw new Error("尚未配置 Jira 地址");
      if (!cfg.hasToken) throw new Error("尚未配置 Jira Token");

      const since = full ? null : jiraSyncMod.sinceFromLast(lastSync, 5);
      const { issues, warnings } = await jiraSyncMod.fetchIssues(transport, cfg, { since });
      const mapped = issues
        .map((issue) => jiraSyncMod.mapIssue(issue, cfg.baseUrl))
        .filter((m) => m.externalId !== "");
      const applied = jiraSyncMod.applyJiraSync(this.db, mapped, { full });

      const result: jiraSyncMod.JiraSyncResult = {
        ok: true,
        at,
        full,
        fetched: mapped.length,
        ...applied,
        warnings,
      };
      settingsMod.setSetting(this.db, "jira_last_sync", at);
      settingsMod.setSetting(this.db, "jira_last_result", JSON.stringify(result));
      this.save();
      return result;
    } catch (e) {
      const result: jiraSyncMod.JiraSyncResult = {
        ok: false,
        at,
        full,
        fetched: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        missing: 0,
        warnings: [],
        error: jiraSyncMod.errText(e),
      };
      settingsMod.setSetting(this.db, "jira_last_result", JSON.stringify(result));
      this.save();
      throw e;
    }
  }

  // ---------- 导出/导入 ----------
  private exportAll(): unknown {
    return {
      version: 1,
      exportedAt: nowStr(),
      tasks: q(this.db, "SELECT * FROM task ORDER BY id"),
      projects: q(this.db, "SELECT * FROM project ORDER BY id"),
      entries: q(this.db, "SELECT * FROM work_entry ORDER BY id"),
      notes: q(this.db, "SELECT * FROM daily_note ORDER BY date"),
      todos: q(this.db, "SELECT * FROM todo ORDER BY id"),
      holidays: q(this.db, "SELECT * FROM holiday ORDER BY date"),
      settings: q(this.db, "SELECT * FROM setting"),
    };
  }

  private importAll(text: string): void {
    let data: {
      tasks?: unknown[];
      projects?: unknown[];
      entries?: unknown[];
      notes?: unknown[];
      todos?: unknown[];
      holidays?: unknown[];
      settings?: unknown[];
    };
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("不是合法的 JSON 文件");
    }
    if (!Array.isArray(data.tasks) || !Array.isArray(data.entries)) {
      throw new Error("备份文件缺少 tasks/entries 数组");
    }
    const tasks = data.tasks;
    const entries = data.entries;
    inTxn(this.db, () => {
      run(this.db, "DELETE FROM work_entry");
      run(this.db, "DELETE FROM task");
      run(this.db, "DELETE FROM daily_note");
      run(this.db, "DELETE FROM todo");
      run(this.db, "DELETE FROM setting");
      // 项目：保留默认项目，导入文件中的项目按 id 覆盖；旧备份无 projects 时不影响
      for (const p of data.projects ?? []) {
        const r = p as Record<string, unknown>;
        run(
          this.db,
          "INSERT OR REPLACE INTO project (id, name, sort, created_at) VALUES (?,?,?,?)",
          [r.id, r.name, r.sort ?? 0, r.created_at ?? nowStr()]
        );
      }
      const projectIds = new Set(
        q<{ id: number }>(this.db, "SELECT id FROM project").map((r) => Number(r.id))
      );
      for (const t of tasks) {
        const r = t as Record<string, unknown>;
        const wantedProject = Number(r.project_id ?? DEFAULT_PROJECT_ID);
        const projectId = projectIds.has(wantedProject) ? wantedProject : DEFAULT_PROJECT_ID;
        run(
          this.db,
          `INSERT INTO task (
             id, title, description, type, priority, status, estimate_days, window_start, window_end,
             project_id, created_at, updated_at, completed_at,
             external_source, external_id, external_url, external_parent_key, external_parent_summary,
             external_status, external_updated, external_synced_at, external_missing
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            r.id,
            r.title,
            r.description ?? "",
            r.type,
            r.priority,
            r.status,
            r.estimate_days ?? null,
            r.window_start ?? null,
            r.window_end ?? null,
            projectId,
            r.created_at,
            r.updated_at,
            r.completed_at ?? null,
            r.external_source ?? null,
            r.external_id ?? null,
            r.external_url ?? null,
            r.external_parent_key ?? null,
            r.external_parent_summary ?? null,
            r.external_status ?? null,
            r.external_updated ?? null,
            r.external_synced_at ?? null,
            r.external_missing ?? 0,
          ]
        );
      }
      for (const e of entries) {
        const r = e as Record<string, unknown>;
        run(
          this.db,
          `INSERT INTO work_entry (id, task_id, entry_date, content, effort_hours, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?)`,
          [r.id, r.task_id ?? null, r.entry_date, r.content, r.effort_hours ?? null, r.created_at, r.updated_at]
        );
      }
      for (const n of data.notes ?? []) {
        const r = n as Record<string, unknown>;
        run(this.db, "INSERT INTO daily_note (date, plan_text, created_at, updated_at) VALUES (?,?,?,?)", [
          r.date,
          r.plan_text ?? "",
          r.created_at,
          r.updated_at,
        ]);
      }
      for (const t of data.todos ?? []) {
        const r = t as Record<string, unknown>;
        run(
          this.db,
          `INSERT INTO todo (id, content, detail, status, linked_task_id, linked_at, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?)`,
          [
            r.id,
            r.content,
            r.detail ?? "",
            r.status ?? "open",
            r.linked_task_id ?? null,
            r.linked_at ?? null,
            r.created_at,
            r.updated_at,
          ]
        );
      }
      for (const s of data.settings ?? []) {
        const r = s as Record<string, unknown>;
        run(this.db, "INSERT INTO setting (key, value) VALUES (?,?)", [r.key, r.value]);
      }
      run(this.db, "DELETE FROM holiday");
      for (const h of data.holidays ?? []) {
        const r = h as Record<string, unknown>;
        run(this.db, "INSERT INTO holiday (date, name, is_workday) VALUES (?,?,?)", [
          r.date,
          r.name,
          r.is_workday,
        ]);
      }
    });
  }
}

/** 解析 ai.json（覆盖配置）：非法内容返回 null */
function parseAiFile(raw: string | null): aiMod.AiFileConfig | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as aiMod.AiFileConfig;
    return null;
  } catch {
    return null;
  }
}
