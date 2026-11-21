import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { freshDb } from "./test-util";
import { deleteReport, getReport, listReports, saveReport, updateReportContent } from "./report";

describe("周报存储", () => {
  let db: Database;
  beforeAll(async () => {
    db = await freshDb();
  });

  it("保存、编辑并删除指定周报", () => {
    const saved = saveReport(db, {
      type: "weekly",
      rangeStart: "2026-09-14",
      rangeEnd: "2026-09-20",
      model: "test-model",
      content: "完整明细",
      summaryContent: "简洁版",
    });

    expect(listReports(db, "weekly")).toHaveLength(1);
    expect(getReport(db, saved.id)?.summaryContent).toBe("简洁版");

    const updated = updateReportContent(db, saved.id, "新的明细", "新的简洁版");
    expect(updated.content).toBe("新的明细");
    expect(updated.summaryContent).toBe("新的简洁版");

    deleteReport(db, saved.id);
    expect(getReport(db, saved.id)).toBeNull();
    expect(listReports(db, "weekly")).toEqual([]);
  });
});
