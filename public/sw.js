/**
 * NoteVault PWA Service Worker（轻量壳缓存）。
 * 仅缓存同源 GET 的静态壳资源（dist 带 hash 的 assets 与图标），
 * API（/api）、笔记内容（/vault）、库外文件（/raw）一律不缓存——
 * 内容实时性优先（本应用必须依赖本地 NoteVault 服务进程提供数据）。
 */
const CACHE = "notevault-shell-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  // 只处理同源静态资源
  if (url.origin !== self.location.origin) return;
  const p = url.pathname;
  // API、笔记内容、库外文件、目录历史：不缓存（实时数据）
  if (
    p.startsWith("/api/") ||
    p.startsWith("/vault/") ||
    p.startsWith("/raw") ||
    p === "/manifest.webmanifest"
  ) {
    return;
  }
  // 带内容 hash 的构建产物与图标：缓存优先
  if (p.startsWith("/assets/") || p === "/icons/icon-192.png" || p === "/icons/icon-512.png") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(event.request);
        if (hit) return hit;
        try {
          const res = await fetch(event.request);
          if (res.ok) cache.put(event.request, res.clone());
          return res;
        } catch {
          return hit || Response.error();
        }
      })()
    );
  }
});
