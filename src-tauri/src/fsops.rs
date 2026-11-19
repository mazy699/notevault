//! 文件系统操作：目录树 / 读取 / 搜索 / 快照（语义与 web/server.ts + shared/fscore.ts 一致）
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

pub const IGNORE_DIRS: &[&str] = &[
    "node_modules", ".git", ".svn", ".hg", "dist", "out", "build", "target",
    ".next", ".nuxt", ".cache", ".idea", "__pycache__", ".venv", "venv",
];
pub const MAX_TREE_ENTRIES: usize = 20000;
pub const MAX_READ_BYTES: u64 = 5 * 1024 * 1024;
pub const MAX_SEARCH_BYTES: u64 = 2 * 1024 * 1024;
pub const MAX_MATCHES_PER_FILE: usize = 8;
pub const MAX_SEARCH_FILES: usize = 3000;
pub const MAX_TOTAL_MATCHES: usize = 600;

#[derive(Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FileKind {
    Markdown,
    Html,
    Text,
    Image,
    Other,
}

pub fn kind_of(name: &str) -> FileKind {
    let ext = match name.rfind('.') {
        Some(i) => name[i + 1..].to_lowercase(),
        None => String::new(),
    };
    match ext.as_str() {
        "md" | "markdown" | "mdx" => FileKind::Markdown,
        "html" | "htm" => FileKind::Html,
        "txt" | "log" | "json" | "yaml" | "yml" | "toml" | "csv" | "ini" | "cfg" => FileKind::Text,
        "png" | "jpg" | "jpeg" | "gif" | "svg" | "webp" | "bmp" | "ico" => FileKind::Image,
        _ => FileKind::Other,
    }
}

pub fn is_text_kind(k: FileKind) -> bool {
    matches!(k, FileKind::Markdown | FileKind::Html | FileKind::Text)
}

pub fn is_ignored_dir(name: &str) -> bool {
    IGNORE_DIRS.contains(&name)
}

/// 规范化相对路径（POSIX），返回各段；非法返回 None
pub fn normalize_rel(rel: &str) -> Option<Vec<String>> {
    let mut parts: Vec<String> = Vec::new();
    for seg in rel.replace('\\', "/").split('/') {
        if seg.is_empty() || seg == "." {
            continue;
        }
        if seg == ".." {
            return None;
        }
        if seg.chars().any(|c| {
            matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*' | '\0') || (c as u32) < 32
        }) {
            return None;
        }
        parts.push(seg.to_string());
    }
    Some(parts)
}

/// 库内相对路径 → 绝对路径（防穿越）
pub fn resolve_in_vault(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let parts = normalize_rel(rel).ok_or("非法路径")?;
    let mut abs = root.to_path_buf();
    for p in &parts {
        abs.push(p);
    }
    if !abs.starts_with(root) {
        return Err("路径越界".into());
    }
    Ok(abs)
}

// ---------------- 自然排序 ----------------
pub fn natural_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    let ab = a.as_bytes();
    let bb = b.as_bytes();
    let (mut i, mut j) = (0usize, 0usize);
    while i < ab.len() && j < bb.len() {
        let (ca, cb) = (ab[i], bb[j]);
        if ca.is_ascii_digit() && cb.is_ascii_digit() {
            // 比较连续数字段
            let (mut i2, mut j2) = (i, j);
            while i2 < ab.len() && ab[i2].is_ascii_digit() { i2 += 1; }
            while j2 < bb.len() && bb[j2].is_ascii_digit() { j2 += 1; }
            let na: u64 = a[i..i2].parse().unwrap_or(u64::MAX);
            let nb: u64 = b[j..j2].parse().unwrap_or(u64::MAX);
            if na != nb {
                return na.cmp(&nb);
            }
            i = i2;
            j = j2;
        } else {
            // ASCII 不区分大小写；非 ASCII 按码点
            let la = ca.to_ascii_lowercase();
            let lb = cb.to_ascii_lowercase();
            if la != lb {
                return la.cmp(&lb);
            }
            i += 1;
            j += 1;
        }
    }
    (ab.len() - i).cmp(&(bb.len() - j))
}

