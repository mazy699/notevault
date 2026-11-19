/** 扁平化文件列表 + 模糊匹配（Quick Open 用） */
import type { FileKind } from "../../shared/types";

export interface FlatFile {
  path: string;
  name: string;
  kind: FileKind;
  size: number;
  mtimeMs: number;
}

export function flattenFiles(tree: any): FlatFile[] {
  const out: FlatFile[] = [];
  const stack = [tree];
  while (stack.length) {
    const n = stack.pop();
    if (!n) continue;
    if (!n.dir) {
      out.push({ path: n.path, name: n.name, kind: n.kind, size: n.size, mtimeMs: n.mtimeMs });
    } else if (n.children) {
      for (const c of n.children) stack.push(c);
    }
  }
  return out;
}

export interface FuzzyResult {
  file: FlatFile;
  score: number;
  /** 命中的字符下标（用于高亮） */
  hits: number[];
}

/**
 * 模糊匹配：大小写不敏感的子序列匹配。
 * 得分：连续命中加分、命中靠后位置惩罚、文件名命中优先于路径命中。
 */
export function fuzzyMatch(file: FlatFile, query: string): FuzzyResult | null {
  const q = query.toLowerCase();
  if (!q) return { file, score: 0, hits: [] };
  const name = file.name.toLowerCase();
  const path = file.path.toLowerCase();

  const matchIn = (text: string, base: number): { hits: number[]; score: number } | null => {
    const hits: number[] = [];
    let score = 0;
    let prev = -2;
    for (let i = 0; i < q.length; i++) {
      const idx = text.indexOf(q[i], prev + 1);
      if (idx === -1) return null;
      hits.push(base + idx);
      score += idx === prev + 1 ? 6 : 2; // 连续命中加分
      if (idx === 0 || /[\s._\-/[（(]/.test(text[idx - 1] ?? "")) score += 3; // 词首加分
      prev = idx;
    }
    // 尾部剩余长度惩罚（越早命中越好）
    score -= Math.max(0, text.length - prev - 1) * 0.05;
    return { hits, score };
  };

  // 先试文件名
  const byName = matchIn(name, 0);
  if (byName) {
    return { file, score: byName.score + 20, hits: byName.hits };
  }
  const byPath = matchIn(path, 0);
  if (byPath) {
    return { file, score: byPath.score, hits: byPath.hits };
  }
  return null;
}

export function fuzzySearch(files: FlatFile[], query: string, limit = 60): FuzzyResult[] {
  const results: FuzzyResult[] = [];
  for (const f of files) {
    const r = fuzzyMatch(f, query);
    if (r) results.push(r);
  }
  results.sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path));
  return results.slice(0, limit);
}
