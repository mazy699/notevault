import { useMemo } from "react";
import type { FileNode } from "../../../shared/types";
import { useVault } from "../../stores/vault";
import { useTabs } from "../../stores/tabs";
import { KindIcon, FolderIcon } from "../common/KindIcon";
import { ChevronRight } from "lucide-react";
import { openFileCopyMenu } from "../common/FileCopyMenu";
import { joinAbsPath } from "../../lib/format";

/** 按名称过滤树：保留命中文件与它们的所有祖先；返回 null 表示整棵剪掉 */
function prune(node: FileNode, q: string): FileNode | null {
  if (!node.dir) {
    return node.name.toLowerCase().includes(q) ? node : null;
  }
  if (node.children) {
    const children = node.children.map((c) => prune(c, q)).filter((c): c is FileNode => c !== null);
    if (children.length > 0 || node.name.toLowerCase().includes(q)) {
      return { ...node, children };
    }
  }
  return node.name.toLowerCase().includes(q) ? node : null;
}

function TreeRows({ node, depth, filter }: { node: FileNode; depth: number; filter: string }) {
  const { expanded, toggleDir } = useVault();
  const { active, openFile } = useTabs();
  const vaultPath = useVault((s) => s.info?.path ?? "");

  if (!node.dir) {
    return (
      <div
        className={`tree-row${active === node.path ? " active" : ""}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() =>
          openFile({ path: node.path, name: node.name, kind: node.kind, size: node.size, mtimeMs: node.mtimeMs })
        }
        onContextMenu={(e) => {
          e.preventDefault();
          openFileCopyMenu(e.clientX, e.clientY, {
            name: node.name,
            relPath: node.path,
            absPath: joinAbsPath(vaultPath, node.path),
          });
        }}
        title={node.path}
      >
        <KindIcon kind={node.kind} />
        <span className="f-name">{node.name}</span>
      </div>
    );
  }

  // 过滤状态下强制展开（剪枝后只剩命中分支）
  const isOpen = filter.trim() ? true : !!expanded[node.path];
  const children = node.children ?? [];
  const fileCount = children.filter((c) => !c.dir).length;

  return (
    <>
      <div
        className="tree-row"
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => toggleDir(node.path)}
        onContextMenu={(e) => {
          e.preventDefault();
          openFileCopyMenu(e.clientX, e.clientY, {
            name: node.name,
            relPath: node.path,
            absPath: joinAbsPath(vaultPath, node.path),
            dir: true,
          });
        }}
        title={node.path}
      >
        <span className={`chevron${isOpen ? " open" : ""}`}>
          <ChevronRight size={13} />
        </span>
        <FolderIcon open={isOpen} />
        <span className="f-name" style={{ fontWeight: 500 }}>
          {node.name}
        </span>
        {depth === 0 && fileCount > 0 && <span className="count">{fileCount} 个文件</span>}
      </div>
      {isOpen &&
        children.map((c) => <TreeRows key={c.path} node={c} depth={depth + 1} filter={filter} />)}
    </>
  );
}

export function FileTree({ filter }: { filter: string }) {
  const tree = useVault((s) => s.tree);
  const filtered = useMemo(() => {
    if (!tree) return null;
    if (!filter.trim()) return tree;
    return prune(tree, filter.trim().toLowerCase());
  }, [tree, filter]);

  // 过滤后整棵树无命中 → 空状态提示
  if (filter.trim() && !filtered) {
    return (
      <div style={{ padding: "18px 16px", color: "var(--text-faint)", fontSize: 12.5, textAlign: "center" }}>
        没有匹配「{filter.trim()}」的文件
      </div>
    );
  }

  if (!filtered) return null;

  const empty =
    filter.trim() &&
    (!filtered.children || filtered.children.length === 0) &&
    !filtered.name.toLowerCase().includes(filter.trim().toLowerCase());

  return (
    <>
      <TreeRows node={filtered} depth={0} filter={filter} />
      {empty && (
        <div style={{ padding: "18px 16px", color: "var(--text-faint)", fontSize: 12.5, textAlign: "center" }}>
          没有匹配「{filter.trim()}」的文件
        </div>
      )}
    </>
  );
}
