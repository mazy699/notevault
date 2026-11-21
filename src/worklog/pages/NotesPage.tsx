import { useMemo, useState, type ReactNode } from "react";
import { Modal } from "../components/common/Modal";
import { MarkdownView } from "../components/common/MarkdownView";
import { useNotes, useNoteCreate, useNoteUpdate, useNoteDelete, useNoteTogglePin } from "../queries/hooks";
import type { Note } from "../types";

function excerpt(content: string): string {
  const plain = content
    .replace(/```[\s\S]*?```/g, " [代码] ")
    .replace(/[#*`>[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.slice(0, 120);
}

/** 笔记编辑器（新建/编辑共用） */
function NoteEditor({
  initial,
  onClose,
}: {
  initial: Note | null;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [showPreview, setShowPreview] = useState(false);
  const createMut = useNoteCreate();
  const updateMut = useNoteUpdate();

  const save = async (): Promise<void> => {
    if (!content.trim()) {
      window.alert("笔记内容不能为空");
      return;
    }
    try {
      if (initial) {
        await updateMut.mutateAsync({ id: initial.id, input: { title, content, tags } });
      } else {
        await createMut.mutateAsync({ title, content, tags });
      }
      onClose();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Modal open onClose={onClose} title={initial ? "编辑笔记" : "新建笔记"} width="w-[680px]">
      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="标题（留空自动取内容首行）"
            className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="标签，逗号分隔（如：SQL, 调查）"
            className="w-64 shrink-0 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        {showPreview ? (
          <div className="min-h-[240px] overflow-auto rounded border border-gray-200 p-3">
            <MarkdownView text={content} />
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={12}
            autoFocus
            placeholder="调查结论、备忘、SQL…（支持 Markdown，内容不用长，记结论就行）"
            className="w-full resize-y rounded border border-gray-300 px-3 py-2 font-mono text-[13px] leading-relaxed focus:border-blue-500 focus:outline-none"
          />
        )}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowPreview((v) => !v)}
            className="rounded border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
          >
            {showPreview ? "切换到编辑" : "渲染预览"}
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
              取消
            </button>
            <button
              onClick={() => void save()}
              disabled={createMut.isPending || updateMut.isPending}
              className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function NoteCard({
  note,
  onEdit,
  onTogglePin,
  onDelete,
  onTag,
}: {
  note: Note;
  onEdit: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
  onTag: (tag: string) => void;
}) {
  return (
    <div
      className="group cursor-pointer rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
      onClick={onEdit}
    >
      <div className="mb-1 flex items-center gap-2">
        {note.pinned && <span className="text-xs">📌</span>}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">{note.title || "（无标题）"}</span>
        <span className="ml-2 flex shrink-0 gap-1 text-[11px] text-gray-400 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            className="rounded px-1.5 py-0.5 hover:bg-gray-100 hover:text-blue-600"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
          >
            {note.pinned ? "取消置顶" : "置顶"}
          </button>
          <button
            className="rounded px-1.5 py-0.5 hover:bg-red-50 hover:text-red-500"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            删除
          </button>
        </span>
      </div>
      <p className="mb-2 line-clamp-2 text-[13px] leading-relaxed text-gray-500">{excerpt(note.content) || "（空）"}</p>
      <div className="flex items-center gap-1.5">
        {note.tags.map((t) => (
          <button
            key={t}
            onClick={(e) => {
              e.stopPropagation();
              onTag(t);
            }}
            className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-600 hover:bg-blue-100"
            title={`筛选标签：${t}`}
          >
            {t}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-gray-300">{note.updatedAt.slice(0, 16)}</span>
      </div>
    </div>
  );
}

/** 笔记：轻量卡片流 + 标签筛选 + 全文搜索（定位是调查结论/备忘的随手记） */
export function NotesPage() {
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const notes = useNotes({ search: search || null, tag: tag || null });
  const [editing, setEditing] = useState<Note | null>(null);
  const [creating, setCreating] = useState(false);
  const pinMut = useNoteTogglePin();
  const deleteMut = useNoteDelete();

  const all = useMemo(() => notes.data ?? [], [notes.data]);
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of all) for (const t of n.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [all]);
  const pinned = all.filter((n) => n.pinned);
  const rest = all.filter((n) => !n.pinned);

  const remove = (n: Note): void => {
    if (window.confirm(`删除笔记「${n.title || "无标题"}」？`)) {
      deleteMut.mutate(n.id, { onError: (e) => window.alert(e instanceof Error ? e.message : String(e)) });
    }
  };

  const renderCards = (list: Note[]): ReactNode => (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      {list.map((n) => (
        <NoteCard
          key={n.id}
          note={n}
          onEdit={() => setEditing(n)}
          onTogglePin={() => pinMut.mutate(n.id, { onError: (e) => window.alert(e instanceof Error ? e.message : String(e)) })}
          onDelete={() => remove(n)}
          onTag={(t) => setTag(t === tag ? "" : t)}
        />
      ))}
    </div>
  );

  return (
    <div className="h-full overflow-auto px-4 py-4">
      <div className="mx-auto max-w-[920px]">
        <div className="mb-3 flex items-center gap-2">
          <h1 className="text-base font-semibold text-gray-800">笔记</h1>
          <span className="text-[11px] text-gray-400">调查结论 / 备忘的随手记：标签组织 + 全文搜索，不用维护目录</span>
        </div>

        <div className="mb-3 flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索标题 / 内容…"
            className="flex-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={() => setCreating(true)}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            ＋ 新建笔记
          </button>
        </div>

        {tagCounts.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setTag("")}
              className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                tag === "" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              全部
            </button>
            {tagCounts.map(([t, c]) => (
              <button
                key={t}
                onClick={() => setTag(t === tag ? "" : t)}
                className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                  tag === t ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {t} <span className="opacity-60">{c}</span>
              </button>
            ))}
          </div>
        )}

        {notes.isLoading && <div className="py-16 text-center text-sm text-gray-400">加载中…</div>}

        {notes.data && all.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
            <div className="mb-2 text-4xl">📝</div>
            <div className="mb-1 text-sm text-gray-400">
              {search || tag ? "没有匹配的笔记" : "还没有笔记——调查结论、SQL 备忘、发布清单，记完就能搜到"}
            </div>
          </div>
        )}

        {pinned.length > 0 && (
          <div className="mb-4">
            <div className="mb-2 text-xs font-semibold text-gray-400">📌 置顶</div>
            {renderCards(pinned)}
          </div>
        )}
        {rest.length > 0 && (
          <div className={pinned.length > 0 ? "" : "mb-2"}>
            {pinned.length > 0 && <div className="mb-2 text-xs font-semibold text-gray-400">全部</div>}
            {renderCards(rest)}
          </div>
        )}
      </div>

      {creating && <NoteEditor initial={null} onClose={() => setCreating(false)} />}
      {editing && <NoteEditor initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
