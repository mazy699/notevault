import { q, run, scalar, type Database } from "./db";
import { nowStr } from "./dates";
import type { Report } from "../types";

interface ReportRow {
  id: number;
  type: string;
  range_start: string;
  range_end: string;
  model: string | null;
  content: string;
  summary_content: string;
  created_at: string;
}

function rowToReport(r: ReportRow): Report {
  return {
    id: r.id,
    type: r.type,
    rangeStart: r.range_start,
    rangeEnd: r.range_end,
    model: r.model,
    content: r.content,
    summaryContent: r.summary_content ?? "",
    createdAt: r.created_at,
  };
}

export function saveReport(
  db: Database,
  r: {
    type: string;
    rangeStart: string;
    rangeEnd: string;
    model: string;
    content: string;
    summaryContent?: string;
  }
): Report {
  run(
    db,
    `INSERT INTO report (type, range_start, range_end, model, content, summary_content, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [r.type, r.rangeStart, r.rangeEnd, r.model, r.content, r.summaryContent ?? "", nowStr()]
  );
  const id = Number(scalar(db, "SELECT last_insert_rowid()") ?? 0);
  return getReport(db, id)!;
}

export function updateReportContent(
  db: Database,
  id: number,
  content: string,
  summaryContent: string
): Report {
  run(db, "UPDATE report SET content = ?, summary_content = ? WHERE id = ?", [
    content,
    summaryContent,
    id,
  ]);
  return getReport(db, id)!;
}

export function listReports(db: Database, type: string, limit = 12): Report[] {
  return q<ReportRow>(
    db,
    "SELECT * FROM report WHERE type = ? ORDER BY id DESC LIMIT ?",
    [type, limit]
  ).map(rowToReport);
}

export function getReport(db: Database, id: number): Report | null {
  const rows = q<ReportRow>(db, "SELECT * FROM report WHERE id = ?", [id]);
  return rows.length ? rowToReport(rows[0]) : null;
}

export function deleteReport(db: Database, id: number): void {
  run(db, "DELETE FROM report WHERE id = ?", [id]);
}
