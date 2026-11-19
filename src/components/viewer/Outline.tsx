import { useEffect, useMemo, useState } from "react";
import { PanelRightClose } from "lucide-react";
import { useUi } from "../../stores/ui";

interface OutlineItem {
  id: string;
  text: string;
  level: number;
}

/** 右侧标题大纲（Markdown 渲染视图专用） */
export function Outline() {
  const setOutlineOpen = useUi((s) => s.setOutlineOpen);
  const [items, setItems] = useState<OutlineItem[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  // 依赖：内容变化时重新收集标题
  useEffect(() => {
    const contentEl = document.querySelector<HTMLElement>(".content");
    if (!contentEl) return;
    let raf = 0;
    const collect = () => {
      const heads = Array.from(contentEl.querySelectorAll<HTMLElement>(".markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4"));
      setItems(
        heads
          .filter((h) => h.id)
          .map((h) => ({ id: h.id, text: h.textContent ?? "", level: Number(h.tagName.slice(1)) }))
      );
    };
    // 等渲染完成
    raf = requestAnimationFrame(collect);
    const timer = window.setTimeout(collect, 400);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [version]);

  // 内容/标签切换时重建：监听 .content 的 data-path 与子树变化
  useEffect(() => {
    const contentEl = document.querySelector<HTMLElement>(".content");
    if (!contentEl) return;
    const mo = new MutationObserver(() => setVersion((v) => v + 1));
    mo.observe(contentEl, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  // 滚动位置 → 当前标题
  useEffect(() => {
    const contentEl = document.querySelector<HTMLElement>(".content");
    if (!contentEl) return;
    const onScroll = () => {
      const heads = contentEl.querySelectorAll<HTMLElement>(".markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4");
      // 以内容区顶部为基准判定当前位置（阈值 46px）
      const contentTop = contentEl.getBoundingClientRect().top;
      let cur: string | null = null;
      heads.forEach((h) => {
        if (h.getBoundingClientRect().top < contentTop + 46) cur = h.id;
      });
      setCurrent(cur);
    };
    contentEl.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => contentEl.removeEventListener("scroll", onScroll);
  }, [items]);

  const tree = useMemo(() => items, [items]);

  if (tree.length === 0) return null;

  return (
    <div className="outline">
      <div className="outline-title">
        大纲
        <button className="icon-btn" style={{ float: "right", height: 20, minWidth: 20 }} title="收起大纲" onClick={() => setOutlineOpen(false)}>
          <PanelRightClose size={13} />
        </button>
      </div>
      <div className="outline-scroll">
        {tree.map((it) => (
          <button
            key={it.id}
            className={`outline-item${current === it.id ? " current" : ""}`}
            style={{ paddingLeft: 8 + (it.level - 1) * 12 }}
            title={it.text}
            onClick={() => document.getElementById(it.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            {it.text}
          </button>
        ))}
      </div>
    </div>
  );
}
