/** 活动栏：工作台切换（读取 / 对比，未来新功能 = 新增图标） */
import { BookOpenText, Moon, Sun, GitCompare } from "lucide-react";
import { useUi } from "../../stores/ui";

export function ActivityBar() {
  const { workbench, setWorkbench, theme, toggleTheme } = useUi();

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
      <button
        className="activity-btn"
        title={theme === "dark" ? "切换浅色主题" : "切换深色主题"}
        onClick={toggleTheme}
      >
        {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
      </button>
    </div>
  );
}
