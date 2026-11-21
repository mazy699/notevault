import { describe, expect, it } from "vitest";
import { buildDiffRows, foldRows, expandFold, FOLD_MIN, FOLD_CONTEXT } from "./diff";
import type { DiffItem } from "./diff";

describe("buildDiffRows", () => {
  it("相同文本：全部 equal 行，行号对齐", () => {
    const { rows, addCount, delCount } = buildDiffRows("a\nb\nc", "a\nb\nc");
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.type === "equal")).toBe(true);
    expect(rows[0]).toMatchObject({ oldNo: 1, newNo: 1, oldText: "a" });
    expect(addCount).toBe(0);
    expect(delCount).toBe(0);
  });

  it("末尾新增行", () => {
    const { rows, addCount } = buildDiffRows("a\nb", "a\nb\nc");
    expect(addCount).toBe(1);
    const last = rows[rows.length - 1];
    expect(last.type).toBe("add");
    expect(last.newNo).toBe(3);
    expect(last.oldNo).toBeNull();
  });

  it("末尾删除行", () => {
    const { rows, delCount } = buildDiffRows("a\nb\nc", "a\nb");
    expect(delCount).toBe(1);
    const last = rows[rows.length - 1];
    expect(last.type).toBe("del");
    expect(last.oldNo).toBe(3);
    expect(last.newNo).toBeNull();
  });

  it("中间修改 → replace 行且生成行内差异段", () => {
    const { rows } = buildDiffRows("const a = 1;", "const a = 2;");
    const rep = rows.find((r) => r.type === "replace");
    expect(rep).toBeDefined();
    expect(rep!.oldSegs).not.toBeNull();
    expect(rep!.newSegs).not.toBeNull();
    // 变更段应包含被修改的部分
    expect(rep!.newSegs!.some((s) => s.changed && s.text.includes("2"))).toBe(true);
  });

  it("删除+新增混合：按序 zip 配对", () => {
    const { rows } = buildDiffRows("a\nb\nc\nd", "a\nx\ny\nd");
    // b,c → x,y 是相邻删除+新增
    const rep = rows.filter((r) => r.type === "replace" || r.type === "del" || r.type === "add");
    expect(rep.length).toBeGreaterThan(0);
    // 相同行 a、d 保持行号对齐
    const a = rows.find((r) => r.oldText === "a");
    expect(a).toMatchObject({ oldNo: 1, newNo: 1, type: "equal" });
    const d = rows.find((r) => r.oldText === "d");
    expect(d).toMatchObject({ oldNo: 4, newNo: 4, type: "equal" });
  });

  it("纯新增多于删除：多出的行右侧留空", () => {
    const { rows } = buildDiffRows("a\nb", "a\nx\ny\nz");
    const adds = rows.filter((r) => r.type === "add");
    expect(adds.length).toBe(2);
    expect(adds[0].oldNo).toBeNull();
    expect(adds[0].newNo).toBe(3);
  });

  it("忽略空白：仅空白差异视为相同（但显示原文）", () => {
    const { rows } = buildDiffRows("const  a=1;", "const a=1;   ", { ignoreWhitespace: true });
    const rep = rows.filter((r) => r.type === "replace");
    expect(rep.length).toBe(0);
    expect(rows[0].oldText).toBe("const  a=1;");
    expect(rows[0].newText).toBe("const a=1;   ");
  });

  it("空文本与有内容文本", () => {
    const { rows } = buildDiffRows("", "a\nb");
    // 空字符串 split 后 [""]，与 a、b 配对 → replace + add
    expect(rows.length).toBe(2);
    expect(rows[0].type).toBe("replace");
    expect(rows[1].type).toBe("add");
  });

  it("超过 MAX_ROWS 截断", () => {
    const big = Array.from({ length: 50000 }, (_, i) => `line ${i}`).join("\n");
    const { rows, truncated } = buildDiffRows(big, big);
    expect(truncated).toBe(true);
    expect(rows.length).toBeLessThanOrEqual(20000);
  });
});

