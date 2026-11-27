import { describe, expect, it } from "vitest";
import { DataService } from "../index";
import { memoryPersist } from "../persist";
import type { Task } from "../../types";
import type { JiraConfigView } from "../../../../shared/types";
import type { JiraTransport } from "./types";

const CONFIG: JiraConfigView = {
  baseUrl: "https://jira.example.com",
  authType: "pat",
  email: "",
  jql: "assignee = currentUser() AND issuetype in (Sub-task, Bug) ORDER BY updated ASC",
  includeStorySubtasks: false,
  intervalMinutes: 15,
  enabled: true,
  hasToken: true,
  tokenHint: "abcd",
};

const ISSUE = {
  key: "PROJ-1",
  fields: {
    summary: "登录超时修复",
    description: "描述",
    status: { name: "In Progress", statusCategory: { key: "indeterminate" } },
    priority: { name: "High" },
    issuetype: { name: "Sub-task", subtask: true },
    project: { key: "PROJ", name: "订单系统" },
    parent: { key: "PROJ-100", fields: { summary: "登录改造" } },
    duedate: "2026-12-01",
    timeoriginalestimate: 8 * 3600,
    updated: "2026-11-27T10:00:00.000+0800",
  },
};

function transport(): JiraTransport {
  return {
    getConfig: async () => CONFIG,
    saveConfig: async () => CONFIG,
    clearConfig: async () => undefined,
    request: async () => ({
      status: 200,
      body: JSON.stringify({ total: 1, issues: [ISSUE] }),
    }),
  };
}

describe("Jira 同步与数据服务集成", () => {
  it("同步 → 导出 → 导入后仍保留外部字段与项目", async () => {
    const persist = memoryPersist();
    const svc = new DataService();
    await svc.init(persist);
    svc.setJiraTransport(transport());

    const result = await svc.jiraSync({ full: true });
    expect(result).toMatchObject({ ok: true, fetched: 1, created: 1, missing: 0 });

    const before = (await svc.dispatch("task_list", {})) as Task[];
    const task = before.find((t) => t.externalId === "PROJ-1");
    expect(task).toBeTruthy();
    expect(task!.externalSource).toBe("jira");
    expect(task!.externalParentKey).toBe("PROJ-100");
    expect(task!.externalStatus).toBe("In Progress");
    expect(task!.externalMissing).toBe(false);
    expect(task!.projectId).not.toBe(1);

    const json = (await svc.dispatch("export_json")) as string;
    const svc2 = new DataService();
    await svc2.init(memoryPersist());
    await svc2.dispatch("import_json", { text: json });

    const after = (await svc2.dispatch("task_list", {})) as Task[];
    const restored = after.find((t) => t.externalId === "PROJ-1");
    expect(restored).toBeTruthy();
    expect(restored!.externalUrl).toBe("https://jira.example.com/browse/PROJ-1");
    expect(restored!.externalParentSummary).toBe("登录改造");
    expect(restored!.externalUpdated).toBe("2026-11-27T10:00:00.000+0800");
    expect(restored!.projectId).toBe(task!.projectId);
  });

  it("同步状态可读，清除配置后状态归零", async () => {
    const svc = new DataService();
    await svc.init(memoryPersist());
    svc.setJiraTransport(transport());
    await svc.jiraSync({ full: true });

    const status = (await svc.dispatch("jira_status", {})) as {
      lastSync: string | null;
      lastResult: { ok: boolean; fetched: number } | null;
    };
    expect(status.lastSync).toBeTruthy();
    expect(status.lastResult?.ok).toBe(true);
    expect(status.lastResult?.fetched).toBe(1);

    await svc.jiraConfigClear();
    const cleared = (await svc.dispatch("jira_status", {})) as {
      lastSync: string | null;
      lastResult: unknown;
    };
    expect(cleared.lastSync).toBeNull();
    expect(cleared.lastResult).toBeNull();
  });
});
