import { describe, expect, it } from "vitest";
import { resolveReportPanel } from "./report-dialog-state";

describe("周报内容面板", () => {
  it("即使未配置 AI，已选中的历史周报也优先显示", () => {
    expect(resolveReportPanel(true, false)).toBe("report");
  });

  it("未选择历史时按配置状态显示生成区或配置提示", () => {
    expect(resolveReportPanel(false, true)).toBe("generator");
    expect(resolveReportPanel(false, false)).toBe("configure");
  });
});
