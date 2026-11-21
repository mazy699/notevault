import { inTxn, lastId, q, run, type Database } from "./db";
import { nowStr } from "./dates";
import { rowToProject, type ProjectRow } from "./models";
import { DEFAULT_PROJECT_ID, type Project } from "../types";

export function listProjects(db: Database): Project[] {
  return q<ProjectRow>(db, "SELECT * FROM project ORDER BY sort, id").map(rowToProject);
}

export function getProject(db: Database, id: number): Project | null {
  const rows = q<ProjectRow>(db, "SELECT * FROM project WHERE id = ?", [id]);
  return rows.length ? rowToProject(rows[0]) : null;
}

export function projectExists(db: Database, id: number): boolean {
  return getProject(db, id) !== null;
}

export function createProject(db: Database, name: string): Project {
  const trimmed = (name ?? "").trim();
  if (!trimmed) throw new Error("项目名称不能为空");
  if (trimmed.length > 50) throw new Error("项目名称不能超过 50 个字符");
  const maxSort = Number(q<{ s: number | null }>(db, "SELECT MAX(sort) AS s FROM project")[0]?.s ?? 0);
  run(db, "INSERT INTO project (name, sort, created_at) VALUES (?, ?, ?)", [trimmed, maxSort + 1, nowStr()]);
  const created = getProject(db, lastId(db));
  if (!created) throw new Error("项目创建失败");
  return created;
}

export function renameProject(db: Database, id: number, name: string): Project {
  const trimmed = (name ?? "").trim();
  if (!trimmed) throw new Error("项目名称不能为空");
  if (!getProject(db, id)) throw new Error(`项目不存在: ${id}`);
  run(db, "UPDATE project SET name = ? WHERE id = ?", [trimmed, id]);
  return getProject(db, id)!;
}

/** 删除项目：其下任务全部归入默认项目；默认项目不可删除 */
export function deleteProject(db: Database, id: number): void {
  if (id === DEFAULT_PROJECT_ID) throw new Error("默认项目不能删除");
  if (!getProject(db, id)) throw new Error(`项目不存在: ${id}`);
  inTxn(db, () => {
    run(db, "UPDATE task SET project_id = ?, updated_at = ? WHERE project_id = ?", [
      DEFAULT_PROJECT_ID,
      nowStr(),
      id,
    ]);
    run(db, "DELETE FROM project WHERE id = ?", [id]);
  });
}
