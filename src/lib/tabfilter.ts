/** 标签页搜索过滤（Issue #8）：按文件名或相对路径做大小写不敏感匹配 */
export function filterTabs<T extends { name: string; path: string }>(tabs: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return tabs;
  return tabs.filter((t) => t.name.toLowerCase().includes(q) || t.path.toLowerCase().includes(q));
}
