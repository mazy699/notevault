import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { useVault } from "../../stores/vault";
import { useTabs } from "../../stores/tabs";
import { formatBytes, formatTime, countLines } from "../../lib/format";

export function StatusBar() {
  const info = useVault((s) => s.info);
  const { active, tabs, content } = useTabs();
  const tab = tabs.find((t) => t.path === active);
  const fc = tab ? content[tab.path] : null;
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    const onFlash = (e: Event) => {
      setFlash((e as CustomEvent).detail ?? "已刷新");
      setTimeout(() => setFlash(null), 1600);
    };
    window.addEventListener("nv-flash-refresh", onFlash);
    return () => window.removeEventListener("nv-flash-refresh", onFlash);
  }, []);

  return (
    <div className="statusbar">
      <span
        className="clickable"
        title="点击复制笔记库路径"
        onClick={() => void navigator.clipboard.writeText(info?.path ?? "")}
      >
        <FolderOpen size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
        {info?.path ?? "未选择笔记库"}
      </span>
      {flash && <span className="flash">✓ {flash}</span>}
      <span className="spacer" />
      {tab && (
        <>
          <span title={tab.path}>{tab.path}</span>
          <span>{formatBytes(fc?.size ?? tab.size)}</span>
          {fc?.mtimeMs ? <span>修改 {formatTime(fc.mtimeMs)}</span> : null}
          {fc && <span>{countLines(fc.content)} 行</span>}
        </>
      )}
    </div>
  );
}
