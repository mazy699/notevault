/**
 * 密码库导入导出：JSON（无损迁移主格式）/ CSV（表格快照）/ Markdown（人读报表）。
 * 纯函数、无 DOM/宿主依赖。
 */
import type { PwDb, PwEntry, PwHistory } from "../../shared/types";

export type ExportFmt = "json" | "csv" | "md";

/** 空库（首次打开/导入替换基准） */
export function emptyDb(): PwDb {
  return { format: "notevault-pw-v1", entries: [], updatedAt: Date.now() };
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 生成新条目（新增用） */
export function newEntry(partial: Partial<PwEntry> = {}): PwEntry {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: partial.title ?? "",
    category: partial.category ?? "其他",
    account: partial.account ?? "",
    password: partial.password ?? "",
    url: partial.url ?? "",
    notes: partial.notes ?? "",
    updatedAt: partial.updatedAt ?? now,
    createdAt: partial.createdAt ?? now,
    history: partial.history ?? [],
  };
}

/** 规范化导入条目：补 id/时间/历史，剔除非法项 */
function normalizeEntry(raw: Record<string, unknown>): PwEntry | null {
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const account = typeof raw.account === "string" ? raw.account : "";
  const password = typeof raw.password === "string" ? raw.password : "";
  if (!title && !account) return null; // 无标题且无账号的记录丢弃
  const now = Date.now();
  const toTime = (v: unknown): number => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Date.parse(v) : NaN;
    return Number.isFinite(n) && n > 0 ? n : now;
  };
  const createdAt = toTime(raw.createdAt);
  // 历史密码：兼容旧格式（仅有 changedAt）；新格式记录 startedAt/endedAt 完整区间。
  // 缺失 startedAt 时按时间链推导：首条 = 条目创建时间，后续 = 前一条的结束时间。
  let history: PwHistory[] = [];
  if (Array.isArray(raw.history)) {
    let prevEnd = createdAt;
    history = raw.history
      .filter((h) => h && typeof h === "object" && typeof (h as Record<string, unknown>).password === "string")
      .map((h) => {
        const rec = h as Record<string, unknown>;
        const endedAt = toTime(rec.endedAt ?? rec.changedAt);
        const rawStart = rec.startedAt;
        const startedAt = rawStart !== undefined ? toTime(rawStart) : prevEnd;
        prevEnd = endedAt;
        return {
          password: rec.password as string,
          startedAt: Math.min(startedAt, endedAt),
          endedAt,
        };
      });
  }
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : crypto.randomUUID(),
    title: title || account,
    category: typeof raw.category === "string" && raw.category.trim() ? raw.category.trim() : "其他",
    account,
    password,
    url: typeof raw.url === "string" ? raw.url : "",
    notes: typeof raw.notes === "string" ? raw.notes : "",
    updatedAt: toTime(raw.updatedAt),
    createdAt,
    history,
  };
}

// ---------------- JSON ----------------

export function buildJson(db: PwDb): string {
  return JSON.stringify(db, null, 2);
}

/** 解析 JSON 导入：接受整库对象或条目数组 */
function parseJsonImport(text: string): PwEntry[] | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (Array.isArray(data)) {
    return data.map((r) => normalizeEntry(r as Record<string, unknown>)).filter((e): e is PwEntry => e !== null);
  }
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.entries)) {
      return (obj.entries as Record<string, unknown>[])
        .map((r) => normalizeEntry(r))
        .filter((e): e is PwEntry => e !== null);
    }
  }
  return null;
}

// ---------------- CSV ----------------

const CSV_COLUMNS = ["title", "category", "account", "password", "url", "notes", "updatedAt", "createdAt", "history"] as const;

