// 建库 SQL：与需求文档 §6 的 DDL 保持一致
export const INIT_SQL = `
CREATE TABLE task (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT    NOT NULL,
  description   TEXT    NOT NULL DEFAULT '',
  type          TEXT    NOT NULL DEFAULT 'planned_dev',
  priority      TEXT    NOT NULL DEFAULT 'medium',
  status        TEXT    NOT NULL DEFAULT 'todo',
  estimate_days REAL,
  window_start  DATE,
  window_end    DATE,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  completed_at  TEXT
);

CREATE TABLE work_entry (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id      INTEGER REFERENCES task(id) ON DELETE CASCADE,
  entry_date   DATE    NOT NULL,
  content      TEXT    NOT NULL,
  effort_hours REAL,
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL
);
CREATE INDEX idx_entry_date ON work_entry(entry_date);
CREATE INDEX idx_entry_task ON work_entry(task_id, entry_date);

CREATE TABLE daily_note (
  date       DATE PRIMARY KEY,
  plan_text  TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE holiday (
  date       DATE PRIMARY KEY,
  name       TEXT    NOT NULL,
  is_workday INTEGER NOT NULL
);

CREATE TABLE setting (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/** 0002：项目管理。任务挂 project_id，固定创建"默认项目"（id=1，不可删除） */
export const MIGRATION_2 = `
CREATE TABLE project (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL
);
INSERT INTO project (name, sort, created_at) VALUES ('默认项目', 0, datetime('now','localtime'));
ALTER TABLE task ADD COLUMN project_id INTEGER REFERENCES project(id);
UPDATE task SET project_id = 1 WHERE project_id IS NULL;
`;

/** 0003：AI 生成的周报历史 */
export const MIGRATION_3 = `
CREATE TABLE report (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT    NOT NULL DEFAULT 'weekly',
  range_start DATE   NOT NULL,
  range_end  DATE    NOT NULL,
  model      TEXT,
  content    TEXT    NOT NULL,
  created_at TEXT    NOT NULL
);
`;

/** 0004：轻量笔记（标签组织 + 搜索，不做目录树） */
export const MIGRATION_4 = `
CREATE TABLE note (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL DEFAULT '',
  content    TEXT    NOT NULL DEFAULT '',
  tags       TEXT    NOT NULL DEFAULT '[]',
  pinned     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);
CREATE INDEX idx_note_updated ON note(pinned, updated_at);
`;

/** 0005：待办箱（尚未达到任务粒度的随手事项） */
export const MIGRATION_5 = `
CREATE TABLE todo (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  content    TEXT    NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'open',
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);
CREATE INDEX idx_todo_status ON todo(status, updated_at);
`;

/** 0006：待办标题外的补充说明 */
export const MIGRATION_6 = `
ALTER TABLE todo ADD COLUMN detail TEXT NOT NULL DEFAULT '';
`;

/** 0007：待办转入任务后的关联信息 */
export const MIGRATION_7 = `
ALTER TABLE todo ADD COLUMN linked_task_id INTEGER REFERENCES task(id);
ALTER TABLE todo ADD COLUMN linked_at TEXT;
`;

/** 0008：周报简洁版内容 */
export const MIGRATION_8 = `
ALTER TABLE report ADD COLUMN summary_content TEXT NOT NULL DEFAULT '';
`;

/**
 * 0009：外部任务源（Jira 同步，后续可扩展 linear/github）。
 * - external_source 固定枚举："jira" | "linear" | "github"（本地任务为 NULL）
 * - (external_source, external_id) 唯一索引保证同步幂等（upsert）
 * - external_missing：issue 从 JQL 结果消失时置 1，只标记不删除
 */
export const MIGRATION_9 = `
ALTER TABLE task ADD COLUMN external_source TEXT;
ALTER TABLE task ADD COLUMN external_id TEXT;
ALTER TABLE task ADD COLUMN external_url TEXT;
ALTER TABLE task ADD COLUMN external_parent_key TEXT;
ALTER TABLE task ADD COLUMN external_parent_summary TEXT;
ALTER TABLE task ADD COLUMN external_updated TEXT;
ALTER TABLE task ADD COLUMN external_missing INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX idx_task_external ON task(external_source, external_id) WHERE external_id IS NOT NULL;
`;
