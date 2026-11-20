/** 轻量渲染组件（HTML iframe / 图片），不依赖 Markdown 渲染栈 */
import { Code2 } from "lucide-react";
import { fileUrl } from "../../api/client";

/** HTML 文件：浏览器内核 iframe 渲染 */
export function HtmlView({ path }: { path: string }) {
  return (
    <>
      <div className="html-notice">
        <Code2 size={13} style={{ color: "var(--warn)" }} />
        已使用浏览器内核渲染此 HTML 文件 · 工具条可切换源码或在系统浏览器打开
      </div>
      <iframe
        className="html-frame"
        src={fileUrl(path)}
        sandbox="allow-scripts allow-forms allow-popups allow-modals"
        title="HTML 预览"
      />
    </>
  );
}

/** 图片文件 */
export function ImageView({ path }: { path: string }) {
  return (
    <div className="img-view">
      <img src={fileUrl(path)} alt={path} decoding="async" />
    </div>
  );
}
