import { describe, expect, it } from "vitest";
import {
  decodeText,
  findMatches,
  naturalCompare,
  normalizeRelPath,
  stripHtmlTags,
} from "./fscore";
import { kindOf, isTextKind } from "./types";

describe("normalizeRelPath", () => {
  it("规范化反斜杠与 ./ 前缀", () => {
    expect(normalizeRelPath("a\\b\\c.md")).toBe("a/b/c.md");
    expect(normalizeRelPath("./a/b.md")).toBe("a/b.md");
    expect(normalizeRelPath("/a/b.md")).toBe("a/b.md");
    expect(normalizeRelPath("a/./b.md")).toBe("a/b.md");
  });

  it("拒绝目录穿越", () => {
    expect(normalizeRelPath("../secret.txt")).toBeNull();
    expect(normalizeRelPath("a/../../b.txt")).toBeNull();
  });

  it("拒绝 Windows 非法字符", () => {
    expect(normalizeRelPath("a<b>.md")).toBeNull();
    expect(normalizeRelPath('a:"b".md')).toBeNull();
  });

  it("空路径返回空串", () => {
    expect(normalizeRelPath("")).toBe("");
    expect(normalizeRelPath("  ")).toBe("");
  });
});

describe("decodeText", () => {
  it("UTF-8 正常解码", () => {
    const bytes = new TextEncoder().encode("# 标题\n内容 hello");
    expect(decodeText(bytes)).toEqual({ content: "# 标题\n内容 hello", encoding: "utf-8" });
  });

  it("剥离 UTF-8 BOM", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("# 标题")]);
    expect(decodeText(bytes).content).toBe("# 标题");
  });

  it("GBK 回退解码", () => {
    // "中文测试" 的 GBK 编码
    const bytes = new Uint8Array([0xd6, 0xd0, 0xce, 0xc4, 0xb2, 0xe2, 0xca, 0xd4]);
    const r = decodeText(bytes);
    expect(r.encoding).toBe("gbk");
    expect(r.content).toBe("中文测试");
  });

  it("二进制内容返回空", () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04]);
    expect(decodeText(bytes).encoding).toBe("binary");
    expect(decodeText(bytes).content).toBe("");
  });
});

describe("findMatches", () => {
  const text = ["第一行没有", "这里有 keyword 在中间", "keyword 又出现了", "KEYWORD 大写也命中"].join("\n");

  it("不区分大小写统计命中并带行号", () => {
    const m = findMatches(text, "keyword");
    expect(m.length).toBe(3);
    expect(m[0].line).toBe(2);
    expect(m[1].line).toBe(3);
    expect(m[2].line).toBe(4);
    expect(m[0].text).toContain("keyword");
  });

  it("片段裁剪带省略号", () => {
    const long = "x".repeat(200) + "命中词" + "y".repeat(200);
    const m = findMatches(long, "命中词");
    expect(m[0].text.startsWith("…")).toBe(true);
    expect(m[0].text.endsWith("…")).toBe(true);
    expect(m[0].text.length).toBeLessThan(200);
  });

  it("限制单文件命中数", () => {
    const many = Array.from({ length: 100 }, (_, i) => `行${i} keyword`).join("\n");
    expect(findMatches(many, "keyword").length).toBe(8);
  });

  it("空查询返回空", () => {
    expect(findMatches(text, "  ")).toEqual([]);
  });
});

describe("stripHtmlTags", () => {
  it("剥离标签保留文本与换行", () => {
    const html = "<html><head><title>T</title></head><body><h1>标题</h1><p>段落内容</p><script>var x=1;</script></body></html>";
    const out = stripHtmlTags(html);
    expect(out).toContain("标题");
    expect(out).toContain("段落内容");
    expect(out).not.toContain("var x=1");
    expect(out).not.toContain("<h1>");
    expect(out).not.toContain("T"); // title 内容与 script 一样被整体清空
  });

  it("还原常见实体", () => {
    expect(stripHtmlTags("<p>a &lt; b &amp; c</p>").trim()).toBe("a < b & c");
  });
});

describe("naturalCompare", () => {
  it("目录优先", () => {
    expect(naturalCompare("docs", "apple.md", true, false)).toBeLessThan(0);
  });
  it("数字按数值比较", () => {
    expect(naturalCompare("file2.md", "file10.md")).toBeLessThan(0);
    expect(naturalCompare("file10.md", "file9.md")).toBeGreaterThan(0);
  });
  it("中文按拼音排序", () => {
    const arr = ["贝塔", "阿尔法", "伽马"];
    arr.sort((a, b) => naturalCompare(a, b));
    expect(arr).toEqual(["阿尔法", "贝塔", "伽马"]);
  });
});

describe("kindOf", () => {
  it("按扩展名分类", () => {
    expect(kindOf("a.md")).toBe("markdown");
    expect(kindOf("a.MARKDOWN")).toBe("markdown");
    expect(kindOf("b.html")).toBe("html");
    expect(kindOf("c.txt")).toBe("text");
    expect(kindOf("d.png")).toBe("image");
    expect(kindOf("e.unknown")).toBe("other");
    expect(isTextKind(kindOf("f.md"))).toBe(true);
    expect(isTextKind(kindOf("g.png"))).toBe(false);
  });
});
