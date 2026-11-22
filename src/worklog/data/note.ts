import { lastId, q, run, type Database } from "./db";
import { nowStr } from "./dates";
import type { Note, NoteFilter, NoteInput } from "../types";

interface NoteRow {
  id: number;
  title: string;
  content: string;
  tags: string;
  pinned: number;
  created_at: string;
  updated_at: string;
}

function rowToNote(r: NoteRow): Note {
  let tags: string[] = [];
  try {
    const parsed: unknown = JSON.parse(r.tags);
    if (Array.isArray(parsed)) tags = parsed.map(String);
  } catch {
    /* 忽略坏数据 */
  }
  return {
    id: r.id,
    title: r.title,
    content: r.content,
    tags,
    pinned: r.pinned === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** 标签规范化：支持数组或"逗号/顿号/空格"分隔字符串，去 # 去重，最多 8 个、单个 20 字 */
export function normalizeTags(tags: unknown): string[] {
  const raw = Array.isArray(tags) ? tags : typeof tags === "string" ? tags.split(/[,，、\s]+/) : [];
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t !== "string") continue;
    const clean = t.trim().replace(/^#+/, "").trim();
    if (!clean || out.includes(clean)) continue;
    out.push(clean.slice(0, 20));
    if (out.length >= 8) break;
  }
  return out;
}

/** 标题为空时从内容首行提取（去掉 markdown 记号） */
export function deriveTitle(content: string): string {
  const first = content
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l !== "");
  return (first ?? "").replace(/^[#>\-*\s]+/, "").slice(0, 40);
}

export function listNotes(db: Database, filter: NoteFilter = {}): Note[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.search && filter.search.trim()) {
    where.push("(title LIKE ? OR content LIKE ?)");
    const kw = `%${filter.search.trim()}%`;
    params.push(kw, kw);
  }
  if (filter.tag && filter.tag.trim()) {
    where.push("tags LIKE ?");
    params.push(`%"${filter.tag.trim()}"%`);
  }
  return q<NoteRow>(
    db,
    `SELECT * FROM note ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY pinned DESC, updated_at DESC, id DESC`,
    params
  ).map(rowToNote);
}

/** 某天新建的笔记（日期详情侧栏用） */
export function listNotesCreatedBy(db: Database, date: string): Note[] {
  return q<NoteRow>(
    db,
    "SELECT * FROM note WHERE substr(created_at, 1, 10) = ? ORDER BY pinned DESC, created_at DESC, id DESC",
    [date]
  ).map(rowToNote);
}

export function getNote(db: Database, id: number): Note | null {
  const rows = q<NoteRow>(db, "SELECT * FROM note WHERE id = ?", [id]);
  return rows.length ? rowToNote(rows[0]) : null;
}

export function createNote(db: Database, input: NoteInput): Note {
  const content = (input.content ?? "").trim();
  if (!content) throw new Error("笔记内容不能为空");
  const title = (input.title ?? "").trim() || deriveTitle(content);
  const tags = JSON.stringify(normalizeTags(input.tags));
  const now = nowStr();
  run(
    db,
    `INSERT INTO note (title, content, tags, pinned, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)`,
    [title, content, tags, now, now]
  );
  const created = getNote(db, lastId(db));
  if (!created) throw new Error("笔记创建失败");
  return created;
}

export function updateNote(db: Database, id: number, input: NoteInput): Note {
  const existing = getNote(db, id);
  if (!existing) throw new Error(`笔记不存在: ${id}`);
  const content = (input.content ?? "").trim();
  if (!content) throw new Error("笔记内容不能为空");
  const title = input.title !== undefined ? (input.title.trim() || deriveTitle(content)) : existing.title;
  const tags = input.tags !== undefined ? JSON.stringify(normalizeTags(input.tags)) : JSON.stringify(existing.tags);
  run(db, "UPDATE note SET title = ?, content = ?, tags = ?, updated_at = ? WHERE id = ?", [
    title,
    content,
    tags,
    nowStr(),
    id,
  ]);
  return getNote(db, id)!;
}

export function toggleNotePin(db: Database, id: number): Note {
  run(db, "UPDATE note SET pinned = 1 - pinned, updated_at = ? WHERE id = ?", [nowStr(), id]);
  const note = getNote(db, id);
  if (!note) throw new Error(`笔记不存在: ${id}`);
  return note;
}

export function deleteNote(db: Database, id: number): void {
  run(db, "DELETE FROM note WHERE id = ?", [id]);
}
