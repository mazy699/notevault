import { describe, expect, it } from "vitest";
import type { PwEntry } from "../../shared/types";
import { moveId, resolvedOrder, sortPwEntries } from "./pworder";

function entry(id: string, updatedAt: number): PwEntry {
  return {
    id,
    title: id,
    category: "其他",
    account: "",
    password: "",
    updatedAt,
    createdAt: updatedAt,
    history: [],
  };
}

const a = entry("a", 100);
const b = entry("b", 200);
const c = entry("c", 300);

describe("sortPwEntries（密码列表排序）", () => {
  it("无 order 时按 updatedAt 倒序（旧库兼容）", () => {
    expect(sortPwEntries([a, b, c]).map((e) => e.id)).toEqual(["c", "b", "a"]);
  });

  it("有 order 时以手动顺序为准，不受 updatedAt 影响", () => {
    expect(sortPwEntries([a, b, c], ["b", "a", "c"]).map((e) => e.id)).toEqual(["b", "a", "c"]);
  });

  it("order 缺失的条目按 updatedAt 放在末尾", () => {
    expect(sortPwEntries([a, b, c], ["a"]).map((e) => e.id)).toEqual(["a", "c", "b"]);
  });

  it("order 中过期 id 被忽略", () => {
    expect(sortPwEntries([a, b], ["gone", "b", "a"]).map((e) => e.id)).toEqual(["b", "a"]);
  });
});

describe("resolvedOrder / moveId（拖动排序）", () => {
  it("resolvedOrder 生成完整 id 快照（无 order 时按 updatedAt）", () => {
    expect(resolvedOrder([a, b, c])).toEqual(["c", "b", "a"]);
    expect(resolvedOrder([a, b, c], ["a", "c"])).toEqual(["a", "c", "b"]);
  });

  it("向下拖动插到目标之后", () => {
    expect(moveId(["a", "b", "c"], "a", "b", true)).toEqual(["b", "a", "c"]);
    expect(moveId(["a", "b", "c"], "a", "c", true)).toEqual(["b", "c", "a"]);
  });

  it("向上拖动插到目标之前", () => {
    expect(moveId(["a", "b", "c"], "c", "a", false)).toEqual(["c", "a", "b"]);
  });

  it("非法 id / 自身拖动时保持原顺序", () => {
    expect(moveId(["a", "b"], "x", "a", false)).toEqual(["a", "b"]);
    expect(moveId(["a", "b"], "a", "a", false)).toEqual(["a", "b"]);
  });
});
