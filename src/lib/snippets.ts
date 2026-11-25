/**
 * 常用语（Issue #12）：纯函数工具——排序、搜索过滤、导入导出、合并。
 * 数据为纯文本 JSON（%APPDATA%/notevault/snippets.json），双宿主共用。
 */
import type { Snippet, SnippetDb } from "../../shared/types";
import { moveId, resolvedIdOrder, sortByManualOrder } from "./pworder";

export const SNIPPETS_FORMAT = "notevault-snippets-v1" as const;

export function emptySnippetDb(): SnippetDb {
  return { format: SNIPPETS_FORMAT, snippets: [], updatedAt: Date.now(), order: [] };
}

/** 新建常用语（正文由调用方校验非空） */
export function newSnippet(partial: Partial<Snippet> = {}): Snippet {
  const now = Date.now();
  return {
    id: partial.id ?? crypto.randomUUID(),
    title: (partial.title ?? "").trim(),
    content: partial.content ?? "",
    group: (partial.group ?? "").trim(),
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

/** 当前显示顺序：有 order 用手动顺序，否则 updatedAt 倒序 */
export function sortSnippets(snippets: Snippet[], order?: string[]): Snippet[] {
  return sortByManualOrder(snippets, order);
}

export function resolvedSnippetOrder(snippets: Snippet[], order?: string[]): string[] {
  return resolvedIdOrder(snippets, order);
}

/** 拖动：把 fromId 移到 toId 之前/之后 */
export function moveSnippetId(order: string[], fromId: string, toId: string, after: boolean): string[] {
  return moveId(order, fromId, toId, after);
}

/** 模糊匹配：先子串，再退化为子序列（大小写不敏感） */
function fuzzyHit(text: string, q: string): boolean {
  const t = text.toLowerCase();
  if (t.includes(q)) return true;
  let i = 0;
  for (const ch of t) {
    if (ch === q[i]) i++;
    if (i === q.length) return true;
  }
  return false;
}

/** 搜索 + 分组过滤（可叠加）；group=null 全部，group="" 未分组 */
export function filterSnippets(snippets: Snippet[], query: string, group: string | null): Snippet[] {
  const q = query.trim().toLowerCase();
  return snippets
    .filter((s) => group === null || (s.group || "") === group)
    .filter((s) => !q || fuzzyHit(s.title, q) || fuzzyHit(s.content, q) || fuzzyHit(s.group, q));
}

/** 分组统计（含空分组；按数量降序、名称升序） */
export function snippetGroups(snippets: Snippet[]): Array<{ name: string; count: number }> {
  const map = new Map<string, number>();
  for (const s of snippets) {
    const g = s.group || "";
    map.set(g, (map.get(g) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function toTime(v: unknown, now: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : now;
}

function normalizeSnippet(raw: Record<string, unknown>, now: number): Snippet | null {
  const content = typeof raw.content === "string" ? raw.content : "";
  // 正文必填（保留首尾空白与原换行，仅用 trim 做非空校验）
  if (!content.trim()) return null;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const group = typeof raw.group === "string" ? raw.group.trim() : "";
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : crypto.randomUUID(),
    title,
    content,
    group,
    createdAt: toTime(raw.createdAt, now),
    updatedAt: toTime(raw.updatedAt, now),
  };
}

/** 规范化整库（宿主读取 / 导入共用）：丢弃空正文与重复 id，order 只保留有效 id */
export function normalizeSnippetDb(raw: unknown): SnippetDb {
  const now = Date.now();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("常用语数据格式错误：根节点必须是对象");
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.snippets)) {
    throw new Error("常用语数据格式错误：缺少 snippets 数组");
  }
  const seen = new Set<string>();
  const snippets: Snippet[] = [];
  for (const item of obj.snippets) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const s = normalizeSnippet(item as Record<string, unknown>, now);
    if (!s || seen.has(s.id)) continue;
    seen.add(s.id);
    snippets.push(s);
  }
  const order = Array.isArray(obj.order)
    ? obj.order.filter((v): v is string => typeof v === "string" && seen.has(v))
    : undefined;
  return {
    format: SNIPPETS_FORMAT,
    snippets,
    updatedAt: toTime(obj.updatedAt, now),
    order: order && order.length > 0 ? order : undefined,
  };
}

/** 导出 JSON：按当前显示顺序输出，并写入完整 order，保证迁移后顺序一致 */
export function buildSnippetsJson(db: SnippetDb): string {
  const snippets = sortSnippets(db.snippets, db.order);
  return JSON.stringify(
    {
      format: SNIPPETS_FORMAT,
      snippets,
      updatedAt: db.updatedAt,
      order: resolvedSnippetOrder(db.snippets, db.order),
    },
    null,
    2
  );
}

export interface SnippetImportResult {
  snippets: Snippet[];
  order?: string[];
}

/** 解析导入 JSON：接受整库对象或常用语数组；失败抛错 */
export function parseSnippetsJson(text: string): SnippetImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("JSON 解析失败：不是有效的 NoteVault 常用语导出文件");
  }
  if (Array.isArray(data)) {
    const db = normalizeSnippetDb({ snippets: data, updatedAt: Date.now() });
    if (db.snippets.length === 0) throw new Error("未识别到有效常用语（正文不能为空）");
    return { snippets: db.snippets };
  }
  if (data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).snippets)) {
    const db = normalizeSnippetDb(data);
    if (db.snippets.length === 0) throw new Error("未识别到有效常用语（正文不能为空）");
    return { snippets: db.snippets, order: db.order };
  }
  throw new Error("JSON 解析失败：缺少 snippets 数组");
}

export interface SnippetMergeResult {
  snippets: Snippet[];
  order?: string[];
  added: number;
  updated: number;
  skipped: number;
}

/** 导入合并：merge 按 id 较新者胜、新增按来源顺序追加；replace 整体替换 */
export function mergeSnippets(
  current: Snippet[],
  incoming: Snippet[],
  mode: "merge" | "replace",
  currentOrder?: string[],
  incomingOrder?: string[]
): SnippetMergeResult {
  if (mode === "replace") {
    const snippets = incoming.map((s) => ({ ...s }));
    const order =
      incomingOrder && incomingOrder.length > 0 ? resolvedSnippetOrder(snippets, incomingOrder) : undefined;
    return { snippets, order, added: incoming.length, updated: 0, skipped: 0 };
  }
  const byId = new Map(current.map((s) => [s.id, s]));
  const result = [...current];
  const addedIds: string[] = [];
  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const inc of incoming) {
    const exist = byId.get(inc.id);
    if (!exist) {
      result.push({ ...inc });
      byId.set(inc.id, inc);
      addedIds.push(inc.id);
      added++;
      continue;
    }
    if (inc.updatedAt > exist.updatedAt) {
      const i = result.indexOf(exist);
      result[i] = { ...inc, id: exist.id };
      byId.set(exist.id, result[i]);
      updated++;
    } else {
      skipped++;
    }
  }
  let order: string[] | undefined = currentOrder;
  if (addedIds.length > 0) {
    const base = resolvedSnippetOrder(current, currentOrder);
    const src = incomingOrder && incomingOrder.length > 0 ? incomingOrder : incoming.map((s) => s.id);
    const index = new Map(src.map((id, i) => [id, i]));
    addedIds.sort(
      (a, b) => (index.get(a) ?? Number.MAX_SAFE_INTEGER) - (index.get(b) ?? Number.MAX_SAFE_INTEGER)
    );
    order = [...base, ...addedIds];
  }
  return { snippets: result, order, added, updated, skipped };
}
