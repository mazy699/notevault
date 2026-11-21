import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { freshDb } from "./test-util";
import { importHolidays } from "./holiday";
import { HOLIDAY_CN_2026 } from "./holiday-data";
import {
  buildWeeklyReportData,
  buildWeeklyReportStats,
  buildWeeklyPrompt,
  chatCompletion,
  resolveAiConfig,
  DEFAULT_WEEKLY_TEMPLATE,
  DEFAULT_WEEKLY_SUMMARY_TEMPLATE,
  buildWeeklySummaryPrompt,
  MOCK_WEEKLY_REPORT,
  MOCK_WEEKLY_SUMMARY,
} from "./ai";
import { createEntry } from "./entry";
import { createTask, setTaskStatus } from "./task";
import { createProject } from "./project";
import { setSetting } from "./settings";

describe("AI 配置解析", () => {
  it("setting 与 ai.json 合并：文件非空字段覆盖并记录", () => {
    const r1 = resolveAiConfig(
      (k) => (k === "ai_base_url" ? "https://a" : k === "ai_model" ? "m1" : null),
      null
    );
    expect(r1.baseUrl).toBe("https://a");
    expect(r1.model).toBe("m1");
    expect(r1.overrides).toEqual([]);

    const r2 = resolveAiConfig(
      (k) => (k === "ai_base_url" ? "https://a" : k === "ai_model" ? "m1" : null),
      { model: "m2", promptTemplate: "T {{DATA}}" }
    );
    expect(r2.model).toBe("m2");
    expect(r2.overrides).toEqual(["model"]);
    expect(r2.promptTemplate).toBe("T {{DATA}}");
  });
});

