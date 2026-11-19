/**
 * NoteVault Web 宿主：零第三方依赖的本地服务（复用 shared 纯逻辑）。
 * 启动：node out-web/web/server.js [--port=8321] [--open] [--vault=D:\path]
 * 仅监听 127.0.0.1；前端静态资源从 dist/ 提供；设置持久化到 %APPDATA%/notevault/settings.json
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import os from "node:os";
import type {
  FileContent,
  FileKind,
  FileNode,
  SearchHit,
  SearchResult,
  Snapshot,
  VaultInfo,
} from "../shared/types";
import { kindOf } from "../shared/types";
import {
  IGNORE_DIRS,
  MAX_MATCHES_PER_FILE,
  MAX_READ_BYTES,
  MAX_SEARCH_BYTES,
  MAX_SEARCH_FILES,
  MAX_TREE_ENTRIES,
  decodeText,
  findMatches,
  naturalCompare,
  normalizeRelPath,
  stripHtmlTags,
} from "../shared/fscore";

// ---------------- 参数与环境 ----------------
const args = process.argv.slice(2);
const argVal = (name: string): string | undefined => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
};
const PORT = Number(process.env.NOTEVAULT_WEB_PORT || argVal("port") || 8321);
const SHOULD_OPEN = args.includes("--open");
const DIST = path.resolve(__dirname, "../../dist");
// 设置文件位置：Windows 用 %APPDATA%，其他平台回退 ~/.config
const SETTINGS_FILE = (() => {
  const base =
    process.env.APPDATA ||
    (process.platform === "darwin" ? path.join(os.homedir(), ".config") : path.join(os.homedir(), ".local/share"));
  return path.join(base, "notevault", "settings.json");
})();

// ---------------- 设置持久化 ----------------
type Settings = Record<string, string>;
function loadSettings(): Settings {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8")) as Settings;
  } catch {
    return {};
  }
}
function saveSettings(s: Settings): void {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2), "utf-8");
}
const settings = loadSettings();

// ---------------- 笔记库状态 ----------------
let vaultPath: string | null = settings["last_vault"] || null;
if (argVal("vault")) vaultPath = path.resolve(argVal("vault")!);

function countFiles(root: string): number {
  let n = 0;
  const walk = (dir: string): void => {
    if (n >= MAX_TREE_ENTRIES) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (n >= MAX_TREE_ENTRIES) return;
      if (e.isDirectory()) {
        if (IGNORE_DIRS.has(e.name)) continue;
        walk(path.join(dir, e.name));
      } else if (e.isFile()) n++;
    }
  };
  walk(root);
  return n;
}

function requireVault(): string {
  if (!vaultPath || !fs.existsSync(vaultPath)) {
    throw new Error("尚未设置笔记库目录，请先在顶栏选择笔记目录");
  }
  return vaultPath;
}

// ---------------- 文件树 ----------------
function buildTree(): FileNode {
  const root = requireVault();
  let budget = MAX_TREE_ENTRIES;
  const walk = (dir: string, rel: string, name: string): FileNode => {
    const node: FileNode = {
      path: rel,
      name,
      dir: true,
      kind: "other",
      size: 0,
      mtimeMs: 0,
      children: [],
    };
    try {
      node.mtimeMs = fs.statSync(dir).mtimeMs;
    } catch {
      /* ignore */
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      node.children = null;
      return node;
    }
    const dirs: fs.Dirent[] = [];
    const files: fs.Dirent[] = [];
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!IGNORE_DIRS.has(e.name)) dirs.push(e);
      } else if (e.isFile()) {
        files.push(e);
      }
    }
    const cmp = (a: fs.Dirent, b: fs.Dirent) => naturalCompare(a.name, b.name);
    dirs.sort(cmp);
    files.sort(cmp);
    for (const e of [...dirs, ...files]) {
      if (budget <= 0) break;
      budget--;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        node.children!.push(walk(path.join(dir, e.name), childRel, e.name));
      } else {
        let size = 0;
        let mtimeMs = 0;
        try {
          const st = fs.statSync(path.join(dir, e.name));
          size = st.size;
          mtimeMs = st.mtimeMs;
        } catch {
          /* ignore */
        }
        node.children!.push({
          path: childRel,
          name: e.name,
          dir: false,
          kind: kindOf(e.name),
          size,
          mtimeMs,
          children: null,
        });
      }
    }
    return node;
  };
  return walk(root, "", path.basename(root) || root);
}

