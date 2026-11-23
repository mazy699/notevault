import { X } from "lucide-react";
import { useTabs } from "../../stores/tabs";
import { useVault } from "../../stores/vault";
import { KindIcon } from "../common/KindIcon";
import { openFileCopyMenu } from "../common/FileCopyMenu";
import { joinAbsPath } from "../../lib/format";

export function TabBar() {
  const { tabs, active, setActive, closeTab, closeOthers } = useTabs();
  const vaultPath = useVault((s) => s.info?.path ?? "");
  if (tabs.length === 0) return null;
  return (
    <div className="tabbar">
      {tabs.map((t) => (
        <div
          key={t.path}
          className={`tab${active === t.path ? " active" : ""}`}
          onClick={() => setActive(t.path)}
          onAuxClick={(e) => {
            if (e.button === 1) closeTab(t.path);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            openFileCopyMenu(e.clientX, e.clientY, {
              name: t.name,
              relPath: t.path,
              absPath: joinAbsPath(vaultPath, t.path),
              onClose: () => closeTab(t.path),
              onCloseOthers: () => closeOthers(t.path),
            });
          }}
          title={t.path}
        >
          <KindIcon kind={t.kind} />
          <span className="t-name">{t.name}</span>
          <span
            className="t-close"
            onClick={(e) => {
              e.stopPropagation();
              closeTab(t.path);
            }}
          >
            <X size={12} />
          </span>
        </div>
      ))}
    </div>
  );
}
