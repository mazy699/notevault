import { inTxn, q, run, type Database } from "../db";
import { nowStr } from "../dates";
import { createProject, listProjects } from "../project";
import type { MappedJiraIssue } from "./types";

export interface ApplyResult {
  created: number;
  updated: number;
  skipped: number;
  missing: number;
}

interface ExistingRow {
  id: number;
  external_updated: string | null;
  external_missing: number;
  window_start: string | null;
  window_end: string | null;
  completed_at: string | null;
}

/**
 * 幂等写入 Jira issue：
 * - 以 (external_source='jira', external_id) 定位；
 * - 本地 work_entry 不参与任何写入；
 * - 本地 type / project 不被覆盖，时间窗仅在本地为空时补齐；
 * - 全量同步时，未出现在结果中的 Jira 任务标记 external_missing（不删除）。
 */
export function applyJiraSync(
  db: Database,
  issues: MappedJiraIssue[],
  opts: { full: boolean }
): ApplyResult {
  const now = nowStr();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let missing = 0;
  const seen = new Set<string>();

  inTxn(db, () => {
    const projectCache = new Map(listProjects(db).map((p) => [p.name, p.id]));

    for (const m of issues) {
      if (!m.externalId) {
        skipped++;
        continue;
      }
      seen.add(m.externalId);

      const existing = q<ExistingRow>(
        db,
        `SELECT id, external_updated, external_missing, window_start, window_end, completed_at
         FROM task WHERE external_source = 'jira' AND external_id = ?`,
        [m.externalId]
      )[0];

      if (!existing) {
        let projectId = projectCache.get(m.projectName);
        if (!projectId) {
          const project = createProject(db, m.projectName);
          projectId = project.id;
          projectCache.set(project.name, project.id);
        }
        run(
          db,
          `INSERT INTO task (
             title, description, type, priority, status, estimate_days, window_start, window_end,
             project_id, created_at, updated_at, completed_at,
             external_source, external_id, external_url, external_parent_key, external_parent_summary,
             external_status, external_updated, external_synced_at, external_missing
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`,
          [
            m.title,
            m.description,
            m.type,
            m.priority,
            m.status,
            m.estimateDays,
            m.windowStart,
            m.windowEnd,
            projectId,
            now,
            now,
            m.status === "done" ? now : null,
            m.externalSource,
            m.externalId,
            m.externalUrl,
            m.externalParentKey,
            m.externalParentSummary,
            m.externalStatus,
            m.externalUpdated,
            now,
          ]
        );
        created++;
        continue;
      }

      const unchanged =
        existing.external_updated != null &&
        existing.external_updated === m.externalUpdated &&
        existing.external_missing === 0;
      if (unchanged) {
        run(db, "UPDATE task SET external_synced_at = ?, external_missing = 0 WHERE id = ?", [
          now,
          existing.id,
        ]);
        skipped++;
        continue;
      }

      // 时间窗：保留用户本地覆盖；仅在本地为空时用 Jira 截止日期补齐
      const windowStart = existing.window_start ?? m.windowStart;
      const windowEnd = existing.window_end ?? m.windowEnd;
      const completedAt =
        m.status === "done" ? existing.completed_at ?? now : null;

      run(
        db,
        `UPDATE task SET
           title = ?, description = ?, status = ?, priority = ?, estimate_days = ?,
           window_start = ?, window_end = ?, updated_at = ?, completed_at = ?,
           external_url = ?, external_parent_key = ?, external_parent_summary = ?,
           external_status = ?, external_updated = ?, external_synced_at = ?, external_missing = 0
         WHERE id = ?`,
        [
          m.title,
          m.description,
          m.status,
          m.priority,
          m.estimateDays,
          windowStart,
          windowEnd,
          now,
          completedAt,
          m.externalUrl,
          m.externalParentKey,
          m.externalParentSummary,
          m.externalStatus,
          m.externalUpdated,
          now,
          existing.id,
        ]
      );
      updated++;
    }

    // 全量同步才判断“消失”；结果为空时不做判断，避免 JQL 写错把全部任务标成缺失
    if (opts.full && seen.size > 0) {
      const ids = [...seen];
      const placeholders = ids.map(() => "?").join(",");
      missing = Number(
        q<{ n: number }>(
          db,
          `SELECT COUNT(*) AS n FROM task
           WHERE external_source = 'jira' AND external_id IS NOT NULL
             AND external_missing = 0 AND external_id NOT IN (${placeholders})`,
          ids
        )[0]?.n ?? 0
      );
      run(
        db,
        `UPDATE task SET external_missing = 1
         WHERE external_source = 'jira' AND external_id IS NOT NULL
           AND external_id NOT IN (${placeholders})`,
        ids
      );
    }
  });

  return { created, updated, skipped, missing };
}
