import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// PWA：仅 Web 模式注册 Service Worker（桌面版 Tauri 内不需要）
if (!location.href.includes("tauri")) {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* SW 注册失败不影响功能 */
    });
  }
  // 捕获浏览器安装事件，供顶栏"安装应用"按钮使用
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    (window as unknown as { __installPromptEvent: unknown }).__installPromptEvent = e;
    window.dispatchEvent(new Event("nv-install-available"));
  });
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
