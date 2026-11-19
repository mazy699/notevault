import { X } from "lucide-react";
import { useTabs } from "../../stores/tabs";
import { KindIcon } from "../common/KindIcon";

export function TabBar() {
  const { tabs, active, setActive, closeTab, closeOthers } = useTabs();
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
            // 简易右键菜单：关闭其他
            const menu = document.createElement("div");
            menu.className = "dropdown";
            menu.style.top = `${e.clientY + 2}px`;
            menu.style.left = `${e.clientX}px`;
            menu.innerHTML = `
              <button class="item" data-act="close">关闭标签</button>
              <button class="item" data-act="others">关闭其他标签</button>
              <button class="item" data-act="copy">复制文件路径</button>`;
            document.body.appendChild(menu);
            const onDown = (ev: MouseEvent) => {
              const el = (ev.target as HTMLElement).closest("[data-act]") as HTMLElement | null;
              if (el) {
                if (el.dataset.act === "close") closeTab(t.path);
                if (el.dataset.act === "others") closeOthers(t.path);
                if (el.dataset.act === "copy") void navigator.clipboard.writeText(t.path);
              }
              menu.remove();
              document.removeEventListener("mousedown", onDown);
            };
            setTimeout(() => document.addEventListener("mousedown", onDown), 0);
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
