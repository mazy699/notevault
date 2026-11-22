import { q, run, scalar, type Database } from "./db";

export function getSetting(db: Database, key: string): string | null {
  const v = scalar(db, "SELECT value FROM setting WHERE key = ?", [key]);
  return v === null ? null : String(v);
}

export function setSetting(db: Database, key: string, value: string): void {
  run(
    db,
    `INSERT INTO setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

export function allSettings(db: Database): Record<string, string> {
  const rows = q<{ key: string; value: string }>(db, "SELECT key, value FROM setting");
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
