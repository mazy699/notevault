/** 密码生成器：规则配置（长度/字符类/排除字符）+ CSPRNG 生成 + 强度指示 + 会话生成历史 */
import { useState } from "react";
import { Copy, RefreshCw, Wand2 } from "lucide-react";
import { DEFAULT_EXCLUDE_CHARS, DEFAULT_GEN_OPTS, generatePassword, strengthInfo, type PwGenOpts } from "../../lib/pwgen";

export function PwGenerator({
  excludePasswords = [],
  onUse,
  compact = false,
  useLabel = "使用此密码",
}: {
  /** 需要避让的密码（如条目当前密码 + 最近历史） */
  excludePasswords?: string[];
  /** 提供时显示"使用此密码"按钮（换密码场景） */
  onUse?: (pw: string) => void;
  /** 紧凑模式（内嵌在更换密码面板时） */
  compact?: boolean;
  useLabel?: string;
}) {
  const [opts, setOpts] = useState<PwGenOpts>({ ...DEFAULT_GEN_OPTS });
  const [excludeConfusable, setExcludeConfusable] = useState(true);
  const [generated, setGenerated] = useState<string[]>(() => [safeGenerate()]);
  const [history, setHistory] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const current = generated[0];

  function safeGenerate(o?: PwGenOpts): string {
    try {
      return generatePassword(o ?? opts, excludePasswords);
    } catch {
      return "";
    }
  }

  const update = (patch: Partial<PwGenOpts>) => {
    const next = { ...opts, ...patch };
    setOpts(next);
    setGenerated([safeGenerate(next)]);
  };

  const toggleConfusable = (on: boolean) => {
    setExcludeConfusable(on);
    update({ excludeChars: on ? DEFAULT_EXCLUDE_CHARS : "" });
  };

  const regenerate = () => {
    if (!current) return;
    setHistory((h) => [current, ...h].slice(0, 5));
    setGenerated([safeGenerate()]);
  };

  const strength = strengthInfo(current);
  const bits = current ? strength.bits : 0;

  const copy = async () => {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(current);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* 剪贴板不可用 */
    }
  };

  return (
    <div className={`pwgen${compact ? " compact" : ""}`}>
      <div className="pwgen-rule">
        <div className="pwgen-row">
          <span className="tag">长度</span>
          <input
            type="range"
            min={8}
            max={64}
            value={opts.length}
            onChange={(e) => update({ length: Number(e.target.value) })}
          />
          <input
            className="pwgen-len"
            type="number"
            min={8}
            max={128}
            value={opts.length}
            onChange={(e) => update({ length: Number(e.target.value) })}
          />
        </div>
        <div className="pwgen-row">
          <span className="tag">字符</span>
          {(
            [
              ["upper", "A-Z"],
              ["lower", "a-z"],
              ["digits", "0-9"],
              ["symbols", "!@#…"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="pwgen-check">
              <input
                type="checkbox"
                checked={opts[key]}
                onChange={(e) => update({ [key]: e.target.checked } as Partial<PwGenOpts>)}
                style={{ accentColor: "var(--accent)" }}
              />
              {label}
            </label>
          ))}
          <label className="pwgen-check" title="排除易混淆字符 O0oIl1|`'&quot;">
            <input type="checkbox" checked={excludeConfusable} onChange={(e) => toggleConfusable(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
            排除易混淆
          </label>
        </div>
        <div className="pwgen-row">
          <span className="tag">排除</span>
          <input
            className="pwgen-exclude"
            type="text"
            placeholder="手动追加要排除的字符，如 -+="
            value={excludeConfusable ? DEFAULT_EXCLUDE_CHARS : opts.excludeChars}
            onChange={(e) => {
              setExcludeConfusable(false);
              update({ excludeChars: e.target.value });
            }}
            spellCheck={false}
          />
        </div>
      </div>

      <div className="pwgen-result">
        <span className="pwgen-pw" title={current || undefined}>
          {current || "候选字符集为空，请调整规则"}
        </span>
        <span className="pwgen-strength" style={{ color: strength.cssVar }}>
          {strength.label} · {bits} bits
        </span>
        <button className="icon-btn" title="重新生成" onClick={regenerate} disabled={!current}>
          <RefreshCw size={15} />
        </button>
        <button className="icon-btn labeled" title="复制到剪贴板" onClick={() => void copy()} disabled={!current}>
          <Copy size={15} />
          {copied ? "已复制" : "复制"}
        </button>
        {onUse && (
          <button
            className="btn-ghost"
            title="将此密码用于当前条目"
            onClick={() => current && onUse(current)}
            disabled={!current}
          >
            <Wand2 size={13} />
            {useLabel}
          </button>
        )}
      </div>

      {excludePasswords.length > 0 && (
        <div className="pwgen-hint">已自动避让 {excludePasswords.length} 条该条目的现有/历史密码</div>
      )}

      {history.length > 0 && (
        <div className="pwgen-recent">
          <span className="pwgen-recent-label">本次会话已生成：</span>
          {history.map((h, i) => (
            <button key={i} className="pwgen-recent-item" title="复制" onClick={() => void navigator.clipboard.writeText(h).catch(() => {})}>
              {h}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
