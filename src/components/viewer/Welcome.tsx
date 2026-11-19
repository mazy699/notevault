import { FolderOpen, Sparkles, BookOpenText, FileCode2 } from "lucide-react";
import { useVault } from "../../stores/vault";
import { useUi } from "../../stores/ui";

/** 未选笔记库 / 无打开文件时的空状态 */
export function Welcome() {
  const info = useVault((s) => s.info);
  const setVaultMenuOpen = useUi((s) => s.setVaultMenuOpen);

  if (!info) {
    return (
      <div className="empty-state">
        <div className="empty-card">
          <div className="logo-big">
            <BookOpenText size={30} />
          </div>
          <h1>NoteVault 笔记查看器</h1>
          <p>
            统一查看 AI 开发过程产出的 <b>Markdown</b> 与 <b>HTML</b> 文档：
            <br />
            目录树浏览 · 自动渲染 · Mermaid 图表 · 全文搜索 · 一键复制源码
          </p>
          <button className="btn-primary" onClick={() => setVaultMenuOpen(true)}>
            <FolderOpen size={16} />
            打开笔记目录
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="empty-state">
      <div className="empty-card">
        <div className="logo-big">
          <Sparkles size={28} />
        </div>
        <h1>开始阅读</h1>
        <p>从左侧文件树中选择一个文件，或使用下面的快捷方式。</p>
        <div className="kbd-hint">
          <div className="row">
            <kbd>Ctrl P</kbd> 快速打开文件
            <span className="k-desc">模糊搜索文件名</span>
          </div>
          <div className="row">
            <kbd>Ctrl ⇧ F</kbd> 全文搜索
            <span className="k-desc">跨整个笔记库查找</span>
          </div>
          <div className="row">
            <kbd>Ctrl B</kbd> 侧栏开关
            <span className="k-desc">获得更宽的阅读空间</span>
          </div>
          <div className="row">
            <kbd>Ctrl E</kbd> 渲染 / 源码
            <span className="k-desc">
              <FileCode2 size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
              查看并复制原始内容
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
