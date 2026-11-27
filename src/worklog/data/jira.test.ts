import { describe, expect, it } from "vitest";
import { freshDb } from "./test-util";
import { getSetting } from "./settings";
import { getTask } from "./models";
import { addDaysStr, monthFirst, todayStr } from "./dates";
import { weekMatrix, monthOverview } from "./overview";
import { createTask } from "./task";
import {
  DEFAULT_JIRA_JQL,
  getJiraConfigView,
  getJiraSyncStatus,
  mapJiraIssue,
  normalizeJiraConfig,
  saveJiraConfig,
  syncJiraTasks,
} from "./jira";
import type { JiraConfigInput } from "../types";

interface JiraIssue {
  key: string;
  fields: Record<string, unknown>;
}

function jiraIssue(
  key: string,
  opts: {
    summary?: string;
    statusCategory?: string;
    due?: string | null;
    estimateSeconds?: number | null;
    priority?: string;
    type?: string;
    parent?: { key: string; summary: string } | null;
    updated?: string;
    description?: unknown;
    project?: string;
  } = {}
): JiraIssue {
  return {
    key,
    fields: {
      summary: opts.summary ?? `${key} 摘要`,
      description: opts.description ?? "",
      status: { statusCategory: { key: opts.statusCategory ?? "new" } },
      duedate: opts.due ?? null,
      timeoriginalestimate: opts.estimateSeconds ?? null,
      priority: { name: opts.priority ?? "Medium" },
      project: { key: "PROJ", name: opts.project ?? "订单系统" },
      issuetype: { name: opts.type ?? "Sub-task" },
      parent: opts.parent ? { key: opts.parent.key, fields: { summary: opts.parent.summary } } : undefined,
      updated: opts.updated ?? "2026-11-27T10:00:00.000+0800",
    },
  };
}

function fakeV2Fetch(issues: JiraIssue[]): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ startAt: 0, total: issues.length, issues }), { status: 200 })) as unknown as typeof fetch;
}

function fakeFailingFetch(): typeof fetch {
  return (async () => new Response(JSON.stringify({ errorMessages: ["Internal server error"] }), { status: 500 })) as unknown as typeof fetch;
}

function saveTestConfig(db: Awaited<ReturnType<typeof freshDb>>, overrides: Partial<JiraConfigInput> = {}): void {
  saveJiraConfig(db, {
    baseUrl: "https://jira.example.com",
    authType: "pat",
    email: "",
    token: "test-token",
    jql: "assignee = currentUser()",
    intervalMinutes: 15,
    enabled: true,
    ...overrides,
  });
}

describe("Jira 配置", () => {
  it("normalizeJiraConfig：去尾斜杠、默认 JQL、间隔钳制、非法地址报错", () => {
    const cfg = normalizeJiraConfig({ baseUrl: "https://jira.example.com/", authType: "pat", email: "", token: "", jql: "", intervalMinutes: 15, enabled: true });
    expect(cfg.baseUrl).toBe("https://jira.example.com");
    expect(cfg.jql).toBe(DEFAULT_JIRA_JQL);
    expect(cfg.enabled).toBe(true);
    expect(normalizeJiraConfig({ baseUrl: "https://a.com", intervalMinutes: 1 }).intervalMinutes).toBe(5);
    expect(normalizeJiraConfig({ baseUrl: "https://a.com", intervalMinutes: 5000 }).intervalMinutes).toBe(1440);
    expect(() => normalizeJiraConfig({ baseUrl: "ftp://bad", authType: "pat" })).toThrow(/http\(s\)/);
    expect(() => normalizeJiraConfig({ baseUrl: "" })).toThrow(/http\(s\)/);
  });

  it("配置与 token 分开存放；token 留空保持旧值；未配置时返回默认模板", async () => {
    const db = await freshDb();
    const empty = getJiraConfigView(db);
    expect(empty.config.baseUrl).toBe("");
    expect(empty.hasToken).toBe(false);

    saveTestConfig(db);
    const view = getJiraConfigView(db);
    expect(view.config.baseUrl).toBe("https://jira.example.com");
    expect(view.hasToken).toBe(true);
    // token 不出现在配置 JSON 中
    expect(getSetting(db, "jira_config") ?? "").not.toContain("test-token");
    expect(getSetting(db, "jira_token")).toBe("test-token");

    saveJiraConfig(db, {
      baseUrl: "https://jira.example.com",
      authType: "basic",
      email: "me@example.com",
      token: "",
      jql: "project = X",
      intervalMinutes: 30,
      enabled: false,
    });
    const updated = getJiraConfigView(db);
    expect(updated.config.authType).toBe("basic");
    expect(updated.config.jql).toBe("project = X");
    expect(updated.config.enabled).toBe(false);
    expect(getSetting(db, "jira_token")).toBe("test-token");
  });
});