// ---------------- 文本解码 ----------------
pub fn strip_bom(bytes: &[u8]) -> &[u8] {
    if bytes.len() >= 3 && bytes[0] == 0xef && bytes[1] == 0xbb && bytes[2] == 0xbf {
        &bytes[3..]
    } else {
        bytes
    }
}

fn looks_like_binary(bytes: &[u8]) -> bool {
    let n = bytes.len().min(8000);
    if n == 0 {
        return false;
    }
    let mut suspicious = 0usize;
    for &b in &bytes[..n] {
        if b == 0 {
            return true;
        }
        if b < 9 || (b > 13 && b < 32) {
            suspicious += 1;
        }
    }
    suspicious as f64 / n as f64 > 0.08
}

/// UTF-8 优先，GBK 回退
pub fn decode_text(bytes: &[u8]) -> (String, &'static str) {
    let clean = strip_bom(bytes);
    if looks_like_binary(clean) {
        return (String::new(), "binary");
    }
    match std::str::from_utf8(clean) {
        Ok(s) => (s.to_string(), "utf-8"),
        Err(_) => {
            let (text, _, had_errors) = encoding_rs::GBK.decode(clean);
            if had_errors {
                (String::from_utf8_lossy(clean).into_owned(), "utf-8")
            } else {
                (text.into_owned(), "gbk")
            }
        }
    }
}

// ---------------- 目录树 ----------------
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    pub path: String,
    pub name: String,
    pub dir: bool,
    pub kind: FileKind,
    pub size: u64,
    pub mtime_ms: i64,
    pub children: Option<Vec<FileNode>>,
}

