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

/// HTML 预览链接拦截（Issue #7）：仅 HTML 响应在 ?nv_preview=1 时注入。
/// 与 Web 宿主 web/server.ts 的 PREVIEW_SCRIPT 保持一致（消息标记相同）。
const PREVIEW_SCRIPT: &str = r##"<script>(function(){var TAG="notevault-preview-link";var MODE="desktop";function isExt(h){return /^(https?:|mailto:|\/\/)/i.test(h)}function anchor(t){while(t&&t.nodeName!=="A")t=t.parentElement;return t}function go(e){var a=anchor(e.target);if(!a)return;var h=a.getAttribute("href");if(!h||h.charAt(0)==="#")return;e.preventDefault();if(MODE==="web"&&isExt(h)){try{window.open(h,"_blank","noopener,noreferrer")}catch(_){}}else{try{window.parent.postMessage({__nv:TAG,href:h},"*")}catch(_){}}}document.addEventListener("click",function(e){if(e.defaultPrevented||e.button!==0)return;go(e)},true);document.addEventListener("auxclick",function(e){if(e.button!==1)return;go(e)},true)})();</script>"##;

fn inject_preview_script(html: &str) -> String {
    let lower = html.to_ascii_lowercase();
    match lower.rfind("</body>") {
        Some(idx) => format!("{}{}{}", &html[..idx], PREVIEW_SCRIPT, &html[idx..]),
        None => format!("{}{}", html, PREVIEW_SCRIPT),
    }
}

fn file_response(abs: &PathBuf, mime: &str, inject_preview: bool) -> tauri::http::Response<Cow<'static, [u8]>> {
    match std::fs::read(abs) {
        Ok(bytes) => {
            let body = if inject_preview && mime.starts_with("text/html") {
                match String::from_utf8(bytes) {
                    Ok(html) => inject_preview_script(&html).into_bytes(),
                    Err(e) => e.into_bytes(),
                }
            } else {
                bytes
            };
            tauri::http::Response::builder()
                .status(200)
                .header("Content-Type", mime)
                .header("Cache-Control", "no-store")
                .body(Cow::Owned(body))
                .unwrap()
        }
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
    // HTML 预览模式：仅库内 HTML 注入链接拦截脚本
    let preview = request
        .uri()
        .query()
        .map(|q| q.split('&').any(|kv| kv == "nv_preview=1"))
        .unwrap_or(false);

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
        return file_response(&abs, mime, false);
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
    file_response(&abs, mime, preview)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inject_before_body_close() {
        let html = "<html><body><a href=\"b.html\">B</a></body></html>";
        let out = inject_preview_script(html);
        assert!(out.contains("notevault-preview-link"));
        assert!(out.ends_with("</body></html>"));
        assert!(out.find("notevault-preview-link").unwrap() < out.find("</body>").unwrap());
    }

    #[test]
    fn inject_appends_without_body() {
        let out = inject_preview_script("<p>hi</p>");
        assert!(out.starts_with("<p>hi</p>"));
        assert!(out.contains("notevault-preview-link"));
    }
}
