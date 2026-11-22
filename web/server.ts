/**
 * NoteVault Web 宿主：零第三方依赖的本地服务（复用 shared 纯逻辑）。
 * 启动：node out-web/web/server.js [--port=8321] [--open] [--vault=D:\path]
 * 仅监听 127.0.0.1；前端静态资源从 dist/ 提供；设置持久化到 %APPDATA%/notevault/settings.json
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import os from "node:os";
import nodeCrypto from "node:crypto";
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
// 设置文件位置：Windows 用 %APPDATA%，其他平台回退 ~/.local/share（与桌面宿主一致）
const SETTINGS_FILE = (() => {
  const base = process.env.APPDATA || path.join(os.homedir(), ".local/share");
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
        if (matchCount >= 600) {
          truncated = true;
          break;
        }
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

// ---------------- 任意路径文本读取（Diff 文件模式） ----------------
function readFileAbs(abs: string): FileContent {
  if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    throw new Error(`文件不存在或不可访问：${abs}`);
  }
  const st = fs.statSync(abs);
  const name = path.basename(abs);
  const kind = kindOf(name);
  if (kind === "image" || kind === "other") {
    throw new Error(`不支持的文件类型：${name}（仅支持文本/代码类文件对比）`);
  }
  const truncated = st.size > MAX_READ_BYTES;
  const buf = fs.readFileSync(abs).subarray(0, Math.min(st.size, MAX_READ_BYTES));
  const { content, encoding } = decodeText(buf);
  return { path: abs, name, kind, size: st.size, mtimeMs: st.mtimeMs, content, truncated, encoding };
}

// ---------------- Git 只读命令（Diff Git 模式） ----------------
function runGitRaw(args: string[], cwd: string, bufferMode = false): { ok: true; stdout: string | Buffer } | { ok: false; error: string } {
  const r = spawnSync("git", ["-C", cwd, "--no-pager", "-c", "core.quotepath=false", ...args], {
    encoding: bufferMode ? "buffer" : "utf-8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 30000,
  });
  if (r.error) {
    if ((r.error as NodeJS.ErrnoException).code === "ENOENT") {
      return { ok: false, error: "未检测到 git 命令，请先安装 Git 并加入 PATH" };
    }
    return { ok: false, error: `git 执行失败：${String(r.error)}` };
  }
  if (r.status !== 0) {
    const msg =
      (String(r.stderr || r.stdout || "").trim().split("\n").pop() ?? "git 命令失败").slice(0, 300);
    return { ok: false, error: msg };
  }
  return { ok: true, stdout: r.stdout ?? "" };
}

function runGit(args: string[], cwd: string): { ok: true; stdout: string } | { ok: false; error: string } {
  const r = runGitRaw(args, cwd, false);
  return r.ok ? { ok: true, stdout: String(r.stdout) } : r;
}

function requireAbsDir(p: string): string {
  const abs = path.resolve(p);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    throw new Error(`目录不存在或不可访问：${abs}`);
  }
  return abs;
}

function vaultInfo(p: string | null): VaultInfo | null {
  if (!p || !fs.existsSync(p)) return null;
  const st = fs.statSync(p);
  if (!st.isDirectory()) return null;
  return { path: p, name: path.basename(p) || p, fileCount: countFiles(p) };
}

const routes: Record<string, (payload: Record<string, unknown>) => unknown> = {
  __ping: () => ({ ok: true, host: "web", version: "0.7.0" }),
  vault_info: (p) => vaultInfo(typeof p.path === "string" && p.path ? path.resolve(String(p.path)) : vaultPath),
  vault_pick: () => null, // Web 版由前端弹输入框
  vault_set: (p) => {
    const abs = path.resolve(String(p.path ?? ""));
    const info = vaultInfo(abs);
    if (!info) throw new Error(`目录不存在或不可访问：${abs}`);
    vaultPath = abs;
    settings["last_vault"] = abs;
    // 维护最近使用历史（与桌面宿主同一文件、同一逻辑）
    const hist: string[] = (() => {
      try {
        return JSON.parse(settings["vault_history"] || "[]") as string[];
      } catch {
        return [];
      }
    })().filter((x) => x !== abs);
    hist.unshift(abs);
    settings["vault_history"] = JSON.stringify(hist.slice(0, 10));
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
      const norm = normalizeRelPath(rel);
      if (norm === null || !norm) continue;
      try {
        const st = fs.statSync(path.resolve(root, norm));
        if (st.isFile()) out[rel] = { mtimeMs: st.mtimeMs, size: st.size };
      } catch {
        /* 文件可能已删除 */
      }
    }
    return out;
  },
  fs_snapshot: () => snapshot(),
  fs_search: (p) => searchVault(String(p.query ?? ""), p.caseSensitive === true),
  fs_read_abs: (p) => readFileAbs(path.resolve(String(p.path ?? ""))),
  fs_list_dir: (p) => {
    const abs = path.resolve(String(p.dirPath ?? ""));
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
      throw new Error(`目录不存在或不可访问：${abs}`);
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch (e) {
      throw new Error(`读取目录失败：${String(e)}`);
    }
    const list = entries
      .filter((e) => !e.name.startsWith("."))
      .slice(0, 2000)
      .map((e) => ({ name: e.name, dir: e.isDirectory() }))
      .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
    return { entries: list };
  },
  git_ls: (p) => {
    const abs = requireAbsDir(String(p.repoPath ?? ""));
    const r = runGit(["ls-files"], abs);
    if (!r.ok) throw new Error(r.error);
    return { files: r.stdout.split("\n").filter((s) => s.trim() !== "").slice(0, 5000) };
  },
  git_log: (p) => {
    const abs = requireAbsDir(String(p.repoPath ?? ""));
    const file = String(p.filePath ?? "");
    if (!file) throw new Error("缺少文件路径");
    const r = runGit(
      ["log", "--pretty=format:%H%x1f%h%x1f%an%x1f%aI%x1f%s", "-n", "200", "--follow", "--", file],
      abs
    );
    if (!r.ok) throw new Error(r.error);
    const commits = r.stdout
      .split("\n")
      .filter((s) => s.trim() !== "")
      .map((line) => {
        const [hash, short, author, date, subject] = line.split("\x1f");
        return {
          hash: hash ?? "",
          subject: `${short ?? ""} ${subject ?? ""}`.trim(),
          author: author ?? "",
          date: date ?? "",
        };
      })
      .filter((c) => c.hash !== "");
    return { commits };
  },
  git_show: (p) => {
    const abs = requireAbsDir(String(p.repoPath ?? ""));
    const file = String(p.filePath ?? "");
    const ref = String(p.ref ?? "");
    if (!file || !ref) throw new Error("缺少文件路径或版本");
    if (ref === "WORKDIR") {
      return readFileAbs(path.join(abs, normalizeRelPath(file) ?? file));
    }
    const r = runGitRaw(["show", `${ref}:${file}`], abs, true);
    if (!r.ok) throw new Error(r.error);
    const bytes = Buffer.isBuffer(r.stdout) ? r.stdout : Buffer.from(r.stdout, "utf-8");
    const { content, encoding } = decodeText(bytes.subarray(0, MAX_READ_BYTES));
    return {
      path: `${file}@${ref.slice(0, 10)}`,
      name: path.basename(file),
      kind: kindOf(path.basename(file)),
      size: Buffer.byteLength(r.stdout, "utf-8"),
      mtimeMs: 0,
      content,
      truncated: false,
      encoding,
    };
  },
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

  // ---------------- 密码工作台 ----------------
  pw_load: (p) => pwLoad(typeof p.masterPassword === "string" ? p.masterPassword : undefined),
  pw_save: (p) => {
    const db = p.db as Record<string, unknown> | null;
    if (!db || typeof db !== "object") throw new Error("密码库数据缺失");
    pwSave(db, typeof p.masterPassword === "string" && p.masterPassword ? p.masterPassword : null);
    return { ok: true };
  },
  save_text_file: () => {
    // Web 宿主无文件对话框：前端按 isTauri 分流走浏览器下载
    return { ok: false, path: undefined };
  },

  // ---------------- Worklog 工作台：整库文件读写（与独立 Worklog 共用 %APPDATA%/worklog） ----------------
  wl_db_load: () => {
    const dir = worklogDataDir();
    const file = path.join(dir, "worklog.db");
    if (!fs.existsSync(file)) return { dataDir: dir, dbFile: file, b64: null };
    return { dataDir: dir, dbFile: file, b64: fs.readFileSync(file).toString("base64") };
  },
  wl_db_save: (p) => {
    const dir = worklogDataDir();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "worklog.db");
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, Buffer.from(String(p.b64 ?? ""), "base64"));
    fs.renameSync(tmp, file);
    return { ok: true };
  },
  wl_aux_read: (p) => {
    const name = safeAuxName(p.name);
    const file = path.join(worklogDataDir(), name);
    return { text: fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : null };
  },
  wl_aux_write: (p) => {
    const name = safeAuxName(p.name);
    const dir = worklogDataDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), String(p.text ?? ""), "utf-8");
    return { ok: true };
  },
  wl_backup: (p) => {
    const dir = worklogDataDir();
    const bdir = path.join(dir, "backups");
    fs.mkdirSync(bdir, { recursive: true });
    const stamp = new Date()
      .toISOString()
      .replace(/[-:T]/g, "")
      .slice(0, 14);
    const dest = path.join(bdir, `worklog-${stamp}.db`);
    fs.writeFileSync(dest, Buffer.from(String(p.b64 ?? ""), "base64"));
    // 保留最近 10 份
    const files = fs
      .readdirSync(bdir)
      .filter((f) => f.startsWith("worklog-") && f.endsWith(".db"))
      .sort()
      .reverse();
    for (let i = 10; i < files.length; i++) {
      try {
        fs.unlinkSync(path.join(bdir, files[i]));
      } catch {
        /* 单个删除失败不阻塞 */
      }
    }
    return { path: dest };
  },
  wl_data_info: () => {
    const dir = worklogDataDir();
    return { dataDir: dir, dbFile: path.join(dir, "worklog.db") };
  },
  wl_ai_proxy: async (p) => {
    const url = String(p.url ?? "");
    if (!/^https?:\/\//i.test(url)) throw new Error("AI 代理仅支持 http(s) 地址");
    const method = String(p.method ?? "POST").toUpperCase();
    const headers: Record<string, string> =
      p.headers && typeof p.headers === "object" ? (p.headers as Record<string, string>) : {};
    const body = typeof p.body === "string" ? p.body : undefined;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90000);
    try {
      const res = await fetch(url, { method, headers, body, signal: ctrl.signal });
      const text = await res.text();
      return { status: res.status, body: text.slice(0, 2 * 1024 * 1024) };
    } finally {
      clearTimeout(timer);
    }
  },
};

