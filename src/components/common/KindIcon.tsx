import { FileText, Code2, FileType2, Image as ImageIcon, File as FileIcon, Folder, FolderOpen } from "lucide-react";
import type { CSSProperties } from "react";
import type { FileKind } from "../../../shared/types";

const KIND_STYLE: Record<FileKind, { color: string; Icon: typeof FileText }> = {
  markdown: { color: "#8b7bff", Icon: FileText },
  html: { color: "#f0925a", Icon: Code2 },
  text: { color: "#9ea1a8", Icon: FileType2 },
  image: { color: "#4cc3c9", Icon: ImageIcon },
  other: { color: "#6e7076", Icon: FileIcon },
};

/** 文件类型图标（带类型色） */
export function KindIcon({ kind, size = 14 }: { kind: FileKind; size?: number }) {
  const { color, Icon } = KIND_STYLE[kind];
  return (
    <span className="f-icon" style={{ color }} title={kind}>
      <Icon size={size} strokeWidth={2} />
    </span>
  );
}

const FOLDER_STYLE: CSSProperties = { color: "var(--warn)" };

export function FolderIcon({ open, size = 14 }: { open: boolean; size?: number }) {
  const Icon = open ? FolderOpen : Folder;
  return (
    <span className="f-icon" style={FOLDER_STYLE}>
      <Icon size={size} strokeWidth={2} />
    </span>
  );
}
