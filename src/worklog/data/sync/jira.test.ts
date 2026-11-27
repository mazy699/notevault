import { describe, expect, it } from "vitest";
import type { JiraConfigView } from "../../../../shared/types";
import {
  adfToText,
  estimateDays,
  fetchIssues,
  mapIssue,
  mapPriority,
  mapStatus,
  sinceFromLast,
  testConnection,
  withUpdated,
} from "./jira";
import type { JiraIssue, JiraTransport } from "./types";

const BASE = "https://jira.example.com";

function cfg(over: Partial<JiraConfigView> = {}): JiraConfigView {
  return {
    baseUrl: BASE,
    authType: "pat",
    email: "",
    jql: "assignee = currentUser() AND issuetype in (Sub-task, Bug) ORDER BY updated ASC",
    includeStorySubtasks: false,
    intervalMinutes: 15,
    enabled: true,
    hasToken: true,
    tokenHint: "abcd",
    ...over,
  };
}

function issue(key: string, fields: JiraIssue["fields"] = {}): JiraIssue {
  return { key, fields };
}

function mockTransport(handler: (path: string) => { status: number; body: string }): JiraTransport {
  return {
    getConfig: async () => cfg(),
    saveConfig: async () => cfg(),
    clearConfig: async () => undefined,
    request: async (req) => handler(req.path),
  };
}

describe("Jira 字段映射", () => {
  it("状态按 statusCategory 映射，阻塞类状态归为搁置", () => {
    expect(mapStatus("new", "To Do")).toBe("todo");
    expect(mapStatus("indeterminate", "In Progress")).toBe("in_progress");
    expect(mapStatus("done", "Done")).toBe("done");
    expect(mapStatus("indeterminate", "Blocked")).toBe("on_hold");
    expect(mapStatus(undefined, "等待外部依赖")).toBe("on_hold");
    expect(mapStatus(undefined, undefined)).toBe("todo");
  });

  it("优先级映射高中低", () => {
    expect(mapPriority("Highest")).toBe("high");
    expect(mapPriority("High")).toBe("high");
    expect(mapPriority("Medium")).toBe("medium");
    expect(mapPriority("Low")).toBe("low");
    expect(mapPriority("Lowest")).toBe("low");
    expect(mapPriority(undefined)).toBe("medium");
  });

  it("原始预估按 8 小时/天换算，保留 0.5 天", () => {
    expect(estimateDays(8 * 3600)).toBe(1);
    expect(estimateDays(4 * 3600)).toBe(0.5);
    expect(estimateDays(2 * 3600)).toBe(0.5);
    expect(estimateDays(0)).toBeNull();
    expect(estimateDays(null)).toBeNull();
  });

  it("ADF 描述降级为可读文本", () => {
    const text = adfToText({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "背景" }] },
        { type: "paragraph", content: [{ type: "text", text: "第一段" }] },
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "要点" }] }] }] },
      ],
    });
    expect(text).toContain("## 背景");
    expect(text).toContain("第一段");
    expect(text).toContain("- 要点");
  });

  it("mapIssue 生成完整的外部字段与本地映射", () => {
    const mapped = mapIssue(
      issue("PROJ-123", {
        summary: "修复登录超时",
        description: "  描述  ",
        status: { name: "Done", statusCategory: { key: "done" } },
        priority: { name: "High" },
        issuetype: { name: "Bug", subtask: false },
        project: { key: "PROJ", name: "订单系统" },
        parent: { key: "PROJ-100", fields: { summary: "登录改造" } },
        duedate: "2026-12-01",
        timeoriginalestimate: 16 * 3600,
        updated: "2026-11-27T10:00:00.000+0800",
      }),
      BASE + "/"
    );
    expect(mapped.externalId).toBe("PROJ-123");
    expect(mapped.externalUrl).toBe(`${BASE}/browse/PROJ-123`);
    expect(mapped.title).toBe("修复登录超时");
    expect(mapped.description).toBe("描述");
    expect(mapped.status).toBe("done");
    expect(mapped.priority).toBe("high");
    expect(mapped.type).toBe("prod_issue");
    expect(mapped.estimateDays).toBe(2);
    expect(mapped.windowStart).toBe("2026-12-01");
    expect(mapped.windowEnd).toBe("2026-12-01");
    expect(mapped.projectName).toBe("PROJ · 订单系统");
    expect(mapped.externalParentKey).toBe("PROJ-100");
    expect(mapped.externalParentSummary).toBe("登录改造");
    expect(mapped.externalUpdated).toBe("2026-11-27T10:00:00.000+0800");
  });

  it("子任务归为排期开发，无标题时回退 issue key", () => {
    const mapped = mapIssue(issue("PROJ-9", { issuetype: { name: "Sub-task", subtask: true } }), BASE);
    expect(mapped.type).toBe("planned_dev");
    expect(mapped.title).toBe("PROJ-9");
  });
});