describe("Jira 字段映射", () => {
  const cfg = normalizeJiraConfig({ baseUrl: "https://jira.example.com", authType: "pat" });

  it("Server/DC 风格 issue：标题/状态/优先级/日期/估时/项目/父任务/链接", () => {
    const m = mapJiraIssue(
      jiraIssue("PROJ-12", {
        summary: "实现拆单规则引擎",
        statusCategory: "indeterminate",
        due: "2026-12-01",
        estimateSeconds: 12 * 3600,
        priority: "Highest",
        parent: { key: "STORY-7", summary: "订单重构" },
        updated: "2026-11-27T09:00:00.000+0800",
      }),
      cfg
    )!;
    expect(m).toMatchObject({
      externalId: "PROJ-12",
      title: "实现拆单规则引擎",
      status: "in_progress",
      estimateDays: 1.5,
      windowStart: "2026-12-01",
      windowEnd: "2026-12-01",
      priority: "high",
      projectName: "订单系统",
      externalUrl: "https://jira.example.com/browse/PROJ-12",
      parentKey: "STORY-7",
      parentSummary: "订单重构",
      externalUpdated: "2026-11-27T09:00:00.000+0800",
    });
  });

  it("Cloud ADF 描述抽取纯文本；状态未知映射为 null；估时缺失为 null", () => {
    const adf = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "第一段说明" }] },
        { type: "paragraph", content: [{ type: "text", text: "第二行" }] },
      ],
    };
    const m = mapJiraIssue(jiraIssue("PROJ-13", { description: adf, statusCategory: "custom-x" }), cfg)!;
    expect(m.description).toContain("第一段说明");
    expect(m.description).toContain("第二行");
    expect(m.status).toBeNull();
    expect(m.estimateDays).toBeNull();
    expect(m.priority).toBe("medium");
  });

  it("优先级与类型映射：Bug → prod_issue，Sub-task → planned_dev，低/最高", () => {
    const bug = mapJiraIssue(jiraIssue("P-1", { type: "Bug", priority: "Low" }), cfg)!;
    const low = mapJiraIssue(jiraIssue("P-2", { priority: "最低" }), cfg)!;
    const high = mapJiraIssue(jiraIssue("P-3", { priority: "紧急" }), cfg)!;
    expect(bug.jiraType).toBe("Bug");
    expect(low.priority).toBe("low");
    expect(high.priority).toBe("high");
  });

  it("缺少 key 的 issue 返回 null", () => {
    expect(mapJiraIssue({ key: "", fields: {} }, cfg)).toBeNull();
  });
});

