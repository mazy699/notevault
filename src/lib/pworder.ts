/**
 * 密码库手动排序（Issue #9）：纯函数，便于单测与双宿主共用。
 * - 无 order（旧库）→ 按 updatedAt 倒序；
 * - 有 order → 以 order 为准，order 中缺失的条目按 updatedAt 放在末尾；
 * - 拖动时基于当前显示顺序生成完整 order 快照，之后新增/编辑不再改变既有位置。
 */
import type { PwEntry } from "../../shared/types";

type Orderable = { id: string; updatedAt: number };

/** 通用手动排序：order 缺省时按 updatedAt 倒序；order 中缺失项按 updatedAt 放在末尾 */
export function sortByManualOrder<T extends Orderable>(items: T[], order?: string[]): T[] {
  if (!order || order.length === 0) {
    return [...items].sort((a, b) => b.updatedAt - a.updatedAt);
  }
  const index = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const ia = index.get(a.id);
    const ib = index.get(b.id);
    if (ia === undefined && ib === undefined) return b.updatedAt - a.updatedAt;
    if (ia === undefined) return 1;
    if (ib === undefined) return -1;
    return ia - ib;
  });
}

/** 当前显示顺序的 id 列表（补全 order 缺失/过期项，作为拖动、导入的基础） */
export function resolvedIdOrder<T extends Orderable>(items: T[], order?: string[]): string[] {
  return sortByManualOrder(items, order).map((e) => e.id);
}

/** 按手动顺序排序（不修改入参） */
export function sortPwEntries(entries: PwEntry[], order?: string[]): PwEntry[] {
  return sortByManualOrder(entries, order);
}

/** 密码库当前显示顺序（保留旧导出名） */
export function resolvedOrder(entries: PwEntry[], order?: string[]): string[] {
  return resolvedIdOrder(entries, order);
}

/** 拖动：把 fromId 插到 toId 之前/之后；非法 id 时原样返回 */
export function moveId(order: string[], fromId: string, toId: string, after: boolean): string[] {
  if (fromId === toId) return order;
  if (!order.includes(fromId) || !order.includes(toId)) return order;
  const next = order.filter((id) => id !== fromId);
  const target = next.indexOf(toId);
  next.splice(target + (after ? 1 : 0), 0, fromId);
  return next;
}
