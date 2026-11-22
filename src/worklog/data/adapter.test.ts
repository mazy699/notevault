import { describe, expect, it } from "vitest";
import { DataService } from "./index";
import { memoryPersist } from "./persist";

describe("持久化适配（内存后端 roundtrip）", () => {
  it("init 空库 → 建任务 → 整库写盘 → 重新打开数据仍在", async () => {
    const persist = memoryPersist();
    const svc = new DataService();
    await svc.init(persist);
    const t = svc.taskCreate({ title: "适配层持久化", type: "planned_dev", priority: "medium" });
    await svc.flush();
    expect(persist.bytes()!.length).toBeGreaterThan(0);

    const svc2 = new DataService();
    await svc2.init(persist);
    expect(svc2.taskGet(t.id).task.title).toBe("适配层持久化");
  });

  it("backupNow 委托宿主并返回路径", async () => {
    const persist = memoryPersist();
    const svc = new DataService();
    await svc.init(persist);
    svc.taskCreate({ title: "备份", type: "planned_dev", priority: "medium" });
    const path = await svc.backupNow();
    expect(path).toContain("worklog-");
  });

  it("dispatch 路由覆盖核心命令", async () => {
    const persist = memoryPersist();
    const svc = new DataService();
    await svc.init(persist);
    const task = (await svc.dispatch("task_create", {
      title: "路由任务",
      type: "planned_dev",
      priority: "medium",
    })) as { id: number };
    expect(task.id).toBeGreaterThan(0);
    const list = (await svc.dispatch("task_list", {})) as unknown[];
    expect(list.some((x) => (x as { id: number }).id === task.id)).toBe(true);
    const matrix = (await svc.dispatch("week_matrix", { date: "2026-11-22" })) as { days: unknown[] };
    expect(matrix.days.length).toBe(7);
    await expect(svc.dispatch("unknown_cmd", {})).rejects.toThrow(/未知命令/);
  });
});
