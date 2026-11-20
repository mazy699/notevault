/**
 * Diff 引擎：基于 jsdiff 的行配对模型 + 折叠 + 行内差异。
 * 纯函数、无 DOM 依赖，供对比工作台渲染层使用。
 */
import { diffChars, diffArrays } from "diff";

export type ChangeType = "equal" | "add" | "del" | "replace";

export interface InlineSeg {
  text: string;
  changed: boolean;
}

export interface DiffRow {
  type: ChangeType | "empty";
  /** 旧行号（1-based；无旧行为 null） */
  oldNo: number | null;
  /** 新行号 */
  newNo: number | null;
  oldText: string;
  newText: string;
  /** 行内差异段（仅 replace 行；null 表示无） */
  oldSegs: InlineSeg[] | null;
  newSegs: InlineSeg[] | null;
}

export interface FoldGroup {
  /** 该折叠组内被隐藏的行数（单侧行数） */
  count: number;
  /** 展开状态（由调用方维护） */
  expanded: boolean;
  /** 折叠前的原始行（展开时渲染） */
  rows: DiffRow[];
}

export type DiffItem = { kind: "row"; row: DiffRow } | { kind: "fold"; group: FoldGroup };

/** 折叠上下文行数 */
export const FOLD_CONTEXT = 3;
/** 触发折叠的最小连续未变更行数 */
export const FOLD_MIN = 8;
/** 行内差异的行数上限（超出跳过行内高亮） */
export const INLINE_LIMIT = 500;
/** 单行长度上限（超出不做行内差异） */
export const INLINE_MAX_LINE = 1000;
/** 渲染行数上限 */
export const MAX_ROWS = 20000;

/** 比较用行规范化 */
function normLine(line: string, ignoreWhitespace: boolean): string {
  return ignoreWhitespace ? line.replace(/\s+/g, " ").trim() : line;
}

/** 生成行内差异段 */
function inlineSegs(oldLine: string, newLine: string): { oldSegs: InlineSeg[]; newSegs: InlineSeg[] } {
  const parts = diffChars(oldLine, newLine);
  return {
    oldSegs: parts.filter((p) => !p.added).map((p) => ({ text: p.value, changed: !!p.removed })),
    newSegs: parts.filter((p) => !p.removed).map((p) => ({ text: p.value, changed: !!p.added })),
  };
}

export interface BuildOptions {
  ignoreWhitespace?: boolean;
}