// ---------------- 文件读取 ----------------
function readFileContent(rel: string): FileContent {
  const root = requireVault();
  const norm = normalizeRelPath(rel);
  if (norm === null || !norm) throw new Error("非法路径");
  const abs = path.resolve(root, norm);
  if (!abs.startsWith(root + path.sep)) throw new Error("路径越界");
  const st = fs.statSync(abs);
  if (st.isDirectory()) throw new Error("这是一个目录");
  const kind: FileKind = kindOf(path.basename(abs));
  const meta = {
    path: norm,
    name: path.basename(abs),
    kind,
    size: st.size,
    mtimeMs: st.mtimeMs,
  };
  if (kind === "image" || kind === "other") {
    return { ...meta, content: "", truncated: false, encoding: "binary" };
  }
  const truncated = st.size > MAX_READ_BYTES;
  const buf = fs.readFileSync(abs).subarray(0, Math.min(st.size, MAX_READ_BYTES));
  const { content, encoding } = decodeText(buf);
  return { ...meta, content, truncated, encoding };
}

// ---------------- 全文搜索 ----------------
function searchVault(query: string, caseSensitive: boolean): SearchResult {
  const root = requireVault();
  const started = Date.now();
  const q = query.trim();
  if (!q) return { hits: [], fileCount: 0, matchCount: 0, truncated: false, elapsedMs: 0 };
  const hits: SearchHit[] = [];
  let filesScanned = 0;
  let matchCount = 0;
  let truncated = false;
  const walk = (dir: string, rel: string): void => {
    if (truncated || filesScanned >= MAX_SEARCH_FILES) {
      if (filesScanned >= MAX_SEARCH_FILES) truncated = true;
      return;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (truncated || filesScanned >= MAX_SEARCH_FILES) break;
      if (e.isDirectory()) {
        if (!IGNORE_DIRS.has(e.name)) walk(path.join(dir, e.name), rel ? `${rel}/${e.name}` : e.name);
      } else if (e.isFile()) {
        const kind = kindOf(e.name);
        if (kind !== "markdown" && kind !== "html" && kind !== "text") continue;
        filesScanned++;
        const childRel = rel ? `${rel}/${e.name}` : e.name;
        const abs = path.join(dir, e.name);
        let buf: Buffer;
        try {
          const st = fs.statSync(abs);
          if (st.size > MAX_SEARCH_BYTES) continue;
          buf = fs.readFileSync(abs);
        } catch {
          continue;
        }
        let { content } = decodeText(buf);
        if (!content) continue;
        if (kind === "html") content = stripHtmlTags(content);
        const matches = findMatches(content, q, MAX_MATCHES_PER_FILE, caseSensitive);
        if (matches.length > 0) {
          matchCount += matches.length;
          hits.push({ path: childRel, name: e.name, kind, matches });
        }
        if (matchCount >= 600) truncated = true;
      }
    }
  };
  walk(root, "");
  hits.sort((a, b) => b.matches.length - a.matches.length || naturalCompare(a.path, b.path));
  return { hits, fileCount: hits.length, matchCount, truncated, elapsedMs: Date.now() - started };
}

// ---------------- 快照（自动刷新） ----------------
function snapshot(): Snapshot {
  const root = requireVault();
  const entries: Record<string, { mtimeMs: number; size: number }> = {};
  let truncated = false;
  let n = 0;
  const walk = (dir: string, rel: string): void => {
    if (truncated) return;
    let list: fs.Dirent[];
    try {
      list = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of list) {
      if (truncated) return;
      if (e.isDirectory()) {
        if (!IGNORE_DIRS.has(e.name)) walk(path.join(dir, e.name), rel ? `${rel}/${e.name}` : e.name);
      } else if (e.isFile()) {
        if (++n > 8000) {
          truncated = true;
          return;
        }
        try {
          const st = fs.statSync(path.join(dir, e.name));
          entries[rel ? `${rel}/${e.name}` : e.name] = { mtimeMs: st.mtimeMs, size: st.size };
        } catch {
          /* ignore */
        }
      }
    }
  };
  walk(root, "");
  return { entries, truncated };
}

// ---------------- 外部打开 ----------------
function openExternal(p: string): void {
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", p], { detached: true, stdio: "ignore" }).unref();
  } else if (process.platform === "darwin") {
    spawn("open", [p], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [p], { detached: true, stdio: "ignore" }).unref();
  }
}

// ---------------- API 路由（与 Tauri 命令一一对应） ----------------
function vaultInfo(p: string | null): VaultInfo | null {
  if (!p || !fs.existsSync(p)) return null;
  const st = fs.statSync(p);
  if (!st.isDirectory()) return null;
  return { path: p, name: path.basename(p) || p, fileCount: countFiles(p) };
}

