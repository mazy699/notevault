/** 活动栏：工作台切换（按设置启用/禁用）+ 快捷键 tooltip + 设置入口 */
import { BookOpenText, CalendarClock, GitCompare, KeyRound, Settings, StickyNote } from "lucide-react";
import { useUi } from "../../stores/ui";
import { useAppSettings } from "../../stores/appSettings";
import { workbenchActionId, type WorkbenchSwitchId } from "../../lib/shortcuts";

export function ActivityBar() {
  const { workbench, setWorkbench } = useUi();
  const enabled = useAppSettings((s) => s.settings.enabled);
  const shortcuts = useAppSettings((s) => s.settings.shortcuts);

  const btn = (wb: WorkbenchSwitchId, title: string, Icon: typeof BookOpenText) => {
    if (!enabled[wb]) return null;
    const binding = shortcuts[workbenchActionId(wb)];
    return (
      <button
        className={`activity-btn${workbench === wb ? " active" : ""}`}
        title={binding ? `${title} · ${binding}` : title}
        onClick={() => setWorkbench(wb)}
      >
        <Icon size={19} />
      </button>
    );
  };

  return (
    <div className="activity-bar">
      {btn("read", "读取工作台（笔记浏览）", BookOpenText)}
      {btn("diff", "对比工作台（Diff）", GitCompare)}
      {btn("pw", "密码工作台（凭证管理）", KeyRound)}
      {btn("worklog", "工作日志（Worklog）", CalendarClock)}
      {btn("snippets", "常用语工作台（快捷文本）", StickyNote)}
      <span className="activity-spacer" />
      <button
        className={`activity-btn${workbench === "settings" ? " active" : ""}`}
        title="设置"
        onClick={() => setWorkbench("settings")}
      >
        <Settings size={19} />
      </button>
    </div>
  );
}
