/** 展示格式化工具 */

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function formatTime(ms: number): string {
  if (!ms) return "—";
  const d = new Date(ms);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function countLines(text: string): number {
  if (!text) return 0;
  let n = 1;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

/** 高亮文本中的命中词（搜索结果片段用），返回 React 需要的结构 */
export function splitByQuery(text: string, query: string): Array<{ part: string; hit: boolean }> {
  if (!query) return [{ part: text, hit: false }];
  const out: Array<{ part: string; hit: boolean }> = [];
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let pos = 0;
  for (;;) {
    const idx = lower.indexOf(q, pos);
    if (idx === -1) break;
    if (idx > pos) out.push({ part: text.slice(pos, idx), hit: false });
    out.push({ part: text.slice(idx, idx + q.length), hit: true });
    pos = idx + q.length;
  }
  if (pos < text.length) out.push({ part: text.slice(pos), hit: false });
  return out;
}