describe("Jira 同步（幂等 upsert / 消失标记）", () => {
  it("首次全量创建 → 重复同步零变更 → 更新 → 消失标记 → 恢复", async () => {
    const db = await freshDb();
    saveTestConfig(db);
    const today = todayStr();

    const issueA = () =>
      jiraIssue("PROJ-1", { summary: "子任务 A", statusCategory: "new", due: today, updated: "2026-11-27T08:00:00.000+0800" });
    const issueB = () =>
      jiraIssue("PROJ-2", { summary: "子任务 B", statusCategory: "indeterminate", type: "Bug", updated: "2026-11-27T08:00:00.000+0800" });
    const issueC = () =>
      jiraIssue("PROJ-3", { summary: "子任务 C", statusCategory: "done", updated: "2026-11-27T08:00:00.000+0800" });

    // 1. 首次全量
    let r = await syncJiraTasks(db, fakeV2Fetch([issueA(), issueB(), issueC()]));
    expect(r).toEqual({ created: 3, updated: 0, markedMissing: 0, totalIssues: 3 });
    const a = getTask(db, idOfExternal(db, "PROJ-1"))!;
    expect(a.externalSource).toBe("jira");
    expect(a.externalId).toBe("PROJ-1");
    expect(a.status).toBe("todo");
    expect(a.windowStart).toBe(today);
    const b = getTask(db, idOfExternal(db, "PROJ-2"))!;
    expect(b.type).toBe("prod_issue");
    expect(b.status).toBe("in_progress");
    const c = getTask(db, idOfExternal(db, "PROJ-3"))!;
    expect(c.status).toBe("done");
    expect(c.completedAt).not.toBeNull();
    // Jira 项目自动创建
    expect(getJiraSyncStatus(db).lastResult).toBe("ok");
    expect(getJiraSyncStatus(db).lastCount).toBe(3);

    // 2. 重复同步：零新建零更新（幂等）
    r = await syncJiraTasks(db, fakeV2Fetch([issueA(), issueB(), issueC()]));
    expect(r.created).toBe(0);
    expect(r.updated).toBe(0);
    expect(r.markedMissing).toBe(0);

    // 3. A 变更 → 更新 1 条
    r = await syncJiraTasks(db, fakeV2Fetch([
      jiraIssue("PROJ-1", { summary: "子任务 A（改名）", statusCategory: "done", due: today, updated: "2026-11-27T09:30:00.000+0800" }),
      issueB(),
      issueC(),
    ]));
    expect(r.updated).toBe(1);
    const a2 = getTask(db, idOfExternal(db, "PROJ-1"))!;
    expect(a2.title).toBe("子任务 A（改名）");
    expect(a2.status).toBe("done");

    // 4. B/C 从结果消失 → 标记源缺失，但数据保留
    r = await syncJiraTasks(db, fakeV2Fetch([issueA()]));
    expect(r.markedMissing).toBe(2);
    const b2 = getTask(db, idOfExternal(db, "PROJ-2"))!;
    expect(b2.title).toBe("子任务 B"); // 数据保留
    expect(b2.externalMissing).toBe(true);

    // 5. B 重新出现 → 消失标记清除
    r = await syncJiraTasks(db, fakeV2Fetch([issueA(), issueB()]));
    expect(r.markedMissing).toBe(0);
    expect(getTask(db, idOfExternal(db, "PROJ-2"))!.externalMissing).toBe(false);
    // C 仍缺失
    expect(getTask(db, idOfExternal(db, "PROJ-3"))!.externalMissing).toBe(true);
  });

  it("同步失败：抛错、状态记录失败原因、旧数据保留", async () => {
    const db = await freshDb();
    saveTestConfig(db);
    await syncJiraTasks(db, fakeV2Fetch([jiraIssue("PROJ-1", { summary: "原有任务" })]));
    await expect(syncJiraTasks(db, fakeFailingFetch())).rejects.toThrow(/HTTP 500/);
    const st = getJiraSyncStatus(db);
    expect(st.lastResult).toBe("error");
    expect(st.lastError).toContain("HTTP 500");
    // 数据保留
    expect(idOfExternal(db, "PROJ-1")).toBeGreaterThan(0);
  });

  it("错误信息脱敏：token 不出现在异常与状态里", async () => {
    const db = await freshDb();
    saveTestConfig(db, { token: "super-secret-token" });
    await expect(syncJiraTasks(db, fakeFailingFetch())).rejects.not.toThrow(/super-secret-token/);
    expect(getJiraSyncStatus(db).lastError ?? "").not.toContain("super-secret-token");
  });

  it("未配置时同步给出可读错误", async () => {
    const db = await freshDb();
    await expect(syncJiraTasks(db, fakeV2Fetch([]))).rejects.toThrow(/尚未配置 Jira/);
    saveTestConfig(db, { token: "" });
    await expect(syncJiraTasks(db, fakeV2Fetch([]))).rejects.toThrow(/Token/);
  });
});

