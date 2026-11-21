import { migrate, sql, type Database } from "./db";

/** 测试用内存库：跑迁移、开外键，不导入内置节假日（由用例自行决定） */
export async function freshDb(): Promise<Database> {
  const SQL = await sql();
  const db = new SQL.Database();
  db.run("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
}