/** 行配对模型：equal → 双侧同行；相邻 add/del → zip 配对（多出侧留空） */
export function buildDiffRows(oldText: string, newText: string, opts: BuildOptions = {}): {
  rows: DiffRow[];
  truncated: boolean;
  addCount: number;
  delCount: number;
} {
  const oldLines = oldText.replace(/\r\n/g, "\n").split("\n");
  const newLines = newText.replace(/\r\n/g, "\n").split("\n");
  // 末尾空行（split 产生）若无对应内容则去掉，避免显示多余空行
  if (oldLines.length > 1 && oldLines[oldLines.length - 1] === "") oldLines.pop();
  if (newLines.length > 1 && newLines[newLines.length - 1] === "") newLines.pop();

  const ignoreWhitespace = !!opts.ignoreWhitespace;
  // 不用 diffArrays 的 comparator——它会把视为相同的行用新文本填充两侧，丢失旧文本；
  // 忽略空白在 zip 配对阶段用 normLine 判断，保留双侧原文。
  const groups = diffArrays(oldLines, newLines);
  const rows: DiffRow[] = [];
  let oldNo = 0;
  let newNo = 0;
  let addCount = 0;
  let delCount = 0;
  let truncated = false;

  const push = (row: Omit<DiffRow, "oldSegs" | "newSegs"> & { oldSegs?: InlineSeg[] | null; newSegs?: InlineSeg[] | null }) => {
    if (rows.length >= MAX_ROWS) {
      truncated = true;
      return;
    }
    rows.push({
      oldSegs: row.oldSegs ?? null,
      newSegs: row.newSegs ?? null,
      type: row.type,
      oldNo: row.oldNo,
      newNo: row.newNo,
      oldText: row.oldText,
      newText: row.newText,
    });
  };

  for (let g = 0; g < groups.length; g++) {
    const grp = groups[g];
    if (!grp.added && !grp.removed) {
      // 相同行
      for (const line of grp.value) {
        oldNo++;
        newNo++;
        push({ type: "equal", oldNo, newNo, oldText: line, newText: line });
      }
      continue;
    }
    if (grp.removed) {
      const next = groups[g + 1];
      if (next && next.added) {
        // 删除+新增相邻 → replace，zip 配对
        const olds = grp.value;
        const news = next.value;
        const max = Math.max(olds.length, news.length);
        let inlineDone = 0;
        for (let i = 0; i < max; i++) {
          oldNo += i < olds.length ? 1 : 0;
          newNo += i < news.length ? 1 : 0;
          const o = i < olds.length ? olds[i] : "";
          const n = i < news.length ? news[i] : "";
          const paired = i < olds.length && i < news.length;
          const changed = paired && normLine(o, ignoreWhitespace) !== normLine(n, ignoreWhitespace);
          const type: ChangeType = !paired ? (i < olds.length ? "del" : "add") : changed ? "replace" : "equal";
          let oldSegs: InlineSeg[] | null = null;
          let newSegs: InlineSeg[] | null = null;
          if (changed && inlineDone < INLINE_LIMIT && o.length <= INLINE_MAX_LINE && n.length <= INLINE_MAX_LINE) {
            const segs = inlineSegs(o, n);
            oldSegs = segs.oldSegs;
            newSegs = segs.newSegs;
            inlineDone++;
          }
          push({
            type,
            oldNo: i < olds.length ? oldNo : null,
            newNo: i < news.length ? newNo : null,
            oldText: o,
            newText: n,
            oldSegs,
            newSegs,
          });
          if (type === "add") addCount++;
          else if (type === "del") delCount++;
        }
        g++; // 跳过已消费的 added 组
        continue;
      }
      // 纯删除
      for (const line of grp.value) {
        oldNo++;
        delCount++;
        push({ type: "del", oldNo, newNo: null, oldText: line, newText: "" });
      }
      continue;
    }
    // 纯新增
    for (const line of grp.value) {
      newNo++;
      addCount++;
      push({ type: "add", oldNo: null, newNo, oldText: "", newText: line });
    }
  }

  return { rows, truncated, addCount, delCount };
}

/** 折叠：连续未变更行超过阈值时折叠为一条横条（保留上下文） */
export function foldRows(rows: DiffRow[], expandAll = false): DiffItem[] {
  const items: DiffItem[] = [];
  let buf: DiffRow[] = [];

  const flushEqual = () => {
    if (buf.length === 0) return;
    if (expandAll || buf.length <= FOLD_MIN) {
      for (const r of buf) items.push({ kind: "row", row: r });
    } else {
      const head = buf.slice(0, FOLD_CONTEXT);
      const tail = buf.slice(buf.length - FOLD_CONTEXT);
      for (const r of head) items.push({ kind: "row", row: r });
      items.push({ kind: "fold", group: { count: buf.length - FOLD_CONTEXT * 2, expanded: false, rows: buf.slice(FOLD_CONTEXT, buf.length - FOLD_CONTEXT) } });
      for (const r of tail) items.push({ kind: "row", row: r });
    }
    buf = [];
  };

  for (const r of rows) {
    if (r.type === "equal" || r.type === "replace") {
      // replace 行包含变更，属于"上下文外"内容？——replace 含变更，不折叠
      if (r.type === "replace") {
        flushEqual();
        items.push({ kind: "row", row: r });
      } else {
        buf.push(r);
      }
    } else {
      flushEqual();
      items.push({ kind: "row", row: r });
    }
  }
  flushEqual();
  return items;
}

/** 展开一个折叠组后的新条目列表 */
export function expandFold(items: DiffItem[], group: FoldGroup): DiffItem[] {
  const out: DiffItem[] = [];
  for (const it of items) {
    if (it.kind === "fold" && it.group === group) {
      for (const r of group.rows) out.push({ kind: "row", row: r });
    } else {
      out.push(it);
    }
  }
  return out;
}

export { diffChars };