describe("周报数据构建", () => {
  let db: Database;
  beforeAll(async () => {
    db = await freshDb();
    importHolidays(db, HOLIDAY_CN_2026);
  });

  it("按任务分组（含项目/统计）、独立记录、打断类计数", () => {
    const proj = createProject(db, "AI测试项目");
    const t1 = createTask(db, {
      title: "重构任务",
      type: "planned_dev",
      priority: "medium",
      estimateDays: 5,
      projectId: proj.id,
    });
    createEntry(db, { taskId: t1.id, entryDate: "2026-09-14", content: "day1 完成设计", effortHours: 8 });
    createEntry(db, { taskId: t1.id, entryDate: "2026-09-14", content: "day1b 追加调查", effortHours: 1 });
    createEntry(db, { taskId: t1.id, entryDate: "2026-09-17", content: "day2 编码", effortHours: null });
    const urgent = createTask(db, { title: "紧急修复", type: "urgent_insert", priority: "high" });
    createEntry(db, { taskId: urgent.id, entryDate: "2026-09-15", content: "线上问题处理", effortHours: 4 });
    createEntry(db, { taskId: null, entryDate: "2026-09-15", content: "参加评审会", effortHours: null });

    const d = buildWeeklyReportData(db, "2026-09-16");
    expect(d.start).toBe("2026-09-14");
    expect(d.end).toBe("2026-09-20");
    expect(d.workdays).toBeGreaterThan(0);
    expect(d.dataText).toContain("重构任务");
    expect(d.dataText).toContain("AI测试项目");
    expect(d.dataText).toContain("实际占用 2 天");
    expect(d.dataText).toContain("本周投入 9h");
    expect(d.dataText).toContain("紧急修复");
    expect(d.dataText).toContain("独立记录");
    expect(d.dataText).toContain("参加评审会");
  });

  it("进行中但本周无记录的任务进入附加段", () => {
    const t2 = createTask(db, { title: "未动的进行中任务", type: "planned_dev", priority: "low" });
    setTaskStatus(db, t2.id, "in_progress");
    const d = buildWeeklyReportData(db, "2026-09-16");
    expect(d.dataText).toContain("未动的进行中任务");
  });

  it("演示任务、演示记录和演示独立记录均不进入周报数据与统计", () => {
    const before = buildWeeklyReportStats(db, "2026-09-16");
    const demoT = createTask(db, { title: "__DEMO_TASK__", type: "planned_dev", priority: "low" });
    const demoEntry = createEntry(db, {
      taskId: demoT.id,
      entryDate: "2026-09-16",
      content: "__DEMO_ENTRY__",
      effortHours: 8,
    });
    const demoIndependent = createEntry(db, {
      taskId: null,
      entryDate: "2026-09-16",
      content: "__DEMO_INDEPENDENT__",
      effortHours: 2,
    });
    setSetting(db, "demo_task_ids", JSON.stringify([demoT.id]));
    setSetting(db, "demo_entry_ids", JSON.stringify([demoEntry.id, demoIndependent.id]));

    try {
      const data = buildWeeklyReportData(db, "2026-09-16");
      const after = buildWeeklyReportStats(db, "2026-09-16");
      expect(data.dataText).not.toContain("__DEMO_TASK__");
      expect(data.dataText).not.toContain("__DEMO_ENTRY__");
      expect(data.dataText).not.toContain("__DEMO_INDEPENDENT__");
      expect(after.entryCount).toBe(before.entryCount);
      expect(after.taskCount).toBe(before.taskCount);
    } finally {
      setSetting(db, "demo_task_ids", "[]");
      setSetting(db, "demo_entry_ids", "[]");
    }
  });

  it("提示词占位符替换；默认模板与 mock 内容结构完整", () => {
    const p = buildWeeklyPrompt(
      "范围 {{START}}~{{END}}，工作日 {{WORKDAYS}}，数据：{{DATA}}",
      "2026-09-14",
      "2026-09-20",
      5,
      "DATA_TEXT"
    );
    expect(p).toContain("2026-09-14");
    expect(p).toContain("工作日 5");
    expect(p).toContain("DATA_TEXT");
    expect(DEFAULT_WEEKLY_TEMPLATE).toContain("{{DATA}}");
    expect(MOCK_WEEKLY_REPORT).toContain("## 本周完成");
    expect(MOCK_WEEKLY_REPORT).toContain("## 下周计划");
    expect(DEFAULT_WEEKLY_SUMMARY_TEMPLATE).toContain("{{DETAIL}}");
    expect(buildWeeklySummaryPrompt(DEFAULT_WEEKLY_SUMMARY_TEMPLATE, "明细内容")).toContain("明细内容");
    expect(MOCK_WEEKLY_SUMMARY.length).toBeGreaterThan(60);
  });
});

describe("OpenAI 兼容调用", () => {
  const cfg = { baseUrl: "https://api.test/v1", apiKey: "sk-x", model: "m" };

  it("成功解析 choices[0].message.content", async () => {
    const fake = new Response(JSON.stringify({ choices: [{ message: { content: "周报内容" } }] }), { status: 200 });
    const out = await chatCompletion(cfg, [{ role: "user", content: "x" }], { fetchImpl: async () => fake });
    expect(out).toBe("周报内容");
  });

  it("401/429 映射为中文错误", async () => {
    await expect(
      chatCompletion(cfg, [{ role: "user", content: "x" }], { fetchImpl: async () => new Response("bad key", { status: 401 }) })
    ).rejects.toThrow("鉴权失败");
    await expect(
      chatCompletion(cfg, [{ role: "user", content: "x" }], { fetchImpl: async () => new Response("rate limited", { status: 429 }) })
    ).rejects.toThrow("429");
  });

  it("网络异常映射为友好提示", async () => {
    await expect(
      chatCompletion(cfg, [{ role: "user", content: "x" }], {
        fetchImpl: async () => {
          throw new TypeError("fetch failed");
        },
      })
    ).rejects.toThrow("网络错误");
  });

  it("空内容明确报错", async () => {
    const fake = new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), { status: 200 });
    await expect(
      chatCompletion(cfg, [{ role: "user", content: "x" }], { fetchImpl: async () => fake })
    ).rejects.toThrow("未返回内容");
  });
});
