/** 轻量渲染组件（HTML iframe / 图片），不依赖 Markdown 渲染栈 */
import { useEffect, useRef } from "react";
import { Code2 } from "lucide-react";
import { fileUrl } from "../../api/client";
import { openPreviewHref } from "../../lib/links";

/** iframe 注入脚本与宿主约定的消息标记（web/server.ts 与 vault_proto.rs 使用同一字符串） */
const PREVIEW_MSG = "notevault-preview-link";

/**
 * HTML 文件：浏览器内核 iframe 渲染。
 * 通过 ?nv_preview=1 让宿主在 HTML 中注入点击拦截脚本（Issue #7）：
 * 库内链接 → 应用内新标签；外链 → 系统浏览器/新浏览器标签；#锚点保持页内滚动。
 * sandbox 不授予 allow-top-navigation，避免把整个应用导航走。
 */
export function HtmlView({ path }: { path: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      const data = e.data as { __nv?: unknown; href?: unknown } | null;
      if (!data || data.__nv !== PREVIEW_MSG || typeof data.href !== "string") return;
      if (data.href.length > 4096) return;
      openPreviewHref(data.href, path);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [path]);

  return (
    <>
      <div className="html-notice">
        <Code2 size={13} style={{ color: "var(--warn)" }} />
        已使用浏览器内核渲染此 HTML 文件 · 工具条可切换源码或在系统浏览器打开
      </div>
      <iframe
        ref={frameRef}
        className="html-frame"
        src={fileUrl(path) + "?nv_preview=1"}
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
