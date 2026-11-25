import { describe, expect, it } from "vitest";
import type { Snippet } from "../../shared/types";
import {
  buildSnippetsJson,
  filterSnippets,
  mergeSnippets,
  moveSnippetId,
  normalizeSnippetDb,
  parseSnippetsJson,
  resolvedSnippetOrder,
  snippetGroups,
  sortSnippets,
} from "./snippets";

function sn(id: string, content: string, updatedAt = 100, extra: Partial<Snippet> = {}): Snippet {
  return {
    id,
    title: extra.title ?? "",
    content,
    group: extra.group ?? "",
    createdAt: extra.createdAt ?? 1,
    updatedAt,
  };
}

describe("sortSnippets / moveSnippetId（手动排序）", () => {
  const a = sn("a", "A", 100);
  const b = sn("b", "B", 200);
  const c = sn("c", "C", 300);

  it("无 order 时按 updatedAt 倒序", () => {
    expect(sortSnippets([a, b, c]).map((s) => s.id)).toEqual(["c", "b", "a"]);
  });

  it("有 order 时以手动顺序为准", () => {
    expect(sortSnippets([a, b, c], ["b", "c", "a"]).map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("拖动生成新 order 并补全缺失 id", () => {
    expect(resolvedSnippetOrder([a, b, c])).toEqual(["c", "b", "a"]);
    expect(moveSnippetId(["c", "b", "a"], "a", "c", false)).toEqual(["a", "c", "b"]);
    expect(moveSnippetId(["a", "b", "c"], "a", "b", true)).toEqual(["b", "a", "c"]);
  });
});

describe("filterSnippets（搜索 + 分组）", () => {
  const items = [
    sn("1", "SELECT * FROM users", 1, { title: "查询用户", group: "SQL" }),
    sn("2", "您好，请稍候。", 2, { title: "客服话术", group: "话术" }),
    sn("3", "发送邮件模板", 3, { title: "邮件", group: "话术" }),
    sn("4", "未分组内容", 4),
  ];

  it("对标题/正文/分组做模糊匹配（含子序列）", () => {
    expect(filterSnippets(items, "select", null).map((s) => s.id)).toEqual(["1"]);
    expect(filterSnippets(items, "发模", null).map((s) => s.id)).toEqual(["3"]);
    expect(filterSnippets(items, "话术", null).map((s) => s.id)).toEqual(["2", "3"]);
  });

  it("分组过滤可与搜索叠加；空分组=未分组", () => {
    expect(filterSnippets(items, "", "话术").map((s) => s.id)).toEqual(["2", "3"]);
    expect(filterSnippets(items, "邮件", "话术").map((s) => s.id)).toEqual(["3"]);
    expect(filterSnippets(items, "", "").map((s) => s.id)).toEqual(["4"]);
  });

  it("分组统计含未分组并按数量排序", () => {
    expect(snippetGroups(items)).toEqual([
      { name: "话术", count: 2 },
      { name: "", count: 1 },
      { name: "SQL", count: 1 },
    ]);
  });
});

describe("导入导出", () => {
  it("buildSnippetsJson 按显示顺序导出并补全 order", () => {
    const db = { format: "notevault-snippets-v1" as const, snippets: [sn("a", "A", 1), sn("b", "B", 2)], updatedAt: 3, order: ["a", "b"] };
    const parsed = JSON.parse(buildSnippetsJson(db));
    expect(parsed.snippets.map((s: Snippet) => s.id)).toEqual(["a", "b"]);
    expect(parsed.order).toEqual(["a", "b"]);
  });

  it("parseSnippetsJson 保留正文原始空白并过滤空正文", () => {
    const text = JSON.stringify({
      format: "notevault-snippets-v1",
      snippets: [
        { id: "x", title: "t", content: "  第一行\n\n第二行  ", group: "g", createdAt: 1, updatedAt: 2 },
        { id: "y", content: "   ", group: "" },
      ],
      order: ["y", "x"],
    });
    const r = parseSnippetsJson(text);
    expect(r.snippets).toHaveLength(1);
    expect(r.snippets[0].content).toBe("  第一行\n\n第二行  ");
    expect(r.order).toEqual(["x"]);
  });

  it("parseSnippetsJson 接受数组并拒绝非法 JSON", () => {
    expect(parseSnippetsJson(JSON.stringify([{ id: "a", content: "hi" }])).snippets).toHaveLength(1);
    expect(() => parseSnippetsJson("not-json")).toThrow(/JSON/);
    expect(() => parseSnippetsJson("{}")).toThrow(/snippets/);
  });

  it("normalizeSnippetDb 丢弃重复 id 与非法条目", () => {
    const db = normalizeSnippetDb({
      snippets: [
        { id: "a", content: "one" },
        { id: "a", content: "dup" },
        { id: "b", content: "" },
        { content: "new" },
      ],
      order: ["b", "a", "missing"],
    });
    expect(db.snippets.map((s) => s.content)).toEqual(["one", "new"]);
    expect(db.order).toEqual(["a"]);
  });
});

describe("mergeSnippets（导入合并）", () => {
  const current = [sn("a", "旧内容", 100), sn("b", "B", 100)];
  const incoming = [
    sn("c", "C", 200),
    sn("a", "新内容", 150),
    sn("d", "D", 200),
  ];

  it("merge：较新者更新，新增按来源顺序追加，既有顺序不变", () => {
    const r = mergeSnippets(current, incoming, "merge", ["a", "b"], ["d", "c", "a"]);
    expect(r.added).toBe(2);
    expect(r.updated).toBe(1);
    expect(r.snippets.find((s) => s.id === "a")?.content).toBe("新内容");
    expect(r.order).toEqual(["a", "b", "d", "c"]);
  });

  it("merge：旧数据跳过", () => {
    const r = mergeSnippets(current, [sn("a", "更旧", 50)], "merge");
    expect(r.skipped).toBe(1);
    expect(r.snippets.find((s) => s.id === "a")?.content).toBe("旧内容");
  });

  it("replace：整体替换并采用来源顺序", () => {
    const r = mergeSnippets(current, incoming, "replace", ["a", "b"], ["d", "c"]);
    expect(r.snippets.map((s) => s.id)).toEqual(["c", "a", "d"]);
    expect(r.order).toEqual(["d", "c", "a"]);
    expect(r.added).toBe(3);
  });
});