/** Worklog 数据目录：WORKLOG_DATA_DIR 覆盖，默认 %APPDATA%/worklog（与独立 Worklog 共用） */
function worklogDataDir(): string {
  if (process.env.WORKLOG_DATA_DIR) return path.resolve(process.env.WORKLOG_DATA_DIR);
  const base = process.env.APPDATA || path.join(os.homedir(), ".local/share");
  return path.join(base, "worklog");
}

/** 附属文件名白名单：仅允许简单 json 文件名（防路径穿越） */
function safeAuxName(v: unknown): string {
  const name = String(v ?? "");
  if (!/^[\w.-]+\.json$/.test(name) || name.includes("..")) throw new Error("非法的附属文件名");
  return name;
}

// ---------------- 密码库存储（%APPDATA%/notevault/passwords.json，与桌面宿主同一路径/同一加密格式） ----------------
const PW_FILE = path.join(path.dirname(SETTINGS_FILE), "passwords.json");

/** scrypt KDF 参数（与桌面宿主 Rust 端严格一致：N=2^15, r=8, p=1 → 32 字节密钥） */
const SCRYPT_OPTS = { cost: 1 << 15, blockSize: 8, parallelization: 1, maxmem: 96 * 1024 * 1024 };

function pwEncrypt(dbJson: string, master: string): string {
  const salt = nodeCrypto.randomBytes(16);
  const nonce = nodeCrypto.randomBytes(12);
  const key = nodeCrypto.scryptSync(master, salt, 32, SCRYPT_OPTS);
  const cipher = nodeCrypto.createCipheriv("aes-256-gcm", key, nonce);
  const ct = Buffer.concat([cipher.update(dbJson, "utf-8"), cipher.final()]);
  const enc = {
    format: "notevault-pw-enc-v1",
    kdf: "scrypt",
    salt: salt.toString("base64"),
    nonce: nonce.toString("base64"),
    data: Buffer.concat([ct, cipher.getAuthTag()]).toString("base64"),
  };
  return JSON.stringify(enc, null, 2);
}

