import { describe, expect, it } from "vitest";
import { classifyPreviewHref } from "./links";

const exists = (set: string[]) => (rel: string) => set.includes(rel);

describe("classifyPreviewHref（HTML 预览链接路由）", () => {
  const files = ["docs/b.html", "docs/img/c.png", "top.md", "docs/sub/d.md"];

  it("同目录相对链接 → 库内路径", () => {
    expect(classifyPreviewHref("b.html", "docs/a.html", exists(files))).toEqual({
      kind: "internal",
      path: "docs/b.html",
    });
  });

  it("../ 相对链接与编码路径", () => {
    expect(classifyPreviewHref("../top.md", "docs/a.html", exists(files))).toEqual({
      kind: "internal",
      path: "top.md",
    });
    expect(classifyPreviewHref("sub/%64.md", "docs/a.html", exists(files))).toEqual({
      kind: "internal",
      path: "docs/sub/d.md",
    });
  });

  it("忽略查询串与哈希", () => {
    expect(classifyPreviewHref("b.html?v=1#sec", "docs/a.html", exists(files))).toEqual({
      kind: "internal",
      path: "docs/b.html",
    });
  });

  it("以 / 开头的库根相对链接", () => {
    expect(classifyPreviewHref("/top.md", "docs/a.html", exists(files))).toEqual({
      kind: "internal",
      path: "top.md",
    });
    expect(classifyPreviewHref("/missing.md", "docs/a.html", exists(files))).toBeNull();
  });

  it("外部链接（http/https/mailto/绝对路径/协议相对）", () => {
    expect(classifyPreviewHref("https://example.com/x", "docs/a.html", exists(files))).toEqual({
      kind: "external",
      href: "https://example.com/x",
    });
    expect(classifyPreviewHref("mailto:a@b.com", "docs/a.html", exists(files))).toEqual({
      kind: "external",
      href: "mailto:a@b.com",
    });
    expect(classifyPreviewHref("C:\\tmp\\x.pdf", "docs/a.html", exists(files))).toEqual({
      kind: "external",
      href: "C:\\tmp\\x.pdf",
    });
    expect(classifyPreviewHref("//cdn.example.com/a.js", "docs/a.html", exists(files))).toEqual({
      kind: "external",
      href: "https://cdn.example.com/a.js",
    });
  });

  it("纯锚点与危险协议忽略（保持页内行为）", () => {
    expect(classifyPreviewHref("#section", "docs/a.html", exists(files))).toBeNull();
    expect(classifyPreviewHref("javascript:alert(1)", "docs/a.html", exists(files))).toBeNull();
    expect(classifyPreviewHref("data:text/html,hi", "docs/a.html", exists(files))).toBeNull();
    expect(classifyPreviewHref("", "docs/a.html", exists(files))).toBeNull();
  });

  it("库内不存在的相对链接忽略（不误开外链）", () => {
    expect(classifyPreviewHref("missing.html", "docs/a.html", exists(files))).toBeNull();
  });
});
