import initSqlJs, { Database, SqlJsStatic } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import {
  INIT_SQL,
  MIGRATION_2,
  MIGRATION_3,
  MIGRATION_4,
  MIGRATION_5,
  MIGRATION_6,
  MIGRATION_7,
  MIGRATION_8,
} from "./schema";

let sqlPromise: Promise<SqlJsStatic> | null = null;
let wasmLoaderOverride: (() => Promise<Uint8Array | ArrayBuffer>) | null = null;

export type { Database };

/**
 * 覆盖 wasm 加载方式：单测（Node 环境）用 fs 读 node_modules 下的 wasm 注入，
 * 浏览器/WebView 走 Vite 资源 URL（默认）。
 */
export function setSqlWasmLoader(fn: (() => Promise<Uint8Array | ArrayBuffer>) | null): void {
  wasmLoaderOverride = fn;
  sqlPromise = null;
}

export function sql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    // wasm 走 Vite 资源 URL：首次进入工作台时懒加载（约 1.2MB）
    sqlPromise = wasmLoaderOverride
      ? (async () => initSqlJs({ wasmBinary: await wasmLoaderOverride! } as never))()
      : initSqlJs({ locateFile: () => wasmUrl, useOldExtensionFunctions: false } as never);
  }
  return sqlPromise;
}

/** 迁移脚本列表：新增表结构时追加文件内容，user_version 顺序执行 */
export const MIGRATIONS: string[] = [
  INIT_SQL,
  MIGRATION_2,
  MIGRATION_3,
  MIGRATION_4,
  MIGRATION_5,
  MIGRATION_6,
  MIGRATION_7,
  MIGRATION_8,
];

export function migrate(db: Database): void {
  const current = Number(scalar(db, "PRAGMA user_version") ?? 0);
  for (let i = current; i < MIGRATIONS.length; i++) {
    db.run("BEGIN");
    try {
      db.run(MIGRATIONS[i]);
      db.run(`PRAGMA user_version = ${i + 1}`);
      db.run("COMMIT");
    } catch (e) {
      try {
        db.run("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw e;
    }
  }
}

export interface Store {
  db: Database;
}

/** 打开整库（bytes 为 null 时新建）。文件 IO 由调用方（persist 适配层）负责。 */
export async function openStore(bytes: Uint8Array | null): Promise<Store> {
  const SQL = await sql();
  const db = bytes && bytes.length > 0 ? new SQL.Database(bytes) : new SQL.Database();
  db.run("PRAGMA foreign_keys = ON");
  migrate(db);
  return { db };
}

/** 导出整库字节（宿主负责落盘） */
export function exportStore(store: Store): Uint8Array {
  return store.db.export();
}

type Row = Record<string, unknown>;

export function q<T extends object = Row>(db: Database, sqlText: string, params: unknown[] = []): T[] {
  const stmt = db.prepare(sqlText);
  try {
    stmt.bind(params as never);
    const rows: T[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as unknown as T);
    return rows;
  } finally {
    stmt.free();
  }
}

export function scalar(db: Database, sqlText: string, params: unknown[] = []): unknown {
  const rows = q(db, sqlText, params);
  if (rows.length === 0) return null;
  const first = Object.values(rows[0])[0];
  return first === undefined ? null : first;
}

export function run(db: Database, sqlText: string, params: unknown[] = []): void {
  db.run(sqlText, params as never);
}

export function lastId(db: Database): number {
  return Number(scalar(db, "SELECT last_insert_rowid()") ?? 0);
}

export function inTxn<T>(db: Database, fn: () => T): T {
  db.run("BEGIN");
  try {
    const r = fn();
    db.run("COMMIT");
    return r;
  } catch (e) {
    try {
      db.run("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  }
}