function pwDecrypt(rawJson: string, master: string): string {
  const enc = JSON.parse(rawJson) as { salt: string; nonce: string; data: string };
  const salt = Buffer.from(enc.salt, "base64");
  const nonce = Buffer.from(enc.nonce, "base64");
  const blob = Buffer.from(enc.data, "base64");
  const key = nodeCrypto.scryptSync(master, salt, 32, SCRYPT_OPTS);
  const ct = blob.subarray(0, blob.length - 16);
  const tag = blob.subarray(blob.length - 16);
  const decipher = nodeCrypto.createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf-8");
}

function pwLoad(master?: string): { encrypted: boolean; db: unknown; wrongPassword?: boolean } {
  let raw: string;
  try {
    raw = fs.readFileSync(PW_FILE, "utf-8");
  } catch {
    return { encrypted: false, db: { format: "notevault-pw-v1", entries: [], updatedAt: Date.now() } };
  }
  const probed = JSON.parse(raw) as { format?: string };
  if (probed?.format === "notevault-pw-enc-v1") {
    if (!master) return { encrypted: true, db: null };
    try {
      return { encrypted: true, db: JSON.parse(pwDecrypt(raw, master)) };
    } catch {
      return { encrypted: true, db: null, wrongPassword: true };
    }
  }
  return { encrypted: false, db: probed };
}