describe("foldRows", () => {
  function makeEquals(n: number) {
    const old = Array.from({ length: n }, (_, i) => `L${i}`).join("\n");
    return buildDiffRows(old, old).rows;
  }

  it("短于阈值不折叠", () => {
    const rows = makeEquals(FOLD_MIN);
    const items = foldRows(rows);
    expect(items.every((i) => i.kind === "row")).toBe(true);
  });

  it("超过阈值折叠为 上文+折叠条+下文", () => {
    const n = 30;
    const rows = makeEquals(n);
    const items = foldRows(rows);
    const foldIdx = items.findIndex((i) => i.kind === "fold");
    expect(foldIdx).toBeGreaterThan(0);
    expect(foldIdx).toBeLessThan(items.length - 1);
    const fold = items[foldIdx] as { kind: "fold"; group: { count: number; rows: unknown[] } };
    expect(fold.group.count).toBe(n - FOLD_CONTEXT * 2);
    expect(items[foldIdx - 1].kind).toBe("row");
    expect(items[foldIdx + 1].kind).toBe("row");
  });

  it("expandAll 展开全部", () => {
    const rows = makeEquals(30);
    const items = foldRows(rows, true);
    expect(items.some((i) => i.kind === "fold")).toBe(false);
  });

  it("replace 行打断折叠", () => {
    // 两段长 equal 中间隔一个 replace
    const old = [...Array.from({ length: 12 }, (_, i) => `A${i}`), "CHANGED", ...Array.from({ length: 12 }, (_, i) => `B${i}`)].join("\n");
    const neu = old.replace("CHANGED", "CHANGED2");
    const rows = buildDiffRows(old, neu).rows;
    const items = foldRows(rows);
    const folds = items.filter((i) => i.kind === "fold");
    expect(folds.length).toBe(2); // 被中间的 replace 分成两段
  });

  it("expandFold 展开保持其余条目", () => {
    const rows = makeEquals(30);
    const items = foldRows(rows);
    const foldIdx = items.findIndex((i) => i.kind === "fold");
    const fold = items[foldIdx] as Extract<DiffItem, { kind: "fold" }>;
    const expanded = expandFold(items, fold.group);
    expect(expanded.length).toBe(items.length - 1 + fold.group.rows.length);
    expect(expanded.some((i) => i.kind === "fold")).toBe(false);
  });
});

import { lineStatuses } from "./diff";

describe("lineStatuses（文本双框即时高亮）", () => {
  it("相同文本：全部 same", () => {
    const r = lineStatuses("a\nb\n", "a\nb");
    expect(r.oldLines.every((l) => l.status === "same")).toBe(true);
    expect(r.newLines.every((l) => l.status === "same")).toBe(true);
    expect(r.addCount).toBe(0);
    expect(r.delCount).toBe(0);
  });

  it("修改行配对为 mod 并携带行内差异段", () => {
    const r = lineStatuses("keep\nconst a = 1;\n", "keep\nconst a = 2;\n");
    expect(r.oldLines[1].status).toBe("mod");
    expect(r.newLines[1].status).toBe("mod");
    expect(r.modCount).toBe(1);
    expect(r.delCount).toBe(0);
    expect(r.addCount).toBe(0);
    // 行内段：旧行含 changed 段（旧值），新行含 changed 段（新值）
    expect(r.oldLines[1].segs).not.toBeNull();
    expect(r.newLines[1].segs).not.toBeNull();
    const oldChanged = r.oldLines[1].segs!.filter((s) => s.changed).map((s) => s.text).join("");
    const newChanged = r.newLines[1].segs!.filter((s) => s.changed).map((s) => s.text).join("");
    expect(oldChanged).toContain("1");
    expect(newChanged).toContain("2");
  });

  it("删除/新增行正确标注（不配对时保持 del/add）", () => {
    const r = lineStatuses("keep\nonly-old\n", "keep\nonly-new-1\nonly-new-2\n");
    expect(r.oldLines).toEqual([
      { text: "keep", status: "same", segs: null },
      { text: "only-old", status: "mod", segs: expect.anything() },
    ]);
    expect(r.newLines[1].status).toBe("mod");
    expect(r.newLines[2].status).toBe("add");
    expect(r.delCount).toBe(0);
    expect(r.addCount).toBe(1);
    expect(r.modCount).toBe(1);
  });

  it("纯删除行保持 del", () => {
    const r = lineStatuses("a\ngone\nb\n", "a\nb\n");
    expect(r.oldLines[1].status).toBe("del");
    expect(r.oldLines[1].segs).toBeNull();
    expect(r.newLines.every((l) => l.status !== "del")).toBe(true);
    expect(r.delCount).toBe(1);
    expect(r.modCount).toBe(0);
  });

  it("忽略空白：空白差异视为 same", () => {
    const r = lineStatuses("a  b\n", "a b\n", true);
    expect(r.oldLines.every((l) => l.status === "same")).toBe(true);
    expect(r.newLines.every((l) => l.status === "same")).toBe(true);
    expect(r.modCount).toBe(0);
  });

  it("CRLF 归一化", () => {
    const r = lineStatuses("a\r\nb\r\n", "a\nb\n");
    expect(r.oldLines.length).toBe(2);
    expect(r.delCount).toBe(0);
  });
});
