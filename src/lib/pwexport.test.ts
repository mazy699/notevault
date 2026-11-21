import { describe, expect, it } from "vitest";
import type { PwDb, PwEntry } from "../../shared/types";
import { buildCsv, buildJson, buildMd, emptyDb, mergeEntries, newEntry, parseCsv, parseImportText } from "./pwexport";

function sampleEntries(): PwEntry[] {
  return [
    newEntry({
      title: "公司邮箱",
      category: "邮箱",
      account: "zhang.san@corp.com",
      password: "P@ss-W0rd-1",
      url: "https://mail.corp.com",
      notes: "每季度轮换",
      updatedAt: Date.parse("2026-11-01T10:00:00"),
      createdAt: Date.parse("2026-01-01T10:00:00"),
      history: [{ password: "Old-Pass-0", changedAt: Date.parse("2026-11-01T10:00:00") }],
    }),
    newEntry({
      title: "OA 系统",
      category: "工号系统",
      account: "ZS0123",
      password: "oA#2026xY",
    }),
  ];
}

describe("密码库导出", () => {
  it("JSON：整库 roundtrip", () => {
    const db: PwDb = { format: "notevault-pw-v1", entries: sampleEntries(), updatedAt: 1 };
    const text = buildJson(db);
    const back = JSON.parse(text);
    expect(back.format).toBe("notevault-pw-v1");
    expect(back.entries.length).toBe(2);
    expect(back.entries[0].history.length).toBe(1);
  });

  it("CSV：转义引号/逗号/换行，历史列 JSON", () => {
    const entries = sampleEntries();
    entries[0].notes = '备注,含"引号"\n第二行';
    const csv = buildCsv(entries);
    const rows = parseCsv(csv.replace(/^\uFEFF/, ""));
    expect(rows.length).toBe(3);
    expect(rows[0][0]).toBe("title");
    expect(rows[1][5]).toBe('备注,含"引号"\n第二行');
    expect(JSON.parse(rows[1][8]).length).toBe(1);
    expect(rows[2][1]).toBe("工号系统");
  });

  it("Markdown：按分类分组、含历史列表", () => {
    const md = buildMd(sampleEntries());
    expect(md).toContain("## 邮箱（1）");
    expect(md).toContain("## 工号系统（1）");
    expect(md).toContain("`P@ss-W0rd-1`");
    expect(md).toContain("历史密码（1）");
    expect(md).toContain("阅后即焚");
  });
});

describe("密码库导入", () => {
  it("JSON 整库/数组均可解析并规范化", () => {
    const db = { format: "notevault-pw-v1", entries: [{ title: "A", account: "a@x.com", password: "p1", history: [{ password: "p0", changedAt: "2026-01-01" }] }] };
    const r = parseImportText(JSON.stringify(db), "pw.json");
    expect(r.format).toBe("json");
    expect(r.entries.length).toBe(1);
    expect(r.entries[0].id).toBeTruthy();
    expect(r.entries[0].history[0].password).toBe("p0");
    const arr = parseImportText(JSON.stringify([{ title: "B", password: "p2" }]));
    expect(arr.entries.length).toBe(1);
  });

  it("CSV 表头映射 + 历史 JSON 列", () => {
    const csv = buildCsv(sampleEntries());
    const r = parseImportText(csv, "pw.csv");
    expect(r.format).toBe("csv");
    expect(r.entries.length).toBe(2);
    expect(r.entries[0].password).toBe("P@ss-W0rd-1");
    expect(r.entries[0].history.length).toBe(1);
  });

  it("非法输入抛错", () => {
    expect(() => parseImportText("not a csv or json")).toThrow(/CSV 解析失败/);
    expect(() => parseImportText("{broken json")).toThrow(/JSON 解析失败/);
  });

  it("无标题且无账号的记录被丢弃", () => {
    const r = parseImportText(JSON.stringify([{ password: "p" }, { title: "keep", password: "q" }]));
    expect(r.entries.length).toBe(1);
    expect(r.entries[0].title).toBe("keep");
  });
});

describe("mergeEntries（合并策略）", () => {
  it("替换模式：整库替换", () => {
    const cur = sampleEntries();
    const inc = [newEntry({ title: "N1" }), newEntry({ title: "N2" })];
    const r = mergeEntries(cur, inc, "replace");
    expect(r.entries.map((e) => e.title)).toEqual(["N1", "N2"]);
    expect(r.added).toBe(2);
  });

  it("合并模式：新追加、id 冲突取较新", () => {
    const cur = sampleEntries();
    const same = { ...cur[0], password: "NEW-PASS", updatedAt: cur[0].updatedAt + 1000 };
    const fresh = newEntry({ title: "新增条目" });
    const r = mergeEntries(cur, [same, fresh], "merge");
    expect(r.entries.length).toBe(3);
    expect(r.updated).toBe(1);
    expect(r.added).toBe(1);
    expect(r.entries.find((e) => e.title === "公司邮箱")!.password).toBe("NEW-PASS");
  });

  it("合并模式：旧记录不覆盖新库", () => {
    const cur = sampleEntries();
    const older = { ...cur[0], password: "OLD", updatedAt: 1 };
    const r = mergeEntries(cur, [older], "merge");
    expect(r.skipped).toBe(1);
    expect(r.entries.find((e) => e.title === "公司邮箱")!.password).toBe("P@ss-W0rd-1");
  });

  it("合并模式：title+account 匹配不同 id 的同一条目", () => {
    const cur = sampleEntries();
    const same = { ...newEntry({ title: "公司邮箱", account: "zhang.san@corp.com", password: "MIGRATED" }), updatedAt: Date.now() + 9999 };
    const r = mergeEntries(cur, [same], "merge");
    expect(r.updated).toBe(1);
    expect(r.entries.length).toBe(2);
    expect(r.entries[0].password).toBe("MIGRATED");
    expect(r.entries[0].id).toBe(cur[0].id); // 保留原 id
  });
});

describe("emptyDb/newEntry", () => {
  it("空库与新条目基础字段", () => {
    expect(emptyDb().entries).toEqual([]);
    const e = newEntry({ title: "T" });
    expect(e.id).toBeTruthy();
    expect(e.category).toBe("其他");
    expect(e.history).toEqual([]);
  });
});
