import { describe, expect, it } from "vitest";
import { joinAbsPath } from "./format";

describe("joinAbsPath（文件完整路径拼接）", () => {
  it("Windows 路径：斜杠统一为反斜杠且不产生双分隔", () => {
    expect(joinAbsPath("D:\\notes", "docs/a.md")).toBe("D:\\notes\\docs\\a.md");
    expect(joinAbsPath("D:\\notes\\", "docs/a.md")).toBe("D:\\notes\\docs\\a.md");
    expect(joinAbsPath("D:\\notes\\\\", "a.md")).toBe("D:\\notes\\a.md");
  });

  it("POSIX 路径", () => {
    expect(joinAbsPath("/home/u/notes", "docs/a.md")).toBe("/home/u/notes/docs/a.md");
    expect(joinAbsPath("/home/u/notes/", "a.md")).toBe("/home/u/notes/a.md");
  });

  it("中文与空格文件名", () => {
    expect(joinAbsPath("D:\\笔记 库", "功能/示例 查询.sql")).toBe("D:\\笔记 库\\功能\\示例 查询.sql");
  });

  it("空基路径原样返回相对路径", () => {
    expect(joinAbsPath("", "a/b.md")).toBe("a/b.md");
  });
});
