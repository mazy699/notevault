import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { freshDb } from "./test-util";
import { createNote, deleteNote, deriveTitle, getNote, listNotes, normalizeTags, toggleNotePin, updateNote } from "./note";

describe("笔记", () => {
  let db: Database;
  beforeAll(async () => {
    db = await freshDb();
  });

  it("标签规范化：分隔/去#/去重/限量", () => {
    expect(normalizeTags("SQL, 调查、#排查  测试")).toEqual(["SQL", "调查", "排查", "测试"]);
    expect(normalizeTags(["a", "a", "", "#b"])).toEqual(["a", "b"]);
    expect(normalizeTags(Array.from({ length: 12 }, (_, i) => `t${i}`)).length).toBe(8);
  });

  it("标题自动提取：取内容首行去 markdown 记号", () => {
    expect(deriveTitle("## 调查结论：连接池打满\n- 细节")).toBe("调查结论：连接池打满");
    expect(deriveTitle("   \n- 第二行开始")).toBe("第二行开始");
  });

  it("创建：内容必填，标题留空自动提取，标签入库", () => {
    const n = createNote(db, { content: "## 库存慢查询结论\n缺联合索引", tags: "SQL, 调查" });
    expect(n.title).toBe("库存慢查询结论");
    expect(n.tags).toEqual(["SQL", "调查"]);
    expect(n.pinned).toBe(false);
    expect(() => createNote(db, { content: "   " })).toThrow();
  });

  it("更新：可改标题/内容/标签，空标题回退自动提取", () => {
    const n = createNote(db, { content: "第一版结论" });
    const u = updateNote(db, n.id, { title: "", content: "第二版结论\n补充数据", tags: ["复查"] });
    expect(u.title).toBe("第二版结论");
    expect(u.tags).toEqual(["复查"]);
    expect(() => updateNote(db, n.id, { content: "  " })).toThrow();
  });

  it("置顶排序：置顶的排最前", async () => {
    const a = createNote(db, { content: "普通笔记甲" });
    const b = createNote(db, { content: "普通笔记乙" });
    toggleNotePin(db, a.id);
    const list = listNotes(db, {});
    expect(list[0].id).toBe(a.id);
    expect(list[0].pinned).toBe(true);
    void b;
  });

  it("搜索与标签筛选", () => {
    const n = createNote(db, { content: "支付回调超时的排查记录", tags: ["SQL", "线上"] });
    createNote(db, { content: " unrelated " });
    expect(listNotes(db, { search: "支付回调" }).some((x) => x.id === n.id)).toBe(true);
    expect(listNotes(db, { search: "不存在关键词" }).length).toBe(0);
    expect(listNotes(db, { tag: "线上" }).some((x) => x.id === n.id)).toBe(true);
    expect(listNotes(db, { tag: "不存在" }).length).toBe(0);
  });

  it("删除", () => {
    const n = createNote(db, { content: "待删除" });
    deleteNote(db, n.id);
    expect(getNote(db, n.id)).toBeNull();
  });
});
