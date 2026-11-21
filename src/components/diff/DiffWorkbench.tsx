import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Check,
  FolderGit2,
  GitCompare,
  Loader2,
  Play,
  Search,
} from "lucide-react";
import {
  buildDiffRows,
  expandFold,
  foldRows,
  lineStatuses,
  type DiffItem,
  type DiffRow,
  type FoldGroup,
} from "../../lib/diff";
import { api } from "../../api/client";

type Mode = "file" | "text" | "git";
type ViewKind = "side" | "unified";
type SideRead = { ok: true; fc: { content: string; name: string } } | { ok: false; err: string; path: string };

/** 分隔路径：目录部分 + 文件名部分（支持 / 与 \） */
function splitPath(p: string): { dir: string; name: string } {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  if (i === -1) return { dir: "", name: p };
  return { dir: p.slice(0, i), name: p.slice(i + 1) };
}

/** 简易模糊匹配：子序列命中（不区分大小写） */
function fuzzyHit(text: string, query: string): boolean {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  let pos = 0;
  for (const ch of q) {
    if (ch === "/" || ch === "\\") continue;
    const idx = t.indexOf(ch, pos);
    if (idx === -1) return false;
    pos = idx + 1;
  }
  return true;
}

interface DiffResult {
  oldText: string;
  newText: string;
  oldLabel: string;
  newLabel: string;
}

const STORAGE_KEY = "nv_diff_inputs";

