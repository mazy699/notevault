import { describe, expect, it } from "vitest";
import { filterTabs } from "./tabfilter";

const tabs = [
  { name: "README.md", path: "README.md" },
  { name: "主页.md", path: "相对链接测试/主页.md" },
  { name: "详情页.md", path: "相对链接测试/详情页.md" },
];

describe("filterTabs（全部标签搜索）", () => {
  it("空查询返回全部", () => {
    expect(filterTabs(tabs, "   ")).toHaveLength(3);
  });

  it("按文件名/路径匹配且忽略大小写", () => {
    expect(filterTabs(tabs, "readme")).toEqual([tabs[0]]);
    expect(filterTabs(tabs, "相对链接")).toHaveLength(2);
  });

  it("无匹配返回空数组", () => {
    expect(filterTabs(tabs, "不存在")).toEqual([]);
  });
});
