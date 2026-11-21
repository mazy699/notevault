import { inTxn, run, type Database } from "./db";
import { isDateStr, nowStr } from "./dates";
import { getEntry } from "./models";
import { autoTransitionOnEntry, insertEntryRaw } from "./task";
import type { WorkEntry } from "../types";

export interface CreateEntryInput {
  taskId: number | null;
  entryDate: string;
  content: string;
  effortHours: number | null;
}

function validate(input: {
  entryDate?: string;
  content?: string;
  effortHours?: number | null;
}): void {
  if (input.entryDate !== undefined && !isDateStr(input.entryDate)) {
    throw new Error(`无效日期: ${input.entryDate}`);
  }
  if (input.content !== undefined && !input.content.trim()) {
    throw new Error("记录内容不能为空");
  }
  if (
    input.effortHours !== undefined &&
    input.effortHours !== null &&
    !(Number(input.effortHours) > 0 && Number(input.effortHours) <= 24)
  ) {
    throw new Error("投入量应为 0~24 之间的小时数，不填则留空");
  }
}

/** 新增工作条目；taskId 为空即"独立记录"。任务产生首条条目时自动流转为进行中 */
export function createEntry(db: Database, input: CreateEntryInput): WorkEntry {
  validate(input);
  const content = input.content.trim();
  const now = nowStr();
  let id = 0;
  inTxn(db, () => {
    id = insertEntryRaw(db, input.taskId, input.entryDate, content, input.effortHours, now);
    if (input.taskId !== null) autoTransitionOnEntry(db, input.taskId, now);
  });
  return getEntry(db, id);
}

export function updateEntry(
  db: Database,
  entryId: number,
  patch: { entryDate?: string; content?: string; effortHours?: number | null }
): WorkEntry {
  validate(patch);
  const existing = getEntry(db, entryId);
  const entryDate = patch.entryDate ?? existing.entryDate;
  const content = patch.content !== undefined ? patch.content.trim() : existing.content;
  const effortHours = patch.effortHours !== undefined ? patch.effortHours : existing.effortHours;
  run(
    db,
    "UPDATE work_entry SET entry_date = ?, content = ?, effort_hours = ?, updated_at = ? WHERE id = ?",
    [entryDate, content, effortHours, nowStr(), entryId]
  );
  return getEntry(db, entryId);
}

export function removeEntry(db: Database, entryId: number): void {
  getEntry(db, entryId);
  run(db, "DELETE FROM work_entry WHERE id = ?", [entryId]);
}
