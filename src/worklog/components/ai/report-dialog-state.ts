export type ReportPanel = "report" | "configure" | "generator";

export function resolveReportPanel(hasReport: boolean, configured: boolean): ReportPanel {
  if (hasReport) return "report";
  return configured ? "generator" : "configure";
}