function csvEscape(v: string): string {
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** 导出 CSV（含历史列——history 为 JSON 数组字符串；带 BOM 便于 Excel 识别 UTF-8） */
export function buildCsv(entries: PwEntry[], includeHistory = true): string {
  const lines: string[] = [CSV_COLUMNS.join(",")];
  for (const e of entries) {
    const row = [
      e.title,
      e.category,
      e.account,
      e.password,
      e.url ?? "",
      e.notes ?? "",
      new Date(e.updatedAt).toISOString(),
      new Date(e.createdAt).toISOString(),
      includeHistory ? JSON.stringify(e.history) : "",
    ];
    lines.push(row.map(csvEscape).join(","));
  }
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

/** RFC4180 简化 CSV 解析（支持引号包裹/转义引号/引号内换行） */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src.charAt(i);
    if (inQuotes) {
      if (c === '"') {
        if (src.charAt(i + 1) === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // 去掉末尾全空行
  while (rows.length > 0 && rows[rows.length - 1].every((f) => f === "")) rows.pop();
  return rows;
}

function parseCsvImport(text: string): PwEntry[] | null {
  const rows = parseCsv(text);
  if (rows.length < 2) return null;
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  if (idx("title") === -1 && idx("account") === -1 && idx("password") === -1) return null;
  const out: PwEntry[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const get = (name: string) => {
      const i = idx(name);
      return i >= 0 && i < cells.length ? cells[i] : "";
    };
    // history 列是 JSON 数组：交给 normalizeEntry 统一规范化（含旧格式时间推导）
    let history: unknown[] = [];
    const hRaw = get("history");
    if (hRaw) {
      try {
        const parsed = JSON.parse(hRaw);
        if (Array.isArray(parsed)) history = parsed;
      } catch {
        /* history 列非 JSON：忽略 */
      }
    }
    const e = normalizeEntry({
      title: get("title"),
      category: get("category"),
      account: get("account"),
      password: get("password"),
      url: get("url"),
      notes: get("notes"),
      updatedAt: get("updatedat"),
      createdAt: get("createdat"),
      history,
    });
    if (e) out.push(e);
  }
  return out;
}

// ---------------- Markdown ----------------

/** 导出 Markdown 报表：按分类分组、行内代码展示密码、历史列表 */
export function buildMd(entries: PwEntry[], includeHistory = true): string {
  const groups = new Map<string, PwEntry[]>();
  for (const e of entries) {
    const key = e.category || "其他";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  const L: string[] = [];
  L.push("# NoteVault 密码库导出");
  L.push("");
  L.push(`> 导出时间：${fmtTime(Date.now())} · 共 ${entries.length} 条${includeHistory ? " · 含历史密码" : ""}`);
  L.push("");
  L.push("> ⚠️ 本文件包含明文密码，请妥善保管，阅后即焚。");
  L.push("");
  for (const [cat, list] of groups) {
    L.push(`## ${cat}（${list.length}）`);
    L.push("");
    for (const e of list) {
      L.push(`### ${e.title || e.account}`);
      L.push("");
      if (e.account) L.push(`- 账号：\`${e.account}\``);
      L.push(`- 密码：\`${e.password}\``);
      if (e.url) L.push(`- 地址：${e.url}`);
      if (e.notes) L.push(`- 备注：${e.notes}`);
      L.push(`- 更新：${fmtTime(e.updatedAt)}`);
      if (includeHistory && e.history.length > 0) {
        L.push(`- 历史密码（${e.history.length}）：`);
        e.history.forEach((h, i) => {
          L.push(`  ${i + 1}. \`${h.password}\`（${fmtTime(h.startedAt)} ~ ${fmtTime(h.endedAt)}）`);
        });
      }
      L.push("");
    }
  }
  return L.join("\n");
}

// ---------------- 导入入口 ----------------

export interface ImportResult {
  entries: PwEntry[];
  format: "json" | "csv";
}

/** 按内容自动识别 JSON/CSV 并解析；失败抛错 */
export function parseImportText(text: string, fileName = ""): ImportResult {
  const looksJson = text.trimStart().startsWith("{") || text.trimStart().startsWith("[") || /\.json$/i.test(fileName);
  if (looksJson) {
    const entries = parseJsonImport(text);
    if (!entries) throw new Error("JSON 解析失败：不是有效的 NoteVault 密码库导出文件");
    return { entries, format: "json" };
  }
  const entries = parseCsvImport(text);
  if (!entries) throw new Error("CSV 解析失败：缺少 title/account/password 表头");
  return { entries, format: "csv" };
}

/** 合并策略：match = 覆盖已存在（按 id 或 title+account 匹配），append = 全部追加 */
export function mergeEntries(
  current: PwEntry[],
  incoming: PwEntry[],
  mode: "merge" | "replace"
): { entries: PwEntry[]; added: number; updated: number; skipped: number } {
  if (mode === "replace") {
    return { entries: incoming.map((e) => ({ ...e })), added: incoming.length, updated: 0, skipped: 0 };
  }
  const key = (e: PwEntry) => e.id;
  const alt = (e: PwEntry) => `${(e.title || "").trim().toLowerCase()}|${(e.account || "").trim().toLowerCase()}`;
  const byKey = new Map(current.map((e) => [key(e), e]));
  const byAlt = new Map(current.map((e) => [alt(e), e]));
  let added = 0;
  let updated = 0;
  let skipped = 0;
  const result = [...current];
  for (const inc of incoming) {
    const exist = byKey.get(key(inc)) ?? byAlt.get(alt(inc));
    if (!exist) {
      const e = { ...inc };
      // 追加时若 id 冲突（不同库同 id 可能性极小）重新生成
      if (byKey.has(e.id)) e.id = crypto.randomUUID();
      result.push(e);
      byKey.set(e.id, e);
      byAlt.set(alt(e), e);
      added++;
      continue;
    }
    // 冲突：updatedAt 新者胜
    if (inc.updatedAt > exist.updatedAt) {
      const i = result.indexOf(exist);
      result[i] = { ...inc, id: exist.id };
      byKey.set(exist.id, result[i]);
      byAlt.set(alt(result[i]), result[i]);
      updated++;
    } else {
      skipped++;
    }
  }
  return { entries: result, added, updated, skipped };
}
