/** 在 DOM 容器内定位文本并滚动（全文搜索跳转用，尽力而为） */

function normalize(s: string): string {
  return s.replace(/\s+/g, "");
}

/** 在容器中查找包含目标文本的元素，滚动到可视区并短暂高亮 */
export function locateTextInContent(root: Element | null, rawText: string): boolean {
  if (!root) return false;
  // 命中片段带省略号与可能被 markdown 语法干扰，取中间较长的净文本尝试
  let target = rawText.replace(/^…/, "").replace(/…$/, "").trim();
  if (target.length > 60) target = target.slice(10, 50); // 取中段，避开片段边界截断
  if (!target) return false;
  const needle = normalize(target);
  if (!needle) return false;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = normalize(node.textContent ?? "");
    if (text && text.includes(needle)) {
      const el = (node.parentElement as HTMLElement | null) ?? undefined;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("locate-flash");
        setTimeout(() => el.classList.remove("locate-flash"), 1800);
        return true;
      }
    }
    node = walker.nextNode();
  }
  return false;
}