describe("JQL 增量与分页", () => {
  it("增量条件插在 ORDER BY 之前", () => {
    expect(withUpdated("assignee = currentUser() ORDER BY updated ASC", "2026-11-27 09:00")).toBe(
      'assignee = currentUser() AND updated >= "2026-11-27 09:00" ORDER BY updated ASC'
    );
    expect(withUpdated("assignee = currentUser()", "2026-11-27 09:00")).toBe(
      'assignee = currentUser() AND updated >= "2026-11-27 09:00" ORDER BY updated ASC'
    );
    expect(withUpdated("assignee = currentUser()", null)).toBe("assignee = currentUser()");
  });

  it("上次同步时间向前重叠 5 分钟", () => {
    expect(sinceFromLast("2026-11-27 09:30:00", 5)).toBe("2026-11-27 09:25");
    expect(sinceFromLast("2026-11-27 00:03:00", 5)).toBe("2026-11-26 23:58");
    expect(sinceFromLast(null)).toBeNull();
    expect(sinceFromLast("bad")).toBeNull();
  });

  it("按 startAt 分页拉取并去重", async () => {
    const paths: string[] = [];
    const transport = mockTransport((path) => {
      paths.push(path);
      const startAt = Number(/startAt=(\d+)/.exec(path)?.[1] ?? 0);
      const page = startAt === 0
        ? { total: 3, issues: [issue("A-1"), issue("A-2")] }
        : { total: 3, issues: [issue("A-3")] };
      return { status: 200, body: JSON.stringify(page) };
    });
    const { issues } = await fetchIssues(transport, cfg(), { since: null });
    expect(issues.map((i) => i.key)).toEqual(["A-1", "A-2", "A-3"]);
    expect(paths[0]).toContain("startAt=0");
    expect(paths[1]).toContain("startAt=2");
  });

  it("补充拉取我负责的 Story 下的子任务并去重", async () => {
    const jqls: string[] = [];
    const transport = mockTransport((path) => {
      const jql = decodeURIComponent(/jql=([^&]+)/.exec(path)?.[1] ?? "");
      jqls.push(jql);
      if (jql.includes("issuetype = Story")) {
        return { status: 200, body: JSON.stringify({ total: 1, issues: [issue("S-1")] }) };
      }
      if (jql.includes("parent in")) {
        return {
          status: 200,
          body: JSON.stringify({ total: 2, issues: [issue("S-2"), issue("A-1")] }),
        };
      }
      return { status: 200, body: JSON.stringify({ total: 1, issues: [issue("A-1")] }) };
    });
    const { issues, warnings } = await fetchIssues(transport, cfg({ includeStorySubtasks: true }), {
      since: null,
    });
    expect(warnings).toEqual([]);
    expect(issues.map((i) => i.key).sort()).toEqual(["A-1", "S-2"]);
    expect(jqls.some((j) => j.includes("parent in (S-1)"))).toBe(true);
  });

  it("增量同步时 Story 列表不按 updated 过滤，子任务查询仍带增量", async () => {
    const jqls: string[] = [];
    const transport = mockTransport((path) => {
      const jql = decodeURIComponent(/jql=([^&]+)/.exec(path)?.[1] ?? "");
      jqls.push(jql);
      if (jql.includes("issuetype = Story")) {
        return { status: 200, body: JSON.stringify({ total: 1, issues: [issue("S-1")] }) };
      }
      if (jql.includes("parent in")) {
        return { status: 200, body: JSON.stringify({ total: 1, issues: [issue("S-2")] }) };
      }
      return { status: 200, body: JSON.stringify({ total: 0, issues: [] }) };
    });
    const { issues } = await fetchIssues(transport, cfg({ includeStorySubtasks: true }), {
      since: "2026-11-27 09:00",
    });
    const storyJql = jqls.find((j) => j.includes("issuetype = Story"))!;
    expect(storyJql).not.toContain("updated >=");
    const parentJql = jqls.find((j) => j.includes("parent in"))!;
    expect(parentJql).toContain('updated >= "2026-11-27 09:00"');
    expect(issues.map((i) => i.key)).toEqual(["S-2"]);
  });

  it("补充查询失败只记警告，不影响主结果", async () => {
    const transport = mockTransport((path) => {
      const jql = decodeURIComponent(/jql=([^&]+)/.exec(path)?.[1] ?? "");
      if (jql.includes("issuetype = Story")) {
        return { status: 200, body: JSON.stringify({ total: 1, issues: [issue("S-1")] }) };
      }
      if (jql.includes("parent in")) {
        return { status: 400, body: JSON.stringify({ errorMessages: ["Unsupported JQL"] }) };
      }
      return { status: 200, body: JSON.stringify({ total: 1, issues: [issue("A-1")] }) };
    });
    const { issues, warnings } = await fetchIssues(transport, cfg({ includeStorySubtasks: true }), {
      since: null,
    });
    expect(issues.map((i) => i.key)).toEqual(["A-1"]);
    expect(warnings[0]).toContain("补充同步失败");
  });
});

describe("连接测试", () => {
  it("200 返回用户名", async () => {
    const transport = mockTransport(() => ({
      status: 200,
      body: JSON.stringify({ displayName: "张三" }),
    }));
    await expect(testConnection(transport)).resolves.toEqual({
      ok: true,
      message: "连接正常：张三",
      user: "张三",
    });
  });

  it("401 返回可操作的提示", async () => {
    const transport = mockTransport(() => ({ status: 401, body: "" }));
    const r = await testConnection(transport);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("认证失败");
  });
});
