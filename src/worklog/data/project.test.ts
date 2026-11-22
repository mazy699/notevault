import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { freshDb } from "./test-util";
import { createProject, deleteProject, getProject, listProjects, renameProject, projectExists } from "./project";
import { createTask, getTaskDetail, listTasks } from "./task";
import { getTask } from "./models";
import { DEFAULT_PROJECT_ID } from "../types";

describe("项目管理", () => {
  let db: Database;
  beforeAll(async () => {
    db = await freshDb();
  });

  it("迁移自动创建默认项目（id=1）", () => {
    const all = listProjects(db);
    expect(all.length).toBeGreaterThanOrEqual(1);
    expect(all[0].id).toBe(DEFAULT_PROJECT_ID);
    expect(all[0].name).toBe("默认项目");
  });

  it("新任务默认归入默认项目；可指定项目", () => {
    const proj = createProject(db, "订单系统");
    const t1 = createTask(db, { title: "无项目参数任务", type: "planned_dev", priority: "medium" });
    expect(t1.projectId).toBe(DEFAULT_PROJECT_ID);
    const t2 = createTask(db, { title: "指定项目任务", type: "planned_dev", priority: "medium", projectId: proj.id });
    expect(t2.projectId).toBe(proj.id);
    // 非法项目报错
    expect(() => createTask(db, { title: "x", type: "planned_dev", priority: "medium", projectId: 999 })).toThrow();
  });

  it("重命名项目；默认项目不可删除；删除项目后任务归默认项目", () => {
    const proj = createProject(db, "数据平台");
    const renamed = renameProject(db, proj.id, "数据平台二期");
    expect(renamed.name).toBe("数据平台二期");
    expect(renameProject(db, DEFAULT_PROJECT_ID, "改名的默认项目").name).toBe("改名的默认项目");

    const t = createTask(db, { title: "项目内任务", type: "planned_dev", priority: "low", projectId: proj.id });
    expect(() => deleteProject(db, DEFAULT_PROJECT_ID)).toThrow();

    deleteProject(db, proj.id);
    expect(projectExists(db, proj.id)).toBe(false);
    expect(getTask(db, t.id)!.projectId).toBe(DEFAULT_PROJECT_ID);
    const detail = getTaskDetail(db, t.id);
    expect(detail.task.projectId).toBe(DEFAULT_PROJECT_ID);
  });

  it("按项目过滤任务列表", () => {
    const proj = createProject(db, "筛选测试项目");
    createTask(db, { title: "甲", type: "planned_dev", priority: "low", projectId: proj.id });
    createTask(db, { title: "乙", type: "planned_dev", priority: "low" });
    const inProj = listTasks(db, { projectId: proj.id });
    expect(inProj.length).toBe(1);
    expect(inProj[0].title).toBe("甲");
    expect(listTasks(db, {}).length).toBeGreaterThanOrEqual(2);
    expect(getProject(db, proj.id)!.name).toBe("筛选测试项目");
  });
});
