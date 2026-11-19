//! vault:// 自定义协议：按路径提供笔记库文件（图片 / HTML iframe / 相对引用共用）
//!
//! URL 形态（Windows WebView2）：
//!   http://vault.localhost/<库内相对路径，逐段编码>   —— 相对引用按目录自然解析
//!   http://vault.localhost/~abs/<完整绝对路径编码>     —— 库外绝对路径引用
use crate::AppState;
use std::borrow::Cow;
use std::path::PathBuf;
use tauri::Manager;

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = &s[i + 1..i + 3];
            if let Ok(v) = u8::from_str_radix(hex, 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn mime_of(path: &str) -> &'static str {
    // 只取文件名部分计算扩展名（目录名可能含点）
    let filename = path.rsplit(['/', '\\']).next().unwrap_or(path);
    let ext = filename.rsplit('.').next().unwrap_or("").to_lowercase();
    let has_ext = filename.contains('.');
    if !has_ext {
        return "application/octet-stream";
    }
    match ext.as_str() {
        "html" | "htm" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "txt" | "log" | "md" => "text/plain; charset=utf-8",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }
}

fn text_response(status: u16, body: &'static str) -> tauri::http::Response<Cow<'static, [u8]>> {
    tauri::http::Response::builder()
        .status(status)
        .header("Content-Type", "text/plain; charset=utf-8")
        .body(Cow::Borrowed(body.as_bytes()))
        .unwrap()
}

fn file_response(abs: &PathBuf, mime: &str) -> tauri::http::Response<Cow<'static, [u8]>> {
    match std::fs::read(abs) {
        Ok(bytes) => tauri::http::Response::builder()
            .status(200)
            .header("Content-Type", mime)
            .header("Cache-Control", "no-store")
            .body(Cow::Owned(bytes))
            .unwrap(),
        Err(_) => text_response(404, "文件不存在"),
    }
}

pub fn handle(
    ctx: tauri::UriSchemeContext<'_, tauri::Wry>,
    request: tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Cow<'static, [u8]>> {
    let Some(state) = ctx.app_handle().try_state::<AppState>() else {
        eprintln!("[vault_proto] AppState 尚未就绪: {}", request.uri());
        return text_response(503, "尚未就绪");
    };
    let raw = request.uri().path().trim_start_matches('/').to_string();
    let path = percent_decode(&raw);

    let root = match state.vault_path.lock().unwrap().clone() {
        Some(p) if p.is_dir() => p,
        _ => return text_response(503, "尚未设置笔记库目录"),
    };

    // ~abs/ 前缀：库外绝对路径。仅允许图片类（Markdown 绝对路径引用的典型场景），
    // 禁止 HTML/JS 等可执行 MIME，收窄为最小面。
    if let Some(rest) = path.strip_prefix("~abs/") {
        let abs = PathBuf::from(rest);
        if !abs.is_absolute() || !abs.is_file() {
            return text_response(404, "文件不存在");
        }
        let filename = abs.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
        let kind = crate::fsops::kind_of(&filename);
        if kind != crate::fsops::FileKind::Image {
            return text_response(403, "仅支持库外图片文件的绝对路径访问");
        }
        let mime = mime_of(&rest);
        return file_response(&abs, mime);
    }

    // 库内相对路径（POSIX 分段）
    let parts: Vec<&str> = path.split('/').filter(|s| !s.is_empty() && *s != ".").collect();
    if parts.iter().any(|s| *s == "..") {
        return text_response(403, "路径越界");
    }
    let mut abs = root.clone();
    for seg in &parts {
        abs.push(seg);
    }
    if !abs.starts_with(&root) {
        return text_response(403, "路径越界");
    }
    if !abs.is_file() {
        return text_response(404, "文件不存在");
    }
    let mime = mime_of(&path);
    file_response(&abs, mime)
}
