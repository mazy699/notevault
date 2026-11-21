/** 活动栏：工作台切换（读取 / 对比，未来新功能 = 新增图标） */
import { BookOpenText, GitCompare } from "lucide-react";
import { useUi } from "../../stores/ui";

export function ActivityBar() {
  const { workbench, setWorkbench } = useUi();

  const btn = (wb: "read" | "diff", title: string, Icon: typeof BookOpenText) => (
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
      <span className="activity-spacer" />
    </div>
  );
}