fn mtime_ms(p: &Path) -> i64 {
    fs::metadata(p)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn build_tree(root: &Path) -> Result<FileNode, String> {
    if !root.is_dir() {
        return Err(format!("目录不存在或不可访问：{}", root.display()));
    }
    let mut budget = MAX_TREE_ENTRIES;
    let node = walk_dir(root, "", &root.file_name().unwrap_or_default().to_string_lossy(), &mut budget);
    Ok(node)
}

fn walk_dir(dir: &Path, rel: &str, name: &str, budget: &mut usize) -> FileNode {
    let node = FileNode {
        path: rel.to_string(),
        name: name.to_string(),
        dir: true,
        kind: FileKind::Other,
        size: 0,
        mtime_ms: mtime_ms(dir),
        children: Some(Vec::new()),
    };
    let entries = match fs::read_dir(dir) {
        Ok(rd) => rd,
        Err(_) => return FileNode { children: None, ..node },
    };
    let mut dirs: Vec<(PathBuf, String)> = Vec::new();
    let mut files: Vec<(PathBuf, String)> = Vec::new();
    for e in entries.flatten() {
        let Ok(ft) = e.file_type() else { continue };
        let fname = e.file_name().to_string_lossy().into_owned();
        if ft.is_dir() {
            if !is_ignored_dir(&fname) {
                dirs.push((e.path(), fname));
            }
        } else if ft.is_file() {
            files.push((e.path(), fname));
        }
    }
    dirs.sort_by(|a, b| natural_cmp(&a.1, &b.1));
    files.sort_by(|a, b| natural_cmp(&a.1, &b.1));
    let children = node.children.as_mut().unwrap();
    for (p, n) in dirs.into_iter().chain(files.into_iter()) {
        if *budget == 0 {
            break;
        }
        *budget -= 1;
        let child_rel = if rel.is_empty() { n.clone() } else { format!("{}/{}", rel, n) };
        if p.is_dir() {
            children.push(walk_dir(&p, &child_rel, &n, budget));
        } else {
            let (size, mt) = {
                let md = fs::metadata(&p).ok();
                (md.as_ref().map(|m| m.len()).unwrap_or(0), md.map(|m| mtime_ms_from(&m)).unwrap_or(0))
            };
            children.push(FileNode {
                path: child_rel,
                name: n,
                dir: false,
                kind: kind_of(&n),
                size,
                mtime_ms: mt,
                children: None,
            });
        }
    }
    node
}

fn mtime_ms_from(md: &fs::Metadata) -> i64 {
    md.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// 供 api.rs 使用的 metadata → 毫秒时间戳
pub fn mtime_ms_of(md: &fs::Metadata) -> i64 {
    mtime_ms_from(md)
}

// ---------------- 文件读取 ----------------
pub struct FileContent {
    pub path: String,
    pub name: String,
    pub kind: FileKind,
    pub size: u64,
    pub mtime_ms: i64,
    pub content: String,
    pub truncated: bool,
    pub encoding: &'static str,
}

pub fn read_file_content(root: &Path, rel: &str) -> Result<FileContent, String> {
    let parts = normalize_rel(rel).ok_or("非法路径")?;
    if parts.is_empty() {
        return Err("非法路径".into());
    }
    let abs = resolve_in_vault(root, rel)?;
    let md = fs::metadata(&abs).map_err(|e| format!("读取失败：{}", e))?;
    if md.is_dir() {
        return Err("这是一个目录".into());
    }
    let name = parts.last().unwrap().clone();
    let kind = kind_of(&name);
    let size = md.len();
    let mt = mtime_ms_from(&md);
    if !is_text_kind(kind) {
        return Ok(FileContent {
            path: rel.to_string(),
            name,
            kind,
            size,
            mtime_ms: mt,
            content: String::new(),
            truncated: false,
            encoding: "binary",
        });
    }
    let truncated = size > MAX_READ_BYTES;
    let bytes = fs::read(&abs).map_err(|e| format!("读取失败：{}", e))?;
    let bytes = &bytes[..bytes.len().min(MAX_READ_BYTES as usize)];
    let (content, encoding) = decode_text(bytes);
    Ok(FileContent { path: rel.to_string(), name, kind, size, mtime_ms: mt, content, truncated, encoding })
}

// ---------------- HTML 剥离标签（供搜索） ----------------
pub fn strip_html_tags(html: &str) -> String {
    let chars: Vec<char> = html.chars().collect();
    let mut out = String::with_capacity(html.len());
    let mut i = 0usize;

    while i < chars.len() {
        if chars[i] == '<' {
            // 注释
            let rest: String = chars[i..].iter().take(4).collect();
            if rest.starts_with("<!--") {
                i += 4;
                while i + 2 < chars.len() && !(chars[i] == '-' && chars[i + 1] == '-' && chars[i + 2] == '>') {
                    i += 1;
                }
                i = (i + 3).min(chars.len());
                continue;
            }
            // 标签名
            let mut j = i + 1;
            while j < chars.len() && (chars[j].is_ascii_alphanumeric() || chars[j] == '/' || chars[j] == '!') {
                j += 1;
            }
            let raw_tag: String = chars[i + 1..j.min(chars.len())].iter().collect();
            let tag = raw_tag.trim_start_matches('/').to_lowercase();
            // 找到标签结束 '>'
            let mut k = j;
            while k < chars.len() && chars[k] != '>' {
                k += 1;
            }
            let next = (k + 1).min(chars.len());
            if tag == "script" || tag == "style" || tag == "title" {
                // 跳过整个元素内容直到闭合标签结束
                let close = format!("</{}", tag);
                let lower_rest: String = chars[next..].iter().collect::<String>().to_lowercase();
                let found = lower_rest
                    .find(&close)
                    .map(|pos| next + lower_rest[..pos].chars().count())
                    .unwrap_or(chars.len());
                let mut e = found;
                while e < chars.len() && chars[e] != '>' {
                    e += 1;
                }
                i = (e + 1).min(chars.len());
                continue;
            }
            if matches!(
                tag.as_str(),
                "br" | "p" | "div" | "li" | "tr" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
                | "section" | "article" | "header" | "footer" | "table"
            ) {
                out.push('\n');
            }
            i = next;
            continue;
        }
        out.push(chars[i]);
        i += 1;
    }
    // 实体还原
    out.replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&amp;", "&")
}

// ---------------- 全文搜索 ----------------
fn find_ci(hay_chars: &[char], needle_chars: &[char], from: usize) -> Option<usize> {
    if needle_chars.is_empty() || hay_chars.len() < needle_chars.len() {
        return None;
    }
    'outer: for start in from..=(hay_chars.len() - needle_chars.len()) {
        for (k, nc) in needle_chars.iter().enumerate() {
            let hc = hay_chars[start + k];
            let mut hlc = hc;
            for lc in hlc.to_lowercase() {
                hlc = lc;
                break;
            }
            let mut nlc = *nc;
            for lc in nc.to_lowercase() {
                nlc = lc;
                break;
            }
            if hlc != nlc {
                continue 'outer;
            }
        }
        return Some(start);
    }
    None
}

pub struct SearchMatch {
    pub line: usize,
    pub text: String,
}

pub fn find_matches(content: &str, query: &str, limit: usize) -> Vec<SearchMatch> {
    let q: Vec<char> = query.to_lowercase().chars().collect();
    if q.is_empty() {
        return Vec::new();
    }
    let mut matches = Vec::new();
    for (idx, line) in content.split(['\n', '\r']).enumerate() {
        if matches.len() >= limit {
            break;
        }
        let chars: Vec<char> = line.chars().collect();
        if let Some(hit) = find_ci(&chars, &q, 0) {
            // 片段裁剪：命中前后各 ~60 字符（与 web 版一致：每行取首个命中）
            let start = hit.saturating_sub(60);
            let end = (hit + q.len() + 60).min(chars.len());
            let mut text: String = chars[start..end].iter().collect();
            if start > 0 {
                text.insert(0, '…');
            }
            if end < chars.len() {
                text.push('…');
            }
            matches.push(SearchMatch { line: idx + 1, text });
        }
    }
    matches
}

// ---------------- 快照 ----------------
pub struct SnapEntry {
    pub mtime_ms: i64,
    pub size: u64,
}

pub fn snapshot(root: &Path) -> Result<Vec<(String, SnapEntry)>, String> {
    if !root.is_dir() {
        return Err("尚未设置笔记库目录".into());
    }
    let mut out = Vec::new();
    let mut truncated = false;
    walk_snap(root, "", &mut out, &mut truncated);
    Ok(out)
}

fn walk_snap(dir: &Path, rel: &str, out: &mut Vec<(String, SnapEntry)>, truncated: &mut bool) {
    if *truncated || out.len() > 8000 {
        *truncated = true;
        return;
    }
    let entries = match fs::read_dir(dir) {
        Ok(rd) => rd,
        Err(_) => return,
    };
    for e in entries.flatten() {
        if *truncated || out.len() > 8000 {
            *truncated = true;
            return;
        }
        let Ok(ft) = e.file_type() else { continue };
        let fname = e.file_name().to_string_lossy().into_owned();
        let child_rel = if rel.is_empty() { fname.clone() } else { format!("{}/{}", rel, fname) };
        if ft.is_dir() {
            if !is_ignored_dir(&fname) {
                walk_snap(&e.path(), &child_rel, out, truncated);
            }
        } else if ft.is_file() {
            if let Ok(md) = e.metadata() {
                out.push((
                    child_rel,
                    SnapEntry { mtime_ms: mtime_ms_from(&md), size: md.len() },
                ));
            }
        }
    }
}