/** 路径智能输入框：目录列举下拉 + 文件名模糊过滤 */
function PathCombobox({
  value,
  onChange,
  placeholder,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onSubmit: () => void;
}) {
  const [entries, setEntries] = useState<Array<{ name: string; dir: boolean }> | null>(null);
  const [browseDir, setBrowseDir] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const lastBrowseRef = useRef<string | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  async function browse(dir: string) {
    lastBrowseRef.current = dir;
    setLoading(true);
    try {
      const r = await api.fsListDir(dir);
      setEntries(r.entries);
      setBrowseDir(dir);
      setOpen(r.entries.length > 0);
    } catch {
      setEntries(null);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  const { dir: curDir, name: curName } = splitPath(value);
  const query = browseDir !== null ? value.slice(browseDir.length + 1) : curName;
  const suggestions = useMemo(() => {
    if (!entries || !open) return [];
    const q = query.trim().toLowerCase();
    const list = q ? entries.filter((e) => fuzzyHit(e.name, q)) : entries;
    return list.slice(0, 30);
  }, [entries, open, query]);

  return (
    <div className="pcbox" ref={boxRef}>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v);
          setOpen(true);
          // 输入以分隔符结尾（目录前缀）时自动浏览该目录——输入即提示
          if (/[\\/]$/.test(v)) {
            const d = v.slice(0, -1);
            if (d && lastBrowseRef.current !== d) void browse(d);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (suggestions.length === 1) {
              const s = suggestions[0];
              const full = browseDir !== null ? `${browseDir}\\${s.name}` : s.name;
              if (s.dir) {
                onChange(full + "\\");
                void browse(full + "\\");
              } else {
                onChange(full);
                setOpen(false);
                onSubmit();
              }
            } else {
              setOpen(false);
              onSubmit();
            }
          }
        }}
        spellCheck={false}
      />
      <button
        className="icon-btn"
        title="浏览当前目录"
        style={{ flex: "none" }}
        onClick={() => {
          const d = curDir || value;
          if (d) void browse(d);
        }}
      >
        <Search size={13} />
      </button>
      {open && suggestions.length > 0 && (
        <div className="pcbox-drop">
          {browseDir && <div className="pcbox-dir">📁 {browseDir}{loading ? " …" : ""}</div>}
          {suggestions.map((s) => (
            <button
              key={s.name}
              className="pcbox-item"
              onClick={() => {
                const full = browseDir !== null ? `${browseDir}\\${s.name}` : s.name;
                if (s.dir) {
                  onChange(full + "\\");
                  void browse(full + "\\");
                } else {
                  onChange(full);
                  setOpen(false);
                }
              }}
            >
              {s.dir ? "📁 " : ""}
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Git 文件模糊搜索下拉：按子序列过滤跟踪文件 */
function GitFileCombobox({
  files,
  value,
  onPick,
}: {
  files: string[];
  value: string;
  onPick: (file: string) => void;
}) {
  const [input, setInput] = useState(value);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => setInput(value), [value]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const q = input.trim().toLowerCase();
  const matches = useMemo(() => {
    const list = q ? files.filter((f) => fuzzyHit(f, q)) : files;
    return list.slice(0, 50);
  }, [files, q]);

  return (
    <div className="pcbox" ref={boxRef}>
      <input
        type="text"
        placeholder={`文件（模糊搜索，共 ${files.length} 个）`}
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && matches.length > 0) {
            onPick(matches[0]);
            setOpen(false);
          }
        }}
        spellCheck={false}
      />
      {open && (
        <div className="pcbox-drop">
          {matches.length === 0 ? (
            <div className="pcbox-item" style={{ color: "var(--text-faint)" }}>无匹配文件</div>
          ) : (
            matches.map((f) => (
              <button key={f} className="pcbox-item" onClick={() => { onPick(f); setInput(f); setOpen(false); }}>
                {f}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

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

/** 对比工作台：文件 / 文本 / Git 三种输入模式 + 双栏 Diff 视图。
 *  三个模式的结果各自独立记忆，切换页签互不串扰。 */
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

  /** 每个模式独立的结果 */
  const [results, setResults] = useState<Partial<Record<Mode, DiffResult>>>({});
  /** 文件模式：两侧各自的读取状态（分区错误提示用） */
  const [oldSide, setOldSide] = useState<SideRead | null>(null);
  const [newSide, setNewSide] = useState<SideRead | null>(null);
  const [error, setError] = useState<string | null>(null);

  const result = results[mode];

  useEffect(() => {
    saveInputs({ oldPath, newPath, repoPath });
  }, [oldPath, newPath, repoPath]);

  /** 文本模式：两侧都有内容时自动对比（600ms 防抖，贴入即比） */
  useEffect(() => {
    if (mode !== "text") return;
    if (oldTextIn.trim() === "" || newTextIn.trim() === "") return;
    const t = setTimeout(() => {
      setModeResult("text", {
        oldText: oldTextIn,
        newText: newTextIn,
        oldLabel: `文本 A（${oldTextIn.length} 字符）`,
        newLabel: `文本 B（${newTextIn.length} 字符）`,
      });
    }, 600);
    return () => window.clearTimeout(t);
  }, [oldTextIn, newTextIn, mode]);

  useEffect(() => {
    const t = setTimeout(() => saveInputs({ oldText: oldTextIn, newText: newTextIn }), 500);
    return () => window.clearTimeout(t);
  }, [oldTextIn, newTextIn]);

  function setModeResult(m: Mode, r: DiffResult | undefined) {
    setResults((prev) => ({ ...prev, [m]: r }));
  }

  async function runFileDiff() {
    setBusy("file");
    setError(null);
    const readSide = async (p: string): Promise<SideRead> => {
      try {
        return { ok: true, fc: await api.fsReadAbs(p) };
      } catch (e) {
        return { ok: false, err: e instanceof Error ? e.message : String(e), path: p };
      }
    };
    try {
      const [o, n] = await Promise.all([readSide(oldPath.trim()), readSide(newPath.trim())]);
      setOldSide(o);
      setNewSide(n);
      if (o.ok && n.ok) {
        setModeResult("file", {
          oldText: o.fc.content,
          newText: n.fc.content,
          oldLabel: oldPath.trim(),
          newLabel: newPath.trim(),
        });
      } else {
        setModeResult("file", undefined);
      }
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
    setResults((prev) => {
      const r = prev[mode];
      if (!r) return prev;
      return { ...prev, [mode]: { ...r, oldText: r.newText, newText: r.oldText, oldLabel: r.newLabel, newLabel: r.oldLabel } };
    });
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
    setGitFile(file);
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
        ? false // 文本模式自动对比
        : gitFile !== "" && repoPath.trim() !== "";

  return (
    <div className="content-col">
      {/* 顶栏：品牌 + 模式切换 + 视图/选项（与读取工作台同款样式） */}
      <div className="topbar">
        <div className="brand">
          <span className="logo-dot">N</span>
          NoteVault
        </div>
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
              {m === "file" ? "文件对比" : m === "text" ? "文本对比" : "Git 版本对比"}
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        {result && (
          <button className="icon-btn" title="交换两侧" onClick={swap}>
            <ArrowLeftRight size={15} />
          </button>
        )}
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

      {/* 输入区：随模式变化 */}
      {error && <div className="diff-error" style={{ margin: "8px 12px" }}>{error}</div>}

      {mode === "file" && (
        <>
          <div className="diff-inputs">
            <div className="row">
              <span className="tag">旧</span>
              <PathCombobox value={oldPath} onChange={setOldPath} placeholder="旧文件绝对路径（去掉文件名可浏览目录）" onSubmit={() => canRun && void runFileDiff()} />
              <button className="icon-btn" title="交换两侧" onClick={swap}>
                <ArrowLeftRight size={14} />
              </button>
              <span className="tag">新</span>
              <PathCombobox value={newPath} onChange={setNewPath} placeholder="新文件绝对路径（去掉文件名可浏览目录）" onSubmit={() => canRun && void runFileDiff()} />
              <button
                className="btn-ghost"
                disabled={!canRun || busy !== null}
                onClick={() => void runFileDiff()}
              >
                {busy === "file" ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                对比
              </button>
            </div>
          </div>
          {(oldSide || newSide) && (
            <div className="side-grid">
              <SideFileCell state={oldSide} side="old" />
              <SideFileCell state={newSide} side="new" />
            </div>
          )}
        </>
      )}

      {mode === "text" && (
        <TextPanes
          oldText={oldTextIn}
          newText={newTextIn}
          ignoreWhitespace={ignoreWhitespace}
          onOldChange={setOldTextIn}
          onNewChange={setNewTextIn}
        />
      )}

      {mode === "git" && (
        <div className="diff-inputs">
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
            <GitFileCombobox
              files={gitFiles}
              value={gitFile}
              onPick={(f) => void loadGitLog(f)}
            />
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
            <button className="btn-ghost" disabled={!canRun || busy !== null} onClick={() => void runGitDiff()}>
              {busy === "run" ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              对比
            </button>
          </div>
        </div>
      )}

      {/* Diff 视图（文件 / Git 模式结果；文本模式的双框常驻渲染在上方） */}
      {result && mode !== "text" ? (
        <RowDiffView result={result} viewKind={viewKind} ignoreWhitespace={ignoreWhitespace} />
      ) : mode === "file" ? (
        <div className="diff-empty">
          <div>
            <GitCompare size={30} style={{ marginBottom: 10, opacity: 0.5 }} />
            <div style={{ lineHeight: 2 }}>
              输入两个文件的绝对路径后对比（去掉文件名可浏览目录、模糊选文件）
            </div>
          </div>
        </div>
      ) : mode === "text" ? null : (
        <div className="diff-empty">
          <div>
            <GitCompare size={30} style={{ marginBottom: 10, opacity: 0.5 }} />
            <div style={{ lineHeight: 2 }}>
              输入仓库路径并读取文件列表，选择文件与两个版本后对比
            </div>
          </div>
        </div>
      )}
    </div>
  );

  async function runGitDiff() {
    setBusy("run");
    setError(null);
    try {
      const oldC = await api.gitShow(repoPath.trim(), gitFile, refA);
      const newC = await api.gitShow(repoPath.trim(), gitFile, refB);
      const name = (ref: string) => (ref === "WORKDIR" ? "工作区" : ref.slice(0, 8));
      setModeResult("git", {
        oldText: oldC.content,
        newText: newC.content,
        oldLabel: `${gitFile} @ ${name(refA)}`,
        newLabel: `${gitFile} @ ${name(refB)}`,
      });
    } catch (e) {
      setModeResult("git", undefined);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }
}

/** 文本模式：左右双框即时高亮（可编辑 textarea + 背层行着色，滚动同步） */
function TextPanes({
  oldText,
  newText,
  ignoreWhitespace,
  onOldChange,
  onNewChange,
}: {
  oldText: string;
  newText: string;
  ignoreWhitespace: boolean;
  onOldChange: (v: string) => void;
  onNewChange: (v: string) => void;
}) {
  const { oldLines, newLines, addCount, delCount, modCount } = useMemo(
    () => lineStatuses(oldText, newText, ignoreWhitespace),
    [oldText, newText, ignoreWhitespace]
  );
  const leftTa = useRef<HTMLTextAreaElement | null>(null);
  const rightTa = useRef<HTMLTextAreaElement | null>(null);
  const leftBd = useRef<HTMLDivElement | null>(null);
  const rightBd = useRef<HTMLDivElement | null>(null);
  const syncing = useRef(false);

  const syncScroll = (src: HTMLTextAreaElement) => {
    if (syncing.current) return;
    syncing.current = true;
    for (const t of [leftTa.current, rightTa.current]) {
      if (t && t !== src) {
        t.scrollTop = src.scrollTop;
        t.scrollLeft = src.scrollLeft;
      }
    }
    for (const b of [leftBd.current, rightBd.current]) {
      if (b) {
        b.scrollTop = src.scrollTop;
        b.scrollLeft = src.scrollLeft;
      }
    }
    syncing.current = false;
  };

  const same = addCount === 0 && delCount === 0 && modCount === 0 && oldLines.length === newLines.length;

  /** 背层行内容：mod 行渲染字符级差异段（改动字符加深底色），其余纯文本 */
  const lineContent = (l: { text: string; segs: { text: string; changed: boolean }[] | null }, side: "old" | "new") => {
    if (!l.segs) return l.text === "" ? " " : l.text;
    if (l.text === "") return " ";
    return l.segs.map((s, j) =>
      s.changed ? (
        <span key={j} className={`tseg ${side === "old" ? "tseg-del" : "tseg-add"}`}>{s.text}</span>
      ) : (
        <span key={j}>{s.text}</span>
      )
    );
  };

  const pane = (
    side: "old" | "new",
    lines: { text: string; status: string; segs: { text: string; changed: boolean }[] | null }[],
    taRef: React.RefObject<HTMLTextAreaElement | null>,
    bdRef: React.RefObject<HTMLDivElement | null>,
    value: string,
    onChange: (v: string) => void,
    self: "left" | "right"
  ) => (
    <div className="tpane">
      <div className="tpane-backdrop" ref={bdRef} aria-hidden="true">
        {lines.map((l, i) => (
          <div
            key={i}
            className={`tline ${l.status === "del" ? "t-del" : l.status === "add" ? "t-add" : l.status === "mod" ? "t-mod" : ""}`}
          >
            <span className="tln">{i + 1}</span>
            <span className="ttxt">{lineContent(l, side)}</span>
          </div>
        ))}
        <div className="tline"><span className="tln"> </span><span className="ttxt"> </span></div>
      </div>
      <textarea
        ref={taRef}
        className="tpane-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => syncScroll(e.currentTarget)}
        wrap="off"
        spellCheck={false}
        placeholder={side === "old" ? "粘贴旧内容…" : "粘贴新内容…"}
        aria-label={side === "old" ? "旧文本" : "新文本"}
      />
      {self === "left" && delCount > 0 && (
        <span className="tpane-flag t-flag-del">−{delCount}</span>
      )}
      {self === "right" && addCount > 0 && (
        <span className="tpane-flag t-flag-add">+{addCount}</span>
      )}
      {side === "old" ? (
        <span className="tpane-tag">文本 A · {lines.length} 行</span>
      ) : (
        <span className="tpane-tag">文本 B · {lines.length} 行</span>
      )}
    </div>
  );

  return (
    <div className="text-panes-wrap">
      <div className="text-panes-stats">
        {same ? (
          <span style={{ color: "var(--ok)" }}>✓ 两侧内容相同{ignoreWhitespace ? "（忽略空白）" : ""}</span>
        ) : (
          <>
            {delCount > 0 && <span className="st-del">−{delCount} 行删除</span>}
            {addCount > 0 && <span className="st-add">+{addCount} 行新增</span>}
            {modCount > 0 && <span className="st-mod">≈{modCount} 行修改</span>}
            <span style={{ color: "var(--text-faint)" }}>拖动滚动即时同步 · 可直接在框内编辑</span>
          </>
        )}
      </div>
      <div className="text-panes">
        {pane("old", oldLines, leftTa, leftBd, oldText, onOldChange, "left")}
        {pane("new", newLines, rightTa, rightBd, newText, onNewChange, "right")}
      </div>
    </div>
  );
}

/** 文件模式：单侧读取结果（存在=内容预览 / 不存在=错误提示） */
function SideFileCell({
  state,
  side,
}: {
  state: { ok: true; fc: { content: string; name: string } } | { ok: false; err: string; path: string } | null;
  side: "old" | "new";
}) {
  if (!state) {
    return (
      <div className="side-cell">
        <div className="side-cell-hint">{side === "old" ? "旧" : "新"}：未读取</div>
      </div>
    );
  }
  if (!state.ok) {
    return (
      <div className="side-cell">
        <div className="side-cell-err">
          <b>文件不存在</b>
          <div className="side-cell-err-path">{state.path}</div>
          <div>请检查路径是否正确，或从上方下拉重新选择。</div>
        </div>
      </div>
    );
  }
  return (
    <div className="side-cell">
      <div className="side-cell-ok">
        <b>{state.fc.name}</b> 读取成功，可执行对比。
      </div>
    </div>
  );
}

/** 行模式 Diff 视图（文件 / Git 模式结果） */
function RowDiffView({
  result,
  viewKind,
  ignoreWhitespace,
}: {
  result: DiffResult;
  viewKind: ViewKind;
  ignoreWhitespace: boolean;
}) {
  const [items, setItems] = useState<DiffItem[]>([]);
  const [stats, setStats] = useState<{ add: number; del: number; mod: number; folds: number }>({ add: 0, del: 0, mod: 0, folds: 0 });
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
    let mod = 0;
    let folds = 0;
    for (const x of it) {
      if (x.kind === "fold") folds++;
      else if (x.row.type === "add") add++;
      else if (x.row.type === "del") del++;
      else if (x.row.type === "replace") mod++;
    }
    setStats({ add, del, mod, folds });
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
              <span className="txt" style={{ fontFamily: "var(--font-ui)", color: "var(--text-secondary)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", fontSize: 12 }}>
                旧 · {result.oldLabel}
              </span>
            </div>
            <div className="cell" style={{ background: "var(--bg-panel)", borderBottom: "1px solid var(--border)" }}>
              <span className="txt" style={{ fontFamily: "var(--font-ui)", color: "var(--text-secondary)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", fontSize: 12 }}>
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
        {stats.add > 0 && <span className="st-add">+{stats.add} 新增</span>}
        {stats.del > 0 && <span className="st-del">-{stats.del} 删除</span>}
        {stats.mod > 0 && <span className="st-mod">≈{stats.mod} 修改</span>}
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
    <div className={`diff-row ${row.type}`}>
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
        <div className="diff-row mod">
          <div className="cell" style={{ width: "100%", minWidth: 0 }}>
            <span className="ln">{row.oldNo ?? ""}</span>
            <span className="txt">- <SegText segs={row.oldSegs} text={row.oldText} /></span>
          </div>
        </div>
        <div className="diff-row mod">
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
