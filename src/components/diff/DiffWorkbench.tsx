import { useEffect, useState } from "react";
import {
  ArrowLeftRight,
  Check,
  FolderGit2,
  GitCompare,
  Loader2,
  Play,
} from "lucide-react";
import {
  buildDiffRows,
  expandFold,
  foldRows,
  type DiffItem,
  type DiffRow,
  type FoldGroup,
} from "../../lib/diff";
import { api } from "../../api/client";

type Mode = "file" | "text" | "git";
type ViewKind = "side" | "unified";

interface DiffResult {
  oldText: string;
  newText: string;
  oldLabel: string;
  newLabel: string;
}

const STORAGE_KEY = "nv_diff_inputs";

function loadSavedInputs(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveInputs(patch: Record<string, string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadSavedInputs(), ...patch }));
  } catch {
    /* ignore */
  }
}

/** 对比工作台：文件 / 文本 / Git 三种输入模式 + 双栏 Diff 视图 */
export function DiffWorkbench() {
  const [mode, setMode] = useState<Mode>("file");
  const [viewKind, setViewKind] = useState<ViewKind>("side");
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const saved = loadSavedInputs();

  const [oldPath, setOldPath] = useState(saved.oldPath ?? "");
  const [newPath, setNewPath] = useState(saved.newPath ?? "");
  const [oldTextIn, setOldTextIn] = useState(saved.oldText ?? "");
  const [newTextIn, setNewTextIn] = useState(saved.newText ?? "");
  const [repoPath, setRepoPath] = useState(saved.repoPath ?? "");
  const [gitFiles, setGitFiles] = useState<string[]>([]);
  const [gitFile, setGitFile] = useState("");
  const [gitCommits, setGitCommits] = useState<Array<{ hash: string; label: string }>>([]);
  const [refA, setRefA] = useState("");
  const [refB, setRefB] = useState("WORKDIR");
  const [busy, setBusy] = useState<string | null>(null);

  const [result, setResult] = useState<DiffResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    saveInputs({ oldPath, newPath, repoPath });
  }, [oldPath, newPath, repoPath]);
  useEffect(() => {
    const t = setTimeout(() => saveInputs({ oldText: oldTextIn, newText: newTextIn }), 500);
    return () => window.clearTimeout(t);
  }, [oldTextIn, newTextIn]);

  async function runDiff() {
    setBusy("run");
    setError(null);
    try {
      if (mode === "file") {
        if (!oldPath.trim() || !newPath.trim()) throw new Error("请输入两个文件路径");
        const [a, b] = await Promise.all([
          api.fsReadAbs(oldPath.trim()),
          api.fsReadAbs(newPath.trim()),
        ]);
        setResult({
          oldText: a.content,
          newText: b.content,
          oldLabel: oldPath.trim(),
          newLabel: newPath.trim(),
        });
      } else if (mode === "text") {
        setResult({ oldText: oldTextIn, newText: newTextIn, oldLabel: "文本 A", newLabel: "文本 B" });
      } else {
        if (!gitFile) throw new Error("请先读取仓库并选择文件");
        const oldC = await api.gitShow(repoPath.trim(), gitFile, refA);
        const newC = await api.gitShow(repoPath.trim(), gitFile, refB);
        const name = (ref: string) => (ref === "WORKDIR" ? "工作区" : ref.slice(0, 8));
        setResult({
          oldText: oldC.content,
          newText: newC.content,
          oldLabel: `${gitFile} @ ${name(refA)}`,
          newLabel: `${gitFile} @ ${name(refB)}`,
        });
      }
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function swap() {
    if (mode === "file") {
      setOldPath(newPath);
      setNewPath(oldPath);
    } else if (mode === "text") {
      setOldTextIn(newTextIn);
      setNewTextIn(oldTextIn);
    } else {
      setRefA(refB);
      setRefB(refA);
    }
    setResult((r) => (r ? { ...r, oldText: r.newText, newText: r.oldText, oldLabel: r.newLabel, newLabel: r.oldLabel } : r));
  }

  async function loadRepo() {
    setBusy("repo");
    setError(null);
    try {
      const r = await api.gitLs(repoPath.trim());
      setGitFiles(r.files);
      const next = r.files.includes(gitFile) ? gitFile : r.files[0] ?? "";
      setGitFile(next);
      if (next) await loadGitLog(next, repoPath.trim());
    } catch (e) {
      setGitFiles([]);
      setGitCommits([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function loadGitLog(file: string, repo = repoPath.trim()) {
    if (!file || !repo) return;
    setBusy("log");
    setError(null);
    try {
      const r = await api.gitLog(repo, file);
      setGitCommits(
        r.commits.map((c) => ({
          hash: c.hash,
          label: `${c.hash.slice(0, 8)} ${c.subject} (${c.author} ${c.date.slice(0, 10)})`,
        }))
      );
      setRefA(r.commits[0]?.hash ?? "");
      setRefB("WORKDIR");
    } catch (e) {
      setGitCommits([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const canRun =
    mode === "file"
      ? oldPath.trim() !== "" && newPath.trim() !== ""
      : mode === "text"
        ? oldTextIn !== "" || newTextIn !== ""
        : gitFile !== "" && repoPath.trim() !== "";

  return (
    <div className="content-col">
      <div className="diff-toolbar">
        <div className="seg">
          {(["file", "text", "git"] as Mode[]).map((m) => (
            <button
              key={m}
              className={mode === m ? "active" : ""}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
            >
              {m === "file" ? "文件" : m === "text" ? "文本" : "Git"}
            </button>
          ))}
        </div>
        {result && (
          <button className="icon-btn" title="交换两侧" onClick={swap}>
            <ArrowLeftRight size={14} />
          </button>
        )}
        <span style={{ flex: 1 }} />
        <div className="seg">
          <button className={viewKind === "side" ? "active" : ""} onClick={() => setViewKind("side")}>并排</button>
          <button className={viewKind === "unified" ? "active" : ""} onClick={() => setViewKind("unified")}>统一</button>
        </div>
        <label className="icon-btn labeled" style={{ gap: 5 }} title="比较时忽略空白差异（显示仍保留原文）">
          <input
            type="checkbox"
            checked={ignoreWhitespace}
            onChange={(e) => setIgnoreWhitespace(e.target.checked)}
            style={{ accentColor: "var(--accent)" }}
          />
          忽略空白
        </label>
      </div>

      <div className="diff-inputs">
        {mode === "file" && (
          <div className="row">
            <span className="tag">旧</span>
            <input
              type="text"
              placeholder="旧文件绝对路径，如 D:\docs\report.sql"
              value={oldPath}
              onChange={(e) => setOldPath(e.target.value)}
              spellCheck={false}
            />
            <button className="icon-btn" title="交换两侧" onClick={swap}>
              <ArrowLeftRight size={14} />
            </button>
            <span className="tag">新</span>
            <input
              type="text"
              placeholder="新文件绝对路径"
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              spellCheck={false}
              onKeyDown={(e) => e.key === "Enter" && canRun && void runDiff()}
            />
            <button className="btn-ghost" disabled={!canRun || busy !== null} onClick={() => void runDiff()}>
              {busy === "run" ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              对比
            </button>
          </div>
        )}
        {mode === "text" && (
          <div className="row" style={{ alignItems: "stretch" }}>
            <textarea placeholder="文本 A" value={oldTextIn} onChange={(e) => setOldTextIn(e.target.value)} spellCheck={false} />
            <button className="icon-btn" style={{ flex: "none", alignSelf: "center" }} title="交换两侧" onClick={swap}>
              <ArrowLeftRight size={14} />
            </button>
            <textarea placeholder="文本 B" value={newTextIn} onChange={(e) => setNewTextIn(e.target.value)} spellCheck={false} />
            <button
              className="btn-ghost"
              style={{ flex: "none", alignSelf: "center" }}
              disabled={busy !== null}
              onClick={() => void runDiff()}
            >
              {busy === "run" ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              对比
            </button>
          </div>
        )}
        {mode === "git" && (
          <>
            <div className="row">
              <span className="tag">仓库</span>
              <input
                type="text"
                placeholder="Git 仓库绝对路径，如 D:\code\my-project"
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
                spellCheck={false}
                onKeyDown={(e) => e.key === "Enter" && void loadRepo()}
              />
              <button className="btn-ghost" disabled={busy !== null || !repoPath.trim()} onClick={() => void loadRepo()}>
                {busy === "repo" ? <Loader2 size={13} className="animate-spin" /> : <FolderGit2 size={13} />}
                读取文件列表
              </button>
            </div>
            <div className="row">
              <span className="tag">文件</span>
              <select
                className="diff-select"
                value={gitFile}
                onChange={(e) => void loadGitLog(e.target.value)}
                disabled={gitFiles.length === 0}
              >
                {gitFiles.length === 0 ? <option value="">（先读取文件列表）</option> : null}
                {gitFiles.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <div className="row">
              <span className="tag">版本</span>
              <select
                className="diff-select"
                value={refA}
                onChange={(e) => setRefA(e.target.value)}
                disabled={gitCommits.length === 0}
              >
                {gitCommits.length === 0 ? <option value="">（选择文件后加载提交历史）</option> : null}
                {gitCommits.map((c) => (
                  <option key={c.hash} value={c.hash}>{c.label}</option>
                ))}
              </select>
              <span className="tag" style={{ textAlign: "center" }}>→</span>
              <select className="diff-select" value={refB} onChange={(e) => setRefB(e.target.value)} disabled={gitCommits.length === 0}>
                <option value="WORKDIR">工作区（当前磁盘内容）</option>
                {gitCommits.map((c) => (
                  <option key={c.hash} value={c.hash}>{c.label}</option>
                ))}
              </select>
              <button className="btn-ghost" disabled={!canRun || busy !== null} onClick={() => void runDiff()}>
                {busy === "run" ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                对比
              </button>
            </div>
          </>
        )}
        {error && <div className="diff-error">{error}</div>}
      </div>

      {result ? (
        <DiffView result={result} viewKind={viewKind} ignoreWhitespace={ignoreWhitespace} />
      ) : (
        <div className="diff-empty">
          <div>
            <GitCompare size={30} style={{ marginBottom: 10, opacity: 0.5 }} />
            <div style={{ lineHeight: 2 }}>
              <b>文件</b>：对比两个文本/代码文件 · <b>文本</b>：直接粘贴两段内容 ·{" "}
              <b>Git</b>：选仓库文件的历史版本对比
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Diff 视图：构建行模型、折叠状态与渲染 */
function DiffView({
  result,
  viewKind,
  ignoreWhitespace,
}: {
  result: DiffResult;
  viewKind: ViewKind;
  ignoreWhitespace: boolean;
}) {
  const [items, setItems] = useState<DiffItem[]>([]);
  const [stats, setStats] = useState<{ add: number; del: number; folds: number }>({ add: 0, del: 0, folds: 0 });
  const [truncated, setTruncated] = useState(false);
  const [same, setSame] = useState(false);

  useEffect(() => {
    const { rows, truncated: tr } = buildDiffRows(result.oldText, result.newText, { ignoreWhitespace });
    setTruncated(tr);
    if (rows.every((r) => r.type === "equal")) {
      setSame(true);
      setItems([]);
      return;
    }
    setSame(false);
    const it = foldRows(rows);
    setItems(it);
    let add = 0;
    let del = 0;
    let folds = 0;
    for (const x of it) {
      if (x.kind === "fold") folds++;
      else if (x.row.type === "add") add++;
      else if (x.row.type === "del") del++;
    }
    setStats({ add, del, folds });
  }, [result, ignoreWhitespace]);

  const expand = (group: FoldGroup) => setItems((cur) => expandFold(cur, group));

  if (same) {
    return (
      <div className="diff-body">
        <div className="diff-same">
          <Check size={26} style={{ marginBottom: 8, color: "var(--ok)" }} />
          <div>两侧内容相同{ignoreWhitespace ? "（已忽略空白差异）" : ""}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="diff-body">
      {truncated && (
        <div className="diff-error">差异超过 20000 行，仅渲染前 20000 行。完整内容请改用专业 diff 工具。</div>
      )}
      <div className="diff-table">
        {viewKind === "side" && (
          <div className="diff-row" style={{ position: "sticky", top: 0, zIndex: 3 }}>
            <div className="cell" style={{ background: "var(--bg-panel)", borderBottom: "1px solid var(--border)" }}>
              <span
                className="txt"
                style={{
                  fontFamily: "var(--font-ui)",
                  color: "var(--text-secondary)",
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  fontSize: 12,
                }}
              >
                旧 · {result.oldLabel}
              </span>
            </div>
            <div className="cell" style={{ background: "var(--bg-panel)", borderBottom: "1px solid var(--border)" }}>
              <span
                className="txt"
                style={{
                  fontFamily: "var(--font-ui)",
                  color: "var(--text-secondary)",
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  fontSize: 12,
                }}
              >
                新 · {result.newLabel}
              </span>
            </div>
          </div>
        )}
        {items.map((it, i) =>
          it.kind === "fold" ? (
            <div className="diff-fold-bar" key={`f${i}`}>
              <button onClick={() => expand(it.group)}>⋯ 展开此间 {it.group.count} 行未变更内容</button>
            </div>
          ) : viewKind === "side" ? (
            <SideRow key={`r${i}`} row={it.row} />
          ) : (
            <UnifiedRow key={`r${i}`} row={it.row} />
          )
        )}
      </div>
      <div style={{ height: 40 }} />
      <div className="diff-stats" style={{ position: "sticky", bottom: 0, borderTop: "1px solid var(--border)" }}>
        <span className="st-add">+{stats.add} 新增</span>
        <span className="st-del">-{stats.del} 删除</span>
        <span>{stats.folds} 个折叠块</span>
        <span className="spacer" />
        <span>{result.oldLabel} ⇄ {result.newLabel}</span>
      </div>
    </div>
  );
}

function SegText({ segs, text }: { segs: { text: string; changed: boolean }[] | null; text: string }) {
  if (!segs) return <>{text}</>;
  return (
    <>
      {segs.map((s, i) =>
        s.changed ? (
          <span className="seg-changed" key={i}>{s.text}</span>
        ) : (
          <span key={i}>{s.text}</span>
        )
      )}
    </>
  );
}

function SideRow({ row }: { row: DiffRow }) {
  const oldEmpty = row.oldNo === null;
  const newEmpty = row.newNo === null;
  return (
    <div className="diff-row">
      <div className={`cell old${row.type === "del" || row.type === "replace" ? " del-side" : ""}${oldEmpty ? " add" : ""}`}>
        <span className="ln">{row.oldNo ?? ""}</span>
        <span className="txt">
          <SegText segs={row.oldSegs} text={row.oldText} />
        </span>
      </div>
      <div className={`cell new${row.type === "add" || row.type === "replace" ? " add-side" : ""}${newEmpty ? " del" : ""}`}>
        <span className="ln">{row.newNo ?? ""}</span>
        <span className="txt">
          <SegText segs={row.newSegs} text={row.newText} />
        </span>
      </div>
    </div>
  );
}

function UnifiedRow({ row }: { row: DiffRow }) {
  if (row.type === "replace") {
    return (
      <>
        <div className="diff-row del">
          <div className="cell" style={{ width: "100%", minWidth: 0 }}>
            <span className="ln">{row.oldNo ?? ""}</span>
            <span className="txt">- <SegText segs={row.oldSegs} text={row.oldText} /></span>
          </div>
        </div>
        <div className="diff-row add">
          <div className="cell" style={{ width: "100%", minWidth: 0 }}>
            <span className="ln">{row.newNo ?? ""}</span>
            <span className="txt">+ <SegText segs={row.newSegs} text={row.newText} /></span>
          </div>
        </div>
      </>
    );
  }
  if (row.type === "del") {
    return (
      <div className="diff-row del">
        <div className="cell" style={{ width: "100%", minWidth: 0 }}>
          <span className="ln">{row.oldNo ?? ""}</span>
          <span className="txt">- {row.oldText}</span>
        </div>
      </div>
    );
  }
  if (row.type === "add") {
    return (
      <div className="diff-row add">
        <div className="cell" style={{ width: "100%", minWidth: 0 }}>
          <span className="ln">{row.newNo ?? ""}</span>
          <span className="txt">+ {row.newText}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="diff-row equal">
      <div className="cell" style={{ width: "100%", minWidth: 0 }}>
        <span className="ln">{row.oldNo ?? ""}</span>
        <span className="txt">{row.oldText}</span>
      </div>
    </div>
  );
}
