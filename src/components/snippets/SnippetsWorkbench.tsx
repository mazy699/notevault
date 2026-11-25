/** 常用语工作台（Issue #12）：卡片网格 + 搜索/分组 + 拖动排序 + 复制 + JSON 导入导出 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  GripVertical,
  Pencil,
  Plus,
  Search,
  StickyNote,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { api, isTauri } from "../../api/client";
import { useSnippets } from "../../stores/snippets";
import {
  buildSnippetsJson,
  filterSnippets,
  newSnippet,
  parseSnippetsJson,
  snippetGroups,
  sortSnippets,
} from "../../lib/snippets";
import type { Snippet } from "../../../shared/types";

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 卡片/详情标题：标题为空时取正文首个非空行 */
function displayTitle(s: Snippet): string {
  if (s.title.trim()) return s.title.trim();
  const line = s.content.split(/\r?\n/).find((l) => l.trim());
  return (line ?? "").trim() || "（无标题）";
}

export function SnippetsWorkbench() {
  const { loaded, busy, error, db, load, addSnippet, updateSnippet, removeSnippet, moveSnippet, importSnippets, clearError } =
    useSnippets();
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ snippet: Snippet; isNew: boolean } | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [importState, setImportState] = useState<{
    snippets: Snippet[];
    order?: string[];
    fileName: string;
    mode: "merge" | "replace";
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 拖动排序状态
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; after: boolean } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    if (!loaded && !busy && !error) void load();
  }, [loaded, busy, error, load]);

  const ordered = useMemo(() => sortSnippets(db.snippets, db.order), [db.snippets, db.order]);
  const groups = useMemo(() => snippetGroups(ordered), [ordered]);
  const filtered = useMemo(() => filterSnippets(ordered, query, groupFilter), [ordered, query, groupFilter]);
  const viewing = viewingId ? db.snippets.find((s) => s.id === viewingId) ?? null : null;
  const canDrag = loaded && !query.trim() && groupFilter === null;

  const flashCopied = (id: string) => {
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1200);
  };

  const copyContent = async (s: Snippet) => {
    try {
      await navigator.clipboard.writeText(s.content);
      flashCopied(s.id);
    } catch {
      window.alert("复制失败：剪贴板不可用，请打开详情手动选择复制。");
    }
  };

  const startNew = () => setEditing({ snippet: newSnippet(), isNew: true });
  const startEdit = (s: Snippet) => {
    setViewingId(null);
    setEditing({ snippet: { ...s }, isNew: false });
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!editing.snippet.content.trim()) return;
    if (editing.isNew) {
      const saved = await addSnippet({
        title: editing.snippet.title,
        content: editing.snippet.content,
        group: editing.snippet.group,
      });
      setViewingId(saved.id);
    } else {
      await updateSnippet(editing.snippet);
    }
    setEditing(null);
  };

  const removeOne = async (s: Snippet) => {
    if (!window.confirm(`删除常用语「${displayTitle(s)}」？该操作不可撤销。`)) return;
    await removeSnippet(s.id);
    if (viewingId === s.id) setViewingId(null);
  };

  const finishDrag = () => {
    setDragId(null);
    setDropTarget(null);
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 150);
  };

  const onImportFile = async (file: File | null) => {
    if (!file) return;
    try {
      const r = parseSnippetsJson(await file.text());
      setImportState({ ...r, fileName: file.name, mode: "merge" });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  };

  const confirmImport = async () => {
    if (!importState) return;
    try {
      const r = await importSnippets(importState.snippets, importState.mode, importState.order);
      setImportState(null);
      window.alert(`导入完成：新增 ${r.added} · 更新 ${r.updated} · 保留 ${r.skipped}`);
    } catch (e) {
      setImportState(null);
      window.alert(e instanceof Error ? e.message : String(e));
    }
  };

  const doExport = async () => {
    if (db.snippets.length === 0) {
      window.alert("还没有常用语，无可导出内容。");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const content = buildSnippetsJson(db);
    const name = `notevault-snippets-${stamp}.json`;
    if (isTauri()) {
      try {
        const r = await api.saveTextFile(name, content);
        if (r.ok) window.alert(`已保存：${r.path}`);
      } catch (e) {
        window.alert(`导出失败：${e instanceof Error ? e.message : String(e)}`);
      }
      return;
    }
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const ungrouped = groups.find((g) => g.name === "")?.count ?? 0;
  const namedGroups = groups.filter((g) => g.name);

  return (
    <div className="content-col sn-workbench">
      <div className="topbar">
        <div className="brand">
          <span className="logo-dot">N</span>
          NoteVault
        </div>
        <div className="seg">
          <button className="active">
            <StickyNote size={13} style={{ display: "inline", marginRight: 4, verticalAlign: -2 }} />
            常用语
          </button>
        </div>
        <span className="sn-count">{db.snippets.length} 条</span>
        <span style={{ flex: 1 }} />
        <div className="sn-search">
          <Search size={13} />
          <input
            type="text"
            placeholder="搜索标题 / 正文 / 分组…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
          />
        </div>
        <button
          className="icon-btn labeled"
          title="从 JSON 导入（合并或替换）"
          disabled={!loaded}
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={15} />
          导入
        </button>
        <button className="icon-btn labeled" title="导出全部常用语为 JSON（迁移/备份）" disabled={!loaded} onClick={() => void doExport()}>
          <Download size={15} />
          导出
        </button>
        <button className="icon-btn labeled" title="新建常用语" disabled={!loaded} onClick={startNew}>
          <Plus size={15} />
          新建
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={(e) => {
          void onImportFile(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />

      <div className="sn-body">
        <aside className="sn-groups">
          <button className={`sn-group${groupFilter === null ? " active" : ""}`} onClick={() => setGroupFilter(null)}>
            <span>全部</span>
            <span className="sn-group-n">{db.snippets.length}</span>
          </button>
          <button className={`sn-group${groupFilter === "" ? " active" : ""}`} onClick={() => setGroupFilter("")}>
            <span>未分组</span>
            <span className="sn-group-n">{ungrouped}</span>
          </button>
          {namedGroups.map((g) => (
            <button
              key={g.name}
              className={`sn-group${groupFilter === g.name ? " active" : ""}`}
              title={g.name}
              onClick={() => setGroupFilter(g.name)}
            >
              <span>{g.name}</span>
              <span className="sn-group-n">{g.count}</span>
            </button>
          ))}
          <div className="sn-groups-tip">
            {canDrag ? "拖动卡片可调整顺序；点击卡片查看全文" : "搜索/分组过滤时暂停拖动排序"}
          </div>
        </aside>

        <div className="sn-main">
          {error ? (
            <div className="sn-state">
              <AlertTriangle size={30} style={{ color: "var(--warn)" }} />
              <h3>常用语数据加载失败</h3>
              <p>{error}</p>
              <p className="sn-state-note">为避免覆盖原文件，已暂停保存。请检查或备份 %APPDATA%/notevault/snippets.json 后重试。</p>
              <button
                className="btn-ghost"
                onClick={() => {
                  clearError();
                  void load();
                }}
              >
                重试加载
              </button>
            </div>
          ) : !loaded ? (
            <div className="sn-state">
              <span className="spinner" />
              <p>正在加载常用语…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="sn-state">
              <StickyNote size={34} style={{ color: "var(--text-faint)" }} />
              <h3>{db.snippets.length === 0 ? "还没有常用语" : "没有匹配的常用语"}</h3>
              <p>
                {db.snippets.length === 0
                  ? "把常用回复、SQL 片段、固定说明、常用命令收进来，一键复制。"
                  : "试试更换关键词，或切换到「全部」分组。"}
              </p>
              {db.snippets.length === 0 && (
                <button className="btn-ghost" onClick={startNew}>
                  <Plus size={14} /> 新建第一条
                </button>
              )}
            </div>
          ) : (
            <div className="sn-grid">
              {filtered.map((s) => (
                <article
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  draggable={canDrag}
                  className={`sn-card${dragId === s.id ? " dragging" : ""}${
                    dropTarget && dropTarget.id === s.id && dragId !== s.id
                      ? dropTarget.after
                        ? " drop-after"
                        : " drop-before"
                      : ""
                  }`}
                  title={displayTitle(s)}
                  onDragStart={(ev) => {
                    if (!canDrag || (ev.target as HTMLElement).closest("button")) {
                      ev.preventDefault();
                      return;
                    }
                    setDragId(s.id);
                    ev.dataTransfer.effectAllowed = "move";
                    ev.dataTransfer.setData("text/plain", s.id);
                  }}
                  onDragOver={(ev) => {
                    if (!canDrag) return;
                    ev.preventDefault();
                    ev.dataTransfer.dropEffect = "move";
                    const rect = ev.currentTarget.getBoundingClientRect();
                    const after = ev.clientX > rect.left + rect.width / 2;
                    setDropTarget((prev) =>
                      prev && prev.id === s.id && prev.after === after ? prev : { id: s.id, after }
                    );
                  }}
                  onDrop={(ev) => {
                    ev.preventDefault();
                    if (canDrag && dragId && dropTarget && dragId !== dropTarget.id) {
                      void moveSnippet(dragId, dropTarget.id, dropTarget.after);
                    }
                    finishDrag();
                  }}
                  onDragEnd={finishDrag}
                  onClick={() => {
                    if (suppressClick.current) return;
                    setViewingId(s.id);
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      setViewingId(s.id);
                    }
                  }}
                >
                  <div className="sn-card-h">
                    <span className="sn-card-title">{displayTitle(s)}</span>
                    <span className="sn-card-group">{s.group || "未分组"}</span>
                    {canDrag && (
                      <span className="sn-grip" aria-hidden="true">
                        <GripVertical size={13} />
                      </span>
                    )}
                  </div>
                  <pre className="sn-card-content">{s.content}</pre>
                  <div className="sn-card-f">
                    <span className="sn-card-time">{fmtTime(s.updatedAt)}</span>
                    <span style={{ flex: 1 }} />
                    <button
                      className="icon-btn"
                      title="复制正文"
                      onClick={(e) => {
                        e.stopPropagation();
                        void copyContent(s);
                      }}
                    >
                      {copiedId === s.id ? <Check size={14} style={{ color: "var(--ok)" }} /> : <Copy size={14} />}
                    </button>
                    <button
                      className="icon-btn"
                      title="编辑"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(s);
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="icon-btn"
                      title="删除"
                      onClick={(e) => {
                        e.stopPropagation();
                        void removeOne(s);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      {viewing && (
        <div className="sn-modal-mask" onClick={() => setViewingId(null)}>
          <div className="sn-modal sn-modal-view" onClick={(e) => e.stopPropagation()}>
            <div className="sn-modal-h">
              <span className="sn-modal-title">{displayTitle(viewing)}</span>
              <span className="sn-card-group">{viewing.group || "未分组"}</span>
              <span style={{ flex: 1 }} />
              <button className="icon-btn" title="关闭" onClick={() => setViewingId(null)}>
                <X size={15} />
              </button>
            </div>
            <div className="sn-modal-meta">更新于 {fmtTime(viewing.updatedAt)}</div>
            <pre className="sn-detail-content">{viewing.content}</pre>
            <div className="sn-modal-actions">
              <button className="btn-ghost" onClick={() => void copyContent(viewing)}>
                {copiedId === viewing.id ? <Check size={14} style={{ color: "var(--ok)" }} /> : <Copy size={14} />}
                复制正文
              </button>
              <button className="btn-ghost" onClick={() => startEdit(viewing)}>
                <Pencil size={14} /> 编辑
              </button>
              <button className="btn-ghost" onClick={() => void removeOne(viewing)}>
                <Trash2 size={14} /> 删除
              </button>
              <button className="btn-ghost" onClick={() => setViewingId(null)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <SnippetEditor
          draft={editing.snippet}
          isNew={editing.isNew}
          groups={groups.map((g) => g.name).filter(Boolean)}
          onChange={(s) => setEditing({ ...editing, snippet: s })}
          onSave={() => void saveEdit()}
          onCancel={() => setEditing(null)}
        />
      )}

      {importState && (
        <div className="sn-modal-mask" onClick={() => setImportState(null)}>
          <div className="sn-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sn-modal-h">
              <span className="sn-modal-title">确认导入</span>
            </div>
            <p>
              文件 <b>{importState.fileName}</b> 识别到 <b>{importState.snippets.length}</b> 条常用语，当前模式：
              {importState.mode === "merge" ? "合并（同 ID 取较新，新增按来源顺序追加）" : "替换整库（现有数据将被覆盖）"}
            </p>
            {importState.mode === "replace" && (
              <p className="sn-warn">⚠️ 替换整库会删除当前 {db.snippets.length} 条常用语（建议先导出备份）。</p>
            )}
            <div className="sn-modal-actions">
              <button className="btn-ghost" onClick={() => void confirmImport()}>
                确认{importState.mode === "merge" ? "合并" : "替换"}
              </button>
              <button
                className="btn-ghost"
                onClick={() =>
                  setImportState({ ...importState, mode: importState.mode === "merge" ? "replace" : "merge" })
                }
              >
                切换为{importState.mode === "merge" ? "替换" : "合并"}
              </button>
              <button className="btn-ghost" onClick={() => setImportState(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 新建/编辑弹窗：标题可选、分组自由输入、正文必填且保留原始换行 */
function SnippetEditor({
  draft,
  isNew,
  groups,
  onChange,
  onSave,
  onCancel,
}: {
  draft: Snippet;
  isNew: boolean;
  groups: string[];
  onChange: (s: Snippet) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const canSave = draft.content.trim().length > 0;
  return (
    <div className="sn-modal-mask" onClick={onCancel}>
      <div className="sn-modal sn-modal-edit" onClick={(e) => e.stopPropagation()}>
        <div className="sn-modal-h">
          <span className="sn-modal-title">{isNew ? "新建常用语" : "编辑常用语"}</span>
          <span style={{ flex: 1 }} />
          <button className="icon-btn" title="关闭" onClick={onCancel}>
            <X size={15} />
          </button>
        </div>
        <label className="sn-form-row">
          <span>标题</span>
          <input
            type="text"
            value={draft.title}
            placeholder="可选；留空时显示正文首个非空行"
            onChange={(e) => onChange({ ...draft, title: e.target.value })}
            autoFocus
          />
        </label>
        <label className="sn-form-row">
          <span>分组</span>
          <input
            type="text"
            list="sn-groups-list"
            value={draft.group}
            placeholder="可选；输入新名称即创建分组"
            onChange={(e) => onChange({ ...draft, group: e.target.value })}
            spellCheck={false}
          />
          <datalist id="sn-groups-list">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </label>
        <label className="sn-form-col">
          <span>
            正文 <em>*</em>
          </span>
          <textarea
            rows={11}
            value={draft.content}
            placeholder="支持多行纯文本，复制时保留原始换行与空白…"
            onChange={(e) => onChange({ ...draft, content: e.target.value })}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canSave) {
                e.preventDefault();
                onSave();
              }
            }}
            spellCheck={false}
          />
        </label>
        <div className="sn-form-hint">Ctrl/⌘ + Enter 保存 · 正文按原样复制，不做 trim/转义</div>
        <div className="sn-modal-actions">
          <button className="btn-ghost" onClick={onSave} disabled={!canSave}>
            <Check size={14} /> 保存
          </button>
          <button className="btn-ghost" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
