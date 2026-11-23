/**
 * 文件复制菜单（Issue #2）：右键文件树/标签或点击文件栏按钮，
 * 复制「文件名 / 相对路径 / 完整路径」，复制结果在状态栏短暂提示。
 */
import { useEffect, useState } from "react";
import { Check, Copy, FileText, Route } from "lucide-react";
import { copyText } from "../viewer/FileBar";

export interface FileCopyTarget {
  /** 文件名（含扩展名）或文件夹名 */
  name: string;
  /** 库内相对路径（POSIX 风格） */
  relPath: string;
  /** 绝对路径（已按宿主分隔符拼好） */
  absPath: string;
  /** 是否为文件夹（标签页右键时省略） */
  dir?: boolean;
  /** 标签页右键附带的关闭动作 */
  onClose?: () => void;
  onCloseOthers?: () => void;
}

type MenuState = { x: number; y: number; target: FileCopyTarget } | null;

let openFn: ((s: MenuState) => void) | null = null;

/** 打开复制菜单（坐标基于视口，内部会做边界收敛） */
export function openFileCopyMenu(x: number, y: number, target: FileCopyTarget): void {
  openFn?.({ x, y, target });
}

function flash(message: string): void {
  window.dispatchEvent(new CustomEvent("nv-flash-refresh", { detail: message }));
}

const MENU_WIDTH = 340;
const MENU_HEIGHT = 300;

export function FileCopyMenu() {
  const [state, setState] = useState<MenuState>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    openFn = setState;
    return () => {
      openFn = null;
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".file-copy-menu")) setState(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setState(null);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [state]);

  if (!state) return null;
  const { x, y, target } = state;
  const left = Math.max(8, Math.min(x, window.innerWidth - MENU_WIDTH - 8));
  const top = Math.max(8, Math.min(y + 2, window.innerHeight - MENU_HEIGHT));

  const doCopy = async (kind: "name" | "rel" | "abs") => {
    const value = kind === "name" ? target.name : kind === "rel" ? target.relPath : target.absPath;
    const label = kind === "name" ? (target.dir ? "文件夹名" : "文件名") : kind === "rel" ? "相对路径" : "完整路径";
    const ok = await copyText(value);
    if (!ok) return;
    setCopied(kind);
    flash(`已复制${label}：${value.length > 60 ? value.slice(0, 57) + "…" : value}`);
    // 稍作停留让用户看到勾选反馈，再关闭菜单
    setTimeout(() => {
      setState(null);
      setCopied(null);
    }, 420);
  };

  const Item = ({
    kind,
    icon,
    label,
    value,
  }: {
    kind: "name" | "rel" | "abs";
    icon: React.ReactNode;
    label: string;
    value: string;
  }) => (
    <button className="item" onClick={() => void doCopy(kind)} title={value}>
      {copied === kind ? <Check size={14} style={{ color: "var(--ok)", flex: "none" }} /> : icon}
      <span style={{ flex: "none" }}>{label}</span>
      <span className="file-copy-hint">{value}</span>
    </button>
  );

  return (
    <div
      className="dropdown file-copy-menu"
      style={{ left, top, position: "fixed", zIndex: 90 }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="label">{target.dir ? "文件夹" : "文件"}：{target.name}</div>
      <Item kind="name" icon={<FileText size={14} />} label={`复制${target.dir ? "文件夹名" : "文件名"}`} value={target.name} />
      <Item kind="rel" icon={<Route size={14} />} label="复制相对路径" value={target.relPath} />
      <Item kind="abs" icon={<Copy size={14} />} label="复制完整路径" value={target.absPath} />
      {(target.onClose || target.onCloseOthers) && (
        <>
          <div className="divider" />
          {target.onClose && (
            <button
              className="item"
              onClick={() => {
                target.onClose?.();
                setState(null);
              }}
            >
              关闭标签
            </button>
          )}
          {target.onCloseOthers && (
            <button
              className="item"
              onClick={() => {
                target.onCloseOthers?.();
                setState(null);
              }}
            >
              关闭其他标签
            </button>
          )}
        </>
      )}
    </div>
  );
}