function pwSave(db: Record<string, unknown>, master: string | null): void {
  const json = JSON.stringify(db, null, 2);
  const content = master ? pwEncrypt(json, master) : json;
  fs.mkdirSync(path.dirname(PW_FILE), { recursive: true });
  // 原子写：临时文件 + 重命名，避免写一半损坏
  const tmp = PW_FILE + ".tmp";
  fs.writeFileSync(tmp, content, "utf-8");
  fs.renameSync(tmp, PW_FILE);
}

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

    // 防 DNS rebinding：Host 必须是本机地址
    const host = String(req.headers.host || "");
    if (!/^127\.0\.0\.1(:\d+)?$/.test(host) && !/^localhost(:\d+)?$/.test(host)) {
      return json(res, 403, { error: "拒绝访问：非法 Host" });
    }

    // API：POST /api/<cmd>
    if (req.method === "POST" && url.pathname.startsWith("/api/")) {
      // 防 CSRF：仅接受应用自身页面的同源请求
      const origin = String(req.headers.origin || "");
      const fetchSite = String(req.headers["sec-fetch-site"] || "same-origin");
      const contentType = String(req.headers["content-type"] || "");
      if (origin && !origin.startsWith(`http://127.0.0.1:${PORT}`) && !origin.startsWith(`http://localhost:${PORT}`)) {
        return json(res, 403, { error: "拒绝访问：跨站请求" });
      }
      if (fetchSite === "cross-site") {
        return json(res, 403, { error: "拒绝访问：跨站请求" });
      }
      if (!contentType.includes("application/json")) {
        return json(res, 415, { error: "Content-Type 必须为 application/json" });
      }
      const channel = url.pathname.slice(5);
      const handler = routes[channel];
      if (!handler) return json(res, 404, { error: `未知命令: ${channel}` });
      let body = "";
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024 * 1024) return json(res, 413, { error: "请求体过大" });
        body += chunk;
      }
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

    // 库外绝对路径文件：GET /raw?path=<abs>（md 中偶发的绝对路径图片引用）
    // 安全策略：仅允许图片类文件，禁止 HTML/JS 等可执行内容
    if (req.method === "GET" && url.pathname === "/raw") {
      const p = decodeURIComponent(url.searchParams.get("path") || "");
      if (!p) return json(res, 400, { error: "缺少 path 参数" });
      const abs = path.resolve(p);
      if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) return json(res, 404, { error: "文件不存在" });
      if (kindOf(path.basename(abs)) !== "image") return json(res, 403, { error: "仅支持库外图片文件的绝对路径访问" });
      return serveFile(res, abs);
    }

    // 静态资源（SPA 回退 index.html）
    let urlPath = decodeURIComponent(url.pathname);
    if (urlPath === "/") urlPath = "/index.html";
    let filePath = path.join(DIST, urlPath);
    if (filePath !== DIST && !filePath.startsWith(DIST + path.sep)) {
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