describe("外部任务在周/月视图的呈现", () => {
  // today-10 恒在本周之前（周一最早为 today-6），today-20 恒在逾期窗口（today-14）之外 —— 断言与星期无关
  it("周视图：本周到期/近两周逾期必收；远期旧窗口与本地逾期不收", async () => {
    const db = await freshDb();
    saveTestConfig(db);
    const today = todayStr();

    await syncJiraTasks(db, fakeV2Fetch([
      jiraIssue("PROJ-1", { summary: "本周到期", statusCategory: "new", due: today }), // 规则 2：时间窗与本周有交集
      jiraIssue("PROJ-2", { summary: "近期逾期", statusCategory: "indeterminate", due: addDaysStr(today, -10) }), // 规则 5：外部逾期
      jiraIssue("PROJ-3", { summary: "很久前的窗口", statusCategory: "new", due: addDaysStr(today, -20) }), // 超出逾期窗口，不收
    ]));
    // 同样的逾期窗口，本地任务不因规则 5 收录（仅外部源）
    createTask(db, {
      title: "本地逾期任务",
      type: "planned_dev",
      priority: "medium",
      windowStart: addDaysStr(today, -10),
      windowEnd: addDaysStr(today, -10),
    });

    const wm = weekMatrix(db, today);
    const titles = wm.rows.map((r) => r.task.title);
    expect(titles).toContain("本周到期");
    expect(titles).toContain("近期逾期");
    expect(titles).not.toContain("很久前的窗口");
    expect(titles).not.toContain("本地逾期任务");
  });

  it("月视图：外部任务按 duedate 出计划条（尚无记录），过期标红", async () => {
    const db = await freshDb();
    saveTestConfig(db);
    const today = todayStr();

    await syncJiraTasks(db, fakeV2Fetch([
      jiraIssue("PROJ-1", { summary: "今日到期计划", statusCategory: "new", due: today }), // 当月、未过期
      jiraIssue("PROJ-2", { summary: "本月已到期", statusCategory: "indeterminate", due: addDaysStr(today, -1) }),
    ]));

    const mo = monthOverview(db, today);
    const dayForDue = mo.monthDays.find((d) => d.date === today);
    const plannedChip = dayForDue?.chips.find((c) => c.taskId === idOfExternal(db, "PROJ-1"));
    expect(plannedChip).toBeDefined();
    expect(plannedChip?.planned).toBe(true);
    expect(plannedChip?.overdue).toBe(false);

    const pastDue = addDaysStr(today, -1);
    if (pastDue >= monthFirst(today)) {
      const dayForPast = mo.monthDays.find((d) => d.date === pastDue);
      const pastChip = dayForPast?.chips.find((c) => c.taskId === idOfExternal(db, "PROJ-2"));
      expect(pastChip?.planned).toBe(true);
      expect(pastChip?.overdue).toBe(true);
    }
  });
});

function idOfExternal(db: Awaited<ReturnType<typeof freshDb>>, externalId: string): number {
  const rows = db.exec(`SELECT id FROM task WHERE external_id = '${externalId.replace(/'/g, "''")}'`);
  return Number(rows[0]?.values[0]?.[0] ?? 0);
}