const routes: Record<string, (payload: Record<string, unknown>) => unknown> = {
  __ping: () => ({ ok: true, host: "web", version: "0.1.0" }),
  vault_info: (p) => vaultInfo(typeof p.path === "string" && p.path ? path.resolve(String(p.path)) : vaultPath),
  vault_pick: () => null, // Web 版由前端弹输入框
  vault_set: (p) => {
    const abs = path.resolve(String(p.path ?? ""));
    const info = vaultInfo(abs);
    if (!info) throw new Error(`目录不存在或不可访问：${abs}`);
    vaultPath = abs;
    settings["last_vault"] = abs;
    saveSettings(settings);
    return info;
  },
  vault_list: () => {
    const v = settings["vault_history"];
    return v ? (JSON.parse(v) as string[]) : [];
  },
  fs_tree: () => buildTree(),
  fs_read: (p) => readFileContent(String(p.path ?? "")),
  fs_stat: (p) => {
    const root = requireVault();
    const out: Record<string, { mtimeMs: number; size: number }> = {};
    for (const rel of (Array.isArray(p.paths) ? p.paths : []).map(String)) {
      try {
        const st = fs.statSync(path.resolve(root, normalizeRelPath(rel) ?? ""));
        out[rel] = { mtimeMs: st.mtimeMs, size: st.size };
      } catch {
        /* 文件可能已删除 */
      }
    }
    return out;
  },
  fs_snapshot: () => snapshot(),
  fs_search: (p) => searchVault(String(p.query ?? ""), p.caseSensitive === true),
  settings_get: (p) => settings[String(p.key ?? "")] ?? null,
  settings_set: (p) => {
    settings[String(p.key ?? "")] = String(p.value ?? "");
    saveSettings(settings);
    return null;
  },
  reveal_in_explorer: (p) => {
    const abs = String(p.path ?? "");
    if (process.platform === "win32") spawn("explorer", ["/select,", abs], { detached: true, stdio: "ignore" }).unref();
    else openExternal(path.dirname(abs));
    return null;
  },
  open_external: (p) => {
    openExternal(String(p.path ?? ""));
    return null;
  },
};

// ---------------- MIME ----------------
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".log": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
  ".wasm": "application/wasm",
};

const json = (res: http.ServerResponse, code: number, data: unknown): void => {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data ?? null));
};

// 文件流式响应（供 /vault 与 /raw）
function serveFile(res: http.ServerResponse, abs: string): void {
  const ext = path.extname(abs).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  fs.createReadStream(abs).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://127.0.0.1");

    // API：POST /api/<cmd>
    if (req.method === "POST" && url.pathname.startsWith("/api/")) {
      const channel = url.pathname.slice(5);
      const handler = routes[channel];
      if (!handler) return json(res, 404, { error: `未知命令: ${channel}` });
      let body = "";
      for await (const chunk of req) body += chunk;
      let payload: Record<string, unknown> = {};
      if (body) {
        try {
          payload = JSON.parse(body);
        } catch {
          return json(res, 400, { error: "请求体不是合法 JSON" });
        }
      }
      try {
        return json(res, 200, await handler(payload));
      } catch (e) {
        return json(res, 400, { error: e instanceof Error ? e.message : String(e) });
      }
    }

    // 笔记库静态文件：GET /vault/<rel>（真实相对路径，保障 HTML 内相对引用）
    if (req.method === "GET" && url.pathname.startsWith("/vault/")) {
      const root = requireVault();
      const norm = normalizeRelPath(decodeURIComponent(url.pathname.slice("/vault/".length)));
      if (!norm) return json(res, 400, { error: "非法路径" });
      const abs = path.resolve(root, norm);
      if (!abs.startsWith(root + path.sep)) return json(res, 403, { error: "路径越界" });
      if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) return json(res, 404, { error: "文件不存在" });
      return serveFile(res, abs);
    }

    // 库外绝对路径文件：GET /raw?path=<abs>（md 中偶发的绝对路径引用）
    if (req.method === "GET" && url.pathname === "/raw") {
      const p = decodeURIComponent(url.searchParams.get("path") || "");
      if (!p) return json(res, 400, { error: "缺少 path 参数" });
      const abs = path.resolve(p);
      if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) return json(res, 404, { error: "文件不存在" });
      return serveFile(res, abs);
    }

    // 静态资源（SPA 回退 index.html）
    let urlPath = decodeURIComponent(url.pathname);
    if (urlPath === "/") urlPath = "/index.html";
    let filePath = path.join(DIST, urlPath);
    if (!filePath.startsWith(DIST)) {
      res.writeHead(403);
      return res.end();
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST, "index.html");
    }
    if (!fs.existsSync(filePath)) {
      return json(res, 503, { error: "前端产物缺失，请先运行 npm run build:renderer" });
    }
    return serveFile(res, filePath);
  } catch (e) {
    json(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
});

function openBrowser(url: string): void {
  try {
    if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    }
  } catch {
    /* 打开浏览器失败不影响服务 */
  }
}

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log(`NoteVault Web 已启动：${url}`);
  console.log(`笔记库：${vaultPath ?? "（未设置，可在页面顶栏选择）"}`);
  console.log(`设置文件：${SETTINGS_FILE}`);
  console.log("关闭此窗口即停止服务。");
  if (SHOULD_OPEN) openBrowser(url);
});
server.on("error", (e) => {
  if ((e as NodeJS.ErrnoException).code === "EADDRINUSE") {
    console.error(`端口 ${PORT} 已被占用。可能已在运行，直接访问 http://127.0.0.1:${PORT}；或用 --port=其他端口 启动。`);
  } else {
    console.error(e);
  }
  process.exit(1);
});
