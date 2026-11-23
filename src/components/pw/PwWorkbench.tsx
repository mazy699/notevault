/** 密码工作台：凭证记录 + 密码生成 + 历史管理 + 导入导出（本地 JSON 存储，可选主密码加密） */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  History as HistoryIcon,
  KeyRound,
  Lock,
  LockKeyhole,
  LockOpen,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Timer,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { api, isTauri } from "../../api/client";
import { usePw } from "../../stores/pw";
import { buildCsv, buildJson, buildMd, parseImportText } from "../../lib/pwexport";
import { strengthInfo } from "../../lib/pwgen";
import type { PwEntry } from "../../../shared/types";
import { PwGenerator } from "./PwGenerator";

type PwTab = "vault" | "gen";

const PRESET_CATEGORIES = ["邮箱", "工号系统", "数据库", "服务器", "网站", "其他"];

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 复制文本 + 短暂"已复制"反馈 */
function useCopyFlash(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => {});
  };
  return [copied, copy];
}

export function PwWorkbench() {
  const pw = usePw();
  const [tab, setTab] = useState<PwTab>("vault");
  const [masterModal, setMasterModal] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [exportHistory, setExportHistory] = useState(true);
  const [importState, setImportState] = useState<{ entries: PwEntry[]; format: string; fileName: string } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const fileRef = useRef<HTMLInputElement>(null);

  // 首次进入加载整库
  useEffect(() => {
    if (!pw.loaded) void pw.load();
  }, []);

  /** 锁态：加密且未解锁（此时禁止一切写盘类操作，防止空库覆盖磁盘） */
  const locked = pw.encrypted && !pw.unlocked;

  const pickImport = (mode: "merge" | "replace") => {
    setImportMode(mode);
    setImportError(null);
    fileRef.current?.click();
  };

  const onImportFile = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const r = parseImportText(text, file.name);
      setImportState({ entries: r.entries, format: r.format, fileName: file.name });
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    }
  };

  const confirmImport = async () => {
    if (!importState) return;
    try {
      const r = await pw.importEntries(importState.entries, importMode);
      setImportState(null);
      window.alert(`导入完成：新增 ${r.added} · 更新 ${r.updated} · 保留 ${r.skipped}`);
    } catch (e) {
      setImportState(null);
      window.alert(e instanceof Error ? e.message : String(e));
    }
  };

  const doExport = async (fmt: "json" | "csv" | "md") => {
    setExportMenu(false);
    const entries = pw.db.entries;
    if (fmt === "json" && entries.length === 0) {
      window.alert("密码库为空，无可导出内容。");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const content =
      fmt === "json"
        ? buildJson(pw.db)
        : fmt === "csv"
          ? buildCsv(entries, exportHistory)
          : buildMd(entries, exportHistory);
    const defaultName = `notevault-passwords-${stamp}.${fmt}`;
    if (isTauri()) {
      try {
        const r = await api.saveTextFile(defaultName, content);
        if (r.ok) window.alert(`已保存：${r.path}`);
      } catch (e) {
        window.alert(`导出失败：${e instanceof Error ? e.message : String(e)}`);
      }
      return;
    }
    // Web：浏览器下载
    const blob = new Blob([content], { type: fmt === "json" ? "application/json" : fmt === "md" ? "text/markdown" : "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = defaultName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="content-col">
      {/* 顶栏：品牌 + 页签（与读取/对比工作台同款样式） */}
      <div className="topbar">
        <div className="brand">
          <span className="logo-dot">N</span>
          NoteVault
        </div>
        <div className="seg">
          <button className={tab === "vault" ? "active" : ""} onClick={() => setTab("vault")}>
            凭证库
          </button>
          <button className={tab === "gen" ? "active" : ""} onClick={() => setTab("gen")}>
            <Wand2 size={13} style={{ display: "inline", marginRight: 4, verticalAlign: -2 }} />
            密码生成器
          </button>
        </div>
        <span style={{ flex: 1 }} />
        {pw.encrypted ? (
          <span className="pw-lock-hint" title="密码库已用主密码加密存储（AES-256-GCM）">
            <ShieldCheck size={14} style={{ color: "var(--ok)" }} /> 已加密
          </span>
        ) : (
          <span className="pw-lock-hint" title="密码库未加密（默认，开箱即用；如需加密可在右侧设置主密码）">
            <LockOpen size={14} style={{ color: "var(--warn)" }} /> 未加密
          </span>
        )}
        <button
          className="icon-btn labeled"
          title={locked ? "请先解锁密码库" : "从 JSON/CSV 导入"}
          disabled={locked}
          onClick={() => pickImport("merge")}
        >
          <Upload size={15} />
          导入
        </button>
        <div className="pw-menu-anchor">
          <button
            className="icon-btn labeled"
            title={locked ? "请先解锁密码库" : "导出为 JSON / CSV / Markdown"}
            disabled={locked}
            onClick={() => setExportMenu((v) => !v)}
          >
            <Download size={15} />
            导出
          </button>
          {exportMenu && (
            <div className="pw-menu">
              <label className="pw-menu-check">
                <input type="checkbox" checked={exportHistory} onChange={(e) => setExportHistory(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
                导出历史密码（CSV/MD）
              </label>
              <div className="divider" />
              <button className="item" onClick={() => void doExport("json")}>
                <KeyRound size={14} /> JSON（完整迁移格式，含历史）
              </button>
              <button className="item" onClick={() => void doExport("csv")}>
                <Download size={14} /> CSV（表格快照）
              </button>
              <button className="item" onClick={() => void doExport("md")}>
                <Download size={14} /> Markdown（人读报表）
              </button>
            </div>
          )}
        </div>
        <AutoLockControl />
        {pw.encrypted && pw.unlocked && (
          <button
            className="icon-btn labeled"
            title="立即上锁（清除会话主密码，需重新解锁才能查看密码库）"
            onClick={() => pw.lock()}
          >
            <LockKeyhole size={15} />
            上锁
          </button>
        )}
        <button
          className="icon-btn labeled"
          title={locked ? "请先解锁密码库" : "主密码：加密 / 更改 / 移除"}
          disabled={locked}
          onClick={() => setMasterModal(true)}
        >
          {pw.masterPassword ? <Lock size={15} /> : <LockOpen size={15} />}
          主密码
        </button>
      </div>

      {/* 隐藏的导入文件选择（WebView2 / 浏览器均原生支持） */}
      <input
        ref={fileRef}
        type="file"
        accept=".json,.csv,text/csv,application/json"
        style={{ display: "none" }}
        onChange={(e) => void onImportFile(e.target.files?.[0] ?? null)}
        onClick={(e) => e.stopPropagation()}
      />

      {/* 正文 */}
      {!pw.loaded ? (
        <div className="pw-body-center">
          <span className="spinner" /> 正在加载密码库…
        </div>
      ) : pw.encrypted && !pw.unlocked ? (
        <UnlockCard wrong={pw.wrongPassword} onUnlock={(m) => void pw.unlock(m)} />
      ) : tab === "gen" ? (
        <div className="pw-body">
          <div className="pw-detail">
            <div className="pw-detail-h">独立生成器</div>
            <div className="pw-gen-wrap">
              <PwGenerator />
              <p className="pw-note">
                独立生成的密码不会自动入库；在左侧凭证库中选择条目后用"更换密码"可直接替换并记录历史。
              </p>
            </div>
          </div>
        </div>
      ) : (
        <VaultView />
      )}

      {/* 主密码弹窗 */}
      {masterModal && <MasterModal onClose={() => setMasterModal(false)} />}

      {/* 导入确认弹窗 */}
      {importState && (
        <div className="pw-modal-mask" onClick={() => setImportState(null)}>
          <div className="pw-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pw-modal-h">确认导入</div>
            <p>
              文件 <b>{importState.fileName}</b>（{importState.format.toUpperCase()}）识别到{" "}
              <b>{importState.entries.length}</b> 条凭证，当前模式：
              {importMode === "merge" ? "合并（同 ID/同名同账号取较新）" : "替换整库（现有数据将被覆盖）"}
            </p>
            {importMode === "replace" && (
              <p className="pw-warn-line">⚠️ 替换整库会先以当前内存库快照覆盖文件，替换后当前 {pw.db.entries.length} 条将丢失（请确认已导出备份）。</p>
            )}
            <div className="pw-modal-actions">
              <button className="btn-ghost" onClick={() => void confirmImport()}>
                确认{importMode === "merge" ? "合并" : "替换"}
              </button>
              <button
                className="btn-ghost"
                onClick={() => {
                  setImportState(null);
                  pickImport(importMode === "merge" ? "replace" : "merge");
                }}
              >
                切换为{importMode === "merge" ? "替换" : "合并"}
              </button>
              <button className="btn-ghost" onClick={() => setImportState(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
      {importError && (
        <div className="pw-modal-mask" onClick={() => setImportError(null)}>
          <div className="pw-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pw-modal-h">导入失败</div>
            <p>{importError}</p>
            <div className="pw-modal-actions">
              <button className="btn-ghost" onClick={() => setImportError(null)}>
                知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 解锁卡片：加密库需输入主密码 */
function UnlockCard({ wrong, onUnlock }: { wrong: boolean; onUnlock: (master: string) => void }) {
  const [pw, setPw] = useState("");
  return (
    <div className="pw-body-center">
      <div className="pw-unlock">
        <Lock size={26} style={{ color: "var(--accent-text)" }} />
        <h2>密码库已加密</h2>
        <p>输入主密码解锁本次会话（主密码仅存于内存，不会写入磁盘）。</p>
        <input
          type="password"
          placeholder="主密码"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && pw && onUnlock(pw)}
          autoFocus
        />
        {wrong && <div className="pw-err">主密码错误，请重试。</div>}
        <button className="btn-ghost" disabled={!pw} onClick={() => onUnlock(pw)}>
          解锁
        </button>
      </div>
    </div>
  );
}

/** 自动上锁设置（Issue #4）：分钟数（0 = 关闭），回车/失焦保存 */
function AutoLockControl() {
  const minutes = usePw((s) => s.autoLockMinutes);
  const setMinutes = usePw((s) => s.setAutoLockMinutes);
  const [draft, setDraft] = useState(String(minutes));
  useEffect(() => setDraft(String(minutes)), [minutes]);
  const commit = () => {
    const n = Number(draft.trim() === "" ? 0 : draft);
    if (!Number.isFinite(n)) {
      setDraft(String(minutes));
      return;
    }
    void setMinutes(n);
  };
  return (
    <label className="pw-autolock" title="无操作超过设定分钟数后自动上锁（0 = 关闭）">
      <Timer size={14} />
      <input
        type="number"
        min={0}
        max={1440}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <span>分钟自动上锁</span>
    </label>
  );
}

/** 主密码弹窗：设置 / 更改 / 移除 */
function MasterModal({ onClose }: { onClose: () => void }) {
  const pw = usePw();
  const currentSet = pw.masterPassword !== null;
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // 锁态防护：未解锁时禁止操作主密码（否则会用空内存库覆盖磁盘加密库）
  const locked = pw.encrypted && !pw.unlocked;

  const submit = async () => {
    if (newPw !== confirmPw) {
      setErr("两次输入不一致");
      return;
    }
    // 主密码不限制长度（Issue #4）：任意非空即可，强度由用户自行把握
    try {
      await pw.setMasterPassword(newPw.length > 0 ? newPw : null);
      setDone(newPw.length > 0 ? "已加密保存" : "已移除主密码，转为明文保存");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="pw-modal-mask" onClick={onClose}>
      <div className="pw-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pw-modal-h">{currentSet ? "更改主密码" : "设置主密码"}</div>
        {locked ? (
          <>
            <p className="pw-warn-line">密码库已锁定，请先解锁后再管理主密码（避免误覆盖加密数据）。</p>
            <div className="pw-modal-actions">
              <button className="btn-ghost" onClick={onClose}>
                知道了
              </button>
            </div>
          </>
        ) : done ? (
          <>
            <p>
              <Check size={15} style={{ display: "inline", verticalAlign: -2, color: "var(--ok)" }} /> {done}
            </p>
            <div className="pw-modal-actions">
              <button className="btn-ghost" onClick={onClose}>
                完成
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="pw-note">
              主密码用于整库加密（AES-256-GCM + scrypt），仅保存在本会话内存中。
              {currentSet ? "输入新主密码将立即用新密码重新加密写盘。" : "设置后每次打开需先解锁。留空并确认可移除主密码（转明文）。"}
            </p>
            <input type="password" placeholder="新主密码（任意长度）" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoFocus />
            <input type="password" placeholder="确认新主密码" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void submit()} />
            {err && <div className="pw-err">{err}</div>}
            <div className="pw-modal-actions">
              <button className="btn-ghost" onClick={() => void submit()} disabled={newPw !== confirmPw}>
                {newPw.length > 0 ? "确认加密" : "确认移除主密码"}
              </button>
              <button className="btn-ghost" onClick={onClose}>
                取消
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** 凭证库：左列表 + 右详情 */
function VaultView() {
  const pw = usePw();
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // editing：null=浏览态；否则为编辑草稿（新条目或现有条目副本）
  const [editing, setEditing] = useState<PwEntry | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const entries = pw.db.entries;
  const categories = useMemo(() => {
    const set = new Map<string, number>();
    for (const e of entries) set.set(e.category || "其他", (set.get(e.category || "其他") ?? 0) + 1);
    return [...set.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries
      .filter((e) => (catFilter ? (e.category || "其他") === catFilter : true))
      .filter((e) =>
        q
          ? e.title.toLowerCase().includes(q) ||
            e.account.toLowerCase().includes(q) ||
            (e.url ?? "").toLowerCase().includes(q) ||
            (e.notes ?? "").toLowerCase().includes(q)
          : true
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [entries, query, catFilter]);

  const selected = entries.find((e) => e.id === selectedId) ?? filtered[0] ?? null;

  const startNew = () => {
    setIsNew(true);
    setEditing({
      id: crypto.randomUUID(),
      title: "",
      category: catFilter ?? "其他",
      account: "",
      password: "",
      url: "",
      notes: "",
      updatedAt: Date.now(),
      createdAt: Date.now(),
      history: [],
    });
    setChangeOpen(false);
  };

  const startEdit = (e: PwEntry) => {
    setIsNew(false);
    setEditing({ ...e });
    setChangeOpen(false);
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!editing.title.trim() && !editing.account.trim()) {
      window.alert("标题与账号至少填一项。");
      return;
    }
    if (isNew) {
      await pw.addEntry(editing);
      setSelectedId(editing.id);
    } else {
      const old = entries.find((x) => x.id === editing.id);
      if (old && old.password !== editing.password) {
        // 编辑态改了密码：旧密码入史（开始 = 旧密码启用时间，结束 = 现在）
        const now = Date.now();
        await pw.updateEntry({
          ...editing,
          updatedAt: now,
          history: old.password
            ? [...old.history, { password: old.password, startedAt: old.updatedAt, endedAt: now }]
            : old.history,
        });
      } else {
        await pw.updateEntry(editing);
      }
      setSelectedId(editing.id);
    }
    setEditing(null);
    setIsNew(false);
  };

  const removeSelected = async (e: PwEntry) => {
    if (!window.confirm(`删除凭证「${e.title || e.account}」？该操作不可撤销（含 ${e.history.length} 条历史密码）。`)) return;
    await pw.removeEntry(e.id);
    if (selectedId === e.id) setSelectedId(null);
  };

  return (
    <div className="pw-main">
      {/* 左列：搜索 + 分类过滤 + 条目列表 */}
      <div className="pw-list">
        <div className="pw-list-tools">
          <div className="pw-search">
            <Search size={13} />
            <input type="text" placeholder="搜索标题 / 账号 / 备注…" value={query} onChange={(e) => setQuery(e.target.value)} spellCheck={false} />
          </div>
          <div className="pw-cats">
            <button className={`pw-cat${catFilter === null ? " active" : ""}`} onClick={() => setCatFilter(null)}>
              全部 {entries.length}
            </button>
            {categories.map(([c, n]) => (
              <button key={c} className={`pw-cat${catFilter === c ? " active" : ""}`} onClick={() => setCatFilter(catFilter === c ? null : c)}>
                {c} {n}
              </button>
            ))}
          </div>
        </div>
        <div className="pw-list-items">
          {filtered.length === 0 ? (
            <div className="pw-list-empty">没有匹配的凭证</div>
          ) : (
            filtered.map((e) => (
              <button
                key={e.id}
                className={`pw-item${selected?.id === e.id ? " active" : ""}`}
                onClick={() => {
                  setSelectedId(e.id);
                  setEditing(null);
                  setChangeOpen(false);
                }}
              >
                <span className="pw-item-title">{e.title || e.account || "（未命名）"}</span>
                <span className="pw-item-sub">
                  <span className="pw-item-cat">{e.category || "其他"}</span>
                  {e.account && <span className="pw-item-account">{e.account}</span>}
                </span>
              </button>
            ))
          )}
        </div>
        <button className="pw-add" onClick={startNew}>
          <Plus size={15} />
          新增凭证
        </button>
      </div>

      {/* 右侧：详情 / 编辑 */}
      <div className="pw-detail">
        {editing ? (
          <EntryEditor
            draft={editing}
            isNew={isNew}
            onChange={setEditing}
            onSave={() => void saveEdit()}
            onCancel={() => {
              setEditing(null);
              setIsNew(false);
            }}
          />
        ) : selected ? (
          <EntryDetail
            entry={selected}
            onEdit={() => startEdit(selected)}
            onDelete={() => void removeSelected(selected)}
            changeOpen={changeOpen}
            setChangeOpen={setChangeOpen}
            showHistory={showHistory}
            setShowHistory={setShowHistory}
          />
        ) : (
          <div className="pw-empty">
            <KeyRound size={30} />
            <p>从左侧选择一条凭证，或点击"新增凭证"。</p>
            <p className="pw-note">
              数据存储在本地 %APPDATA%/notevault/passwords.json（默认不加密，可直接使用；
              如需加密可在顶栏设置主密码）。可用顶栏"导出"备份或迁移到另一台电脑。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** 详情（浏览态） */
function EntryDetail({
  entry,
  onEdit,
  onDelete,
  changeOpen,
  setChangeOpen,
  showHistory,
  setShowHistory,
}: {
  entry: PwEntry;
  onEdit: () => void;
  onDelete: () => void;
  changeOpen: boolean;
  setChangeOpen: (v: boolean) => void;
  showHistory: boolean;
  setShowHistory: (v: boolean) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const strength = strengthInfo(entry.password);
  // 避让集：当前密码 + 全部历史
  const exclude = [entry.password, ...entry.history.map((h) => h.password)].filter(Boolean);

  return (
    <>
      <div className="pw-detail-h">
        <span className="pw-detail-title">{entry.title || entry.account || "（未命名）"}</span>
        <span className="pw-item-cat">{entry.category || "其他"}</span>
        <span style={{ flex: 1 }} />
        <button className="icon-btn labeled" title="编辑" onClick={onEdit}>
          <Pencil size={14} />
          编辑
        </button>
        <button className="icon-btn labeled" title="更换密码（旧密码自动入史）" onClick={() => setChangeOpen(!changeOpen)}>
          <Wand2 size={14} />
          更换密码
        </button>
        <button className="icon-btn" title="删除" onClick={onDelete}>
          <Trash2 size={14} />
        </button>
      </div>
      <div className="pw-detail-body">
        <FieldRow label="账号" value={entry.account} copyable />
        <FieldRow
          label="密码"
          value={revealed ? entry.password : "••••••••••••"}
          copyValue={entry.password}
          copyable
          mono
          extra={
            <>
              <button className="icon-btn" title={revealed ? "隐藏" : "显示"} onClick={() => setRevealed(!revealed)}>
                {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <span className="pw-strength" style={{ color: strength.cssVar }} title={`熵约 ${strength.bits} bits`}>
                {strength.label}
              </span>
            </>
          }
        />
        {entry.url ? <FieldRow label="地址" value={entry.url} copyable link /> : null}
        {entry.notes ? <FieldRow label="备注" value={entry.notes} multiline /> : null}
        <div className="pw-meta">
          当前密码自 {fmtTime(entry.updatedAt)} 起 · 创建于 {fmtTime(entry.createdAt)}
        </div>

        {/* 更换密码面板 */}
        {changeOpen && (
          <div className="pw-change">
            <div className="pw-change-h">
              <Wand2 size={13} /> 生成新密码（自动避让现有与历史密码，保存后旧密码入史）
            </div>
            <PwGenerator
              compact
              excludePasswords={exclude}
              onUse={(npw) => {
                const now = Date.now();
                const e: PwEntry = {
                  ...entry,
                  password: npw,
                  updatedAt: now,
                  history: entry.password
                    ? [...entry.history, { password: entry.password, startedAt: entry.updatedAt, endedAt: now }]
                    : entry.history,
                };
                void usePw.getState().updateEntry(e);
                setChangeOpen(false);
                setShowHistory(true);
              }}
            />
          </div>
        )}

        {/* 历史 */}
        <div className="pw-history">
          <button className="pw-history-h" onClick={() => setShowHistory(!showHistory)}>
            <HistoryIcon size={14} />
            历史密码（{entry.history.length}）
            <span style={{ flex: 1 }} />
            {showHistory ? "收起 ▲" : "展开 ▼"}
          </button>
          {showHistory && (
            <div className="pw-history-list">
              {entry.history.length === 0 ? (
                <div className="pw-list-empty">暂无历史密码。每次"更换密码"后旧密码会记录在这里。</div>
              ) : (
                [...entry.history].reverse().map((h, i) => <HistoryRow key={i} item={h} index={entry.history.length - i} />)
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** 历史密码单行：展示完整使用区间（开始 ~ 结束） */
function HistoryRow({ item, index }: { item: { password: string; startedAt: number; endedAt: number }; index: number }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, copy] = useCopyFlash();
  return (
    <div className="pw-hrow">
      <span className="pw-hrow-idx">第 {index} 代</span>
      <span className="pw-hrow-pw mono">{revealed ? item.password : "••••••••••••"}</span>
      <button className="icon-btn" title={revealed ? "隐藏" : "显示"} onClick={() => setRevealed(!revealed)}>
        {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
      <button className="icon-btn" title="复制" onClick={() => copy(item.password)}>
        <Copy size={13} />
      </button>
      <span className="pw-hrow-time" title={`开始 ${fmtTime(item.startedAt)} · 结束 ${fmtTime(item.endedAt)}`}>
        {fmtTime(item.startedAt)} ~ {fmtTime(item.endedAt)}
      </span>
      {copied && <span className="pw-hrow-copied">已复制</span>}
    </div>
  );
}

/** 详情字段行；copyValue 用于遮蔽显示时复制真值（如密码） */
function FieldRow({
  label,
  value,
  copyValue,
  copyable,
  mono,
  link,
  multiline,
  extra,
}: {
  label: string;
  value: string;
  copyValue?: string;
  copyable?: boolean;
  mono?: boolean;
  link?: boolean;
  multiline?: boolean;
  extra?: React.ReactNode;
}) {
  const [copied, copy] = useCopyFlash();
  const real = copyValue ?? value;
  return (
    <div className="pw-field">
      <span className="pw-field-label">{label}</span>
      <span className={`pw-field-value${mono ? " mono" : ""}${multiline ? " multiline" : ""}`}>
        {link && value ? (
          <a href={value} target="_blank" rel="noreferrer">
            {value}
          </a>
        ) : (
          value
        )}
      </span>
      {extra}
      {copyable && real && (
        <button className="icon-btn" title="复制" onClick={() => copy(real)}>
          {copied ? <Check size={14} style={{ color: "var(--ok)" }} /> : <Copy size={14} />}
        </button>
      )}
    </div>
  );
}

/** 新增/编辑表单 */
function EntryEditor({
  draft,
  isNew,
  onChange,
  onSave,
  onCancel,
}: {
  draft: PwEntry;
  isNew: boolean;
  onChange: (e: PwEntry) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [genOpen, setGenOpen] = useState(false);
  const strength = strengthInfo(draft.password);
  return (
    <>
      <div className="pw-detail-h">
        <span className="pw-detail-title">{isNew ? "新增凭证" : "编辑凭证"}</span>
        <span style={{ flex: 1 }} />
        <button className="btn-ghost" onClick={onSave}>
          <Check size={14} /> 保存
        </button>
        <button className="icon-btn labeled" onClick={onCancel} title="取消">
          <X size={14} />
          取消
        </button>
      </div>
      <div className="pw-detail-body">
        <div className="pw-form">
          <label className="pw-form-row">
            <span className="pw-form-label">标题</span>
            <input type="text" value={draft.title} onChange={(e) => onChange({ ...draft, title: e.target.value })} placeholder="如：公司邮箱 - 张三" autoFocus />
          </label>
          <label className="pw-form-row">
            <span className="pw-form-label">分类</span>
            <input
              type="text"
              list="pw-cat-list"
              value={draft.category}
              onChange={(e) => onChange({ ...draft, category: e.target.value })}
              placeholder="选择或输入自定义分类"
            />
            <datalist id="pw-cat-list">
              {PRESET_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="pw-form-row">
            <span className="pw-form-label">账号</span>
            <input type="text" value={draft.account} onChange={(e) => onChange({ ...draft, account: e.target.value })} placeholder="邮箱 / 工号 / 用户名" spellCheck={false} />
          </label>
          <div className="pw-form-row">
            <span className="pw-form-label">密码</span>
            <div className="pw-form-pw">
              <input type="text" className="mono" value={draft.password} onChange={(e) => onChange({ ...draft, password: e.target.value })} placeholder="输入或用右侧生成器" spellCheck={false} />
              <button className="icon-btn labeled" title="生成强密码" onClick={() => setGenOpen(!genOpen)}>
                <Wand2 size={14} />
                生成
              </button>
            </div>
          </div>
          {draft.password && (
            <div className="pw-form-strength" style={{ color: strength.cssVar }}>
              强度：{strength.label} · {strength.bits} bits
            </div>
          )}
          {genOpen && (
            <div className="pw-form-gen">
              <PwGenerator compact onUse={(npw) => onChange({ ...draft, password: npw })} useLabel="填入" />
            </div>
          )}
          <label className="pw-form-row">
            <span className="pw-form-label">地址</span>
            <input type="text" value={draft.url ?? ""} onChange={(e) => onChange({ ...draft, url: e.target.value })} placeholder="https://…（可选）" spellCheck={false} />
          </label>
          <label className="pw-form-row top">
            <span className="pw-form-label">备注</span>
            <textarea
              value={draft.notes ?? ""}
              onChange={(e) => onChange({ ...draft, notes: e.target.value })}
              placeholder="轮换周期、负责人、注意事项…（可选）"
              rows={3}
            />
          </label>
        </div>
      </div>
    </>
  );
}
