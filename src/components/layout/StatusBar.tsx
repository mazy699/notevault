import { useEffect, useState } from "react";
import { FolderOpen, GitBranch, Moon, Sun } from "lucide-react";
import { useUi } from "../../stores/ui";
import { useVault } from "../../stores/vault";
import { useTabs } from "../../stores/tabs";
import { api } from "../../api/client";
import { formatBytes, formatTime, countLines, joinAbsPath, parentDir } from "../../lib/format";
import { copyText } from "../viewer/FileBar";
import type { GitBranchInfo } from "../../../shared/types";

export function StatusBar() {
  const { theme, toggleTheme } = useUi();
  const info = useVault((s) => s.info);
  const { active, tabs, content } = useTabs();
  const tab = tabs.find((t) => t.path === active);
  const fc = tab ? content[tab.path] : null;
  const [flash, setFlash] = useState<string | null>(null);
  const [git, setGit] = useState<GitBranchInfo | null>(null);

  const showFlash = (message: string) => {
    setFlash(message);
    setTimeout(() => setFlash(null), 1600);
  };

  useEffect(() => {
    const onFlash = (e: Event) => {
      setFlash((e as CustomEvent).detail ?? "已刷新");
      setTimeout(() => setFlash(null), 1600);
    };
    window.addEventListener("nv-flash-refresh", onFlash);
    return () => window.removeEventListener("nv-flash-refresh", onFlash);
  }, []);

  const copyTo = async (text: string, label: string) => {
    const ok = await copyText(text);
    showFlash(ok ? `已复制${label}` : "复制失败");
  };

  const absFile = tab && info ? joinAbsPath(info.path, tab.path) : "";
  // Git 分支：优先当前文件所在目录，没有打开文件时看笔记库目录
  const gitDir = absFile ? parentDir(absFile) : (info?.path ?? "");

  useEffect(() => {
    let alive = true;
    if (!gitDir) {
      setGit(null);
      return;
    }
    api
      .gitBranch(gitDir)
      .then((r) => {
        if (alive) setGit(r.inRepo && r.branch ? r : null);
      })
      .catch(() => {
        if (alive) setGit(null);
      });
    return () => {
      alive = false;
    };
  }, [gitDir]);

  return (
    <div className="statusbar">
      <span className="clickable status-item status-vault" title="点击复制笔记库路径" onClick={() => void copyTo(info?.path ?? "", "笔记库路径")}>
        <FolderOpen size={12} />
        <span className="status-text">{info?.path ?? "未选择笔记库"}</span>
      </span>
      {git?.branch && (
        <span
          className="clickable status-item git-branch"
          title={git.detached ? "当前处于分离头指针状态（点击复制分支标识）" : `当前 Git 分支：${git.branch}（点击复制分支名）`}
          onClick={() => void copyTo(git.branch ?? "", "分支名")}
        >
          <GitBranch size={12} />
          <span className="status-text">{git.detached ? "HEAD（分离）" : git.branch}</span>
        </span>
      )}
      {flash && <span className="flash status-meta">✓ {flash}</span>}
      <span className="spacer" />
      {tab && (
        <>
          <span
            className="clickable status-item status-file"
            title={`点击复制完整路径：${absFile}`}
            onClick={() => void copyTo(absFile, "完整路径")}
          >
            <span className="status-text">{tab.path}</span>
          </span>
          <span className="status-meta">{formatBytes(fc?.size ?? tab.size)}</span>
          {fc?.mtimeMs ? <span className="status-meta">修改 {formatTime(fc.mtimeMs)}</span> : null}
          {fc && <span className="status-meta">{countLines(fc.content)} 行</span>}
        </>
      )}
      <button
        className="icon-btn"
        style={{ height: 20, minWidth: 20 }}
        title={theme === "dark" ? "切换浅色主题" : "切换深色主题"}
        onClick={toggleTheme}
      >
        {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
      </button>
    </div>
  );
}
