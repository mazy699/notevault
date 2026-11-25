/** 活动栏：工作台切换（读取 / 对比 / 密码 / 工作日志 / 常用语，未来新功能 = 新增图标） */
import { BookOpenText, CalendarClock, GitCompare, KeyRound, StickyNote } from "lucide-react";
import { useUi } from "../../stores/ui";

export function ActivityBar() {
  const { workbench, setWorkbench } = useUi();

  const btn = (wb: "read" | "diff" | "pw" | "worklog" | "snippets", title: string, Icon: typeof BookOpenText) => (
    <button
      className={`activity-btn${workbench === wb ? " active" : ""}`}
      title={title}
      onClick={() => setWorkbench(wb)}
    >
      <Icon size={19} />
    </button>
  );

  return (
    <div className="activity-bar">
      {btn("read", "读取工作台（笔记浏览）", BookOpenText)}
      {btn("diff", "对比工作台（Diff）", GitCompare)}
      {btn("pw", "密码工作台（凭证管理）", KeyRound)}
      {btn("worklog", "工作日志（Worklog）", CalendarClock)}
      {btn("snippets", "常用语工作台（快捷文本）", StickyNote)}
      <span className="activity-spacer" />
    </div>
  );
}
