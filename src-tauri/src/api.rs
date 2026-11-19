//! API 命令分发：与 web/server.ts 的路由一一对应（同一契约 shared/types.ts）
use crate::fsops;
use crate::AppState;
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

fn require_vault(state: &AppState) -> Result<PathBuf, String> {
    let guard = state.vault_path.lock().unwrap();
    match guard.as_ref() {
        Some(p) if p.is_dir() => Ok(p.clone()),
        _ => Err("尚未设置笔记库目录，请先在顶栏选择笔记目录".into()),
    }
}

fn count_files(root: &PathBuf) -> usize {
    let mut n = 0usize;
    let mut stack = vec![root.clone()];
    while let Some(dir) = stack.pop() {
        if n >= fsops::MAX_TREE_ENTRIES {
            return n;
        }
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for e in entries.flatten() {
            let Ok(ft) = e.file_type() else { continue };
            if ft.is_dir() {
                let name = e.file_name().to_string_lossy().into_owned();
                if !fsops::is_ignored_dir(&name) {
                    stack.push(e.path());
                }
            } else if ft.is_file() {
                n += 1;
            }
        }
    }
    n
}

fn vault_info(state: &AppState, path: Option<&str>) -> Result<Value, String> {
    let abs: Option<PathBuf> = match path {
        Some(p) if !p.is_empty() => Some(PathBuf::from(p)),
        _ => state.vault_path.lock().unwrap().clone(),
    };
    match abs {
        Some(p) if p.is_dir() => {
            let name = p.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| p.display().to_string());
            Ok(json!({ "path": p.display().to_string(), "name": name, "fileCount": count_files(&p) }))
        }
        _ => Ok(Value::Null),
    }
}

fn push_history(state: &AppState, path: &str) {
    let mut hist = state.vault_history.lock().unwrap();
    hist.retain(|p| p != path);
    hist.insert(0, path.to_string());
    hist.truncate(10);
    let mut settings = state.settings.lock().unwrap();
    settings.set("vault_history", &serde_json::to_string(&*hist).unwrap_or_default());
    settings.save();
}

pub fn dispatch(app: &tauri::AppHandle, cmd: &str, payload: &Value) -> Result<Value, String> {
    let Some(state) = app.try_state::<AppState>() else {
        eprintln!("[api] AppState 尚未就绪: {}", cmd);
        return Err("应用尚未就绪，请重试".into());
    };
    let p = payload.clone();
    match cmd {
        "__ping" => Ok(json!({ "ok": true, "host": "tauri", "version": "0.1.0" })),

        "vault_info" => vault_info(&state, p.get("path").and_then(|v| v.as_str())),

        "vault_pick" => {
            use tauri_plugin_dialog::DialogExt;
            let (tx, rx) = std::sync::mpsc::channel::<Option<tauri_plugin_dialog::FilePath>>();
            app.dialog().file().set_title("选择笔记目录").pick_folder(move |fp| {
                let _ = tx.send(fp);
            });
            let picked = rx.recv().ok().flatten();
            match picked {
                Some(fp) => {
                    let path = fp.to_string();
                    let info = vault_info(&state, Some(&path))?;
                    if info.is_null() {
                        return Err(format!("目录不存在或不可访问：{}", path));
                    }
                    // 选中即设置为当前库并记录历史
                    {
                        let mut guard = state.vault_path.lock().unwrap();
                        *guard = Some(PathBuf::from(&path));
                    }
                    let mut settings = state.settings.lock().unwrap();
                    settings.set("last_vault", &path);
                    settings.save();
                    drop(settings);
                    push_history(&state, &path);
                    Ok(info)
                }
                None => Ok(Value::Null), // 用户取消
            }
        }

        "vault_set" => {
            let path = p.get("path").and_then(|v| v.as_str()).unwrap_or("");
            let mut abs = PathBuf::from(path);
            if !abs.is_absolute() {
                abs = std::env::current_dir().unwrap_or_default().join(abs);
            }
            let info = vault_info(&state, Some(&abs.display().to_string()))?;
            if info.is_null() {
                return Err(format!("目录不存在或不可访问：{}", abs.display()));
            }
            {
                let mut guard = state.vault_path.lock().unwrap();
                *guard = Some(abs.clone());
            }
            {
                let mut settings = state.settings.lock().unwrap();
                settings.set("last_vault", &abs.display().to_string());
                settings.save();
            }
            push_history(&state, &abs.display().to_string());
            Ok(info)
        }

        "vault_list" => {
            let hist: Vec<String> = state.vault_history.lock().unwrap().clone();
            Ok(json!(hist))
        }

        "fs_tree" => {
            let root = require_vault(&state)?;
            let node = fsops::build_tree(&root)?;
            serde_json::to_value(node).map_err(|e| e.to_string())
        }

        "fs_read" => {
            let root = require_vault(&state)?;
            let rel = p.get("path").and_then(|v| v.as_str()).unwrap_or("");
            let fc = fsops::read_file_content(&root, rel)?;
            Ok(json!({
                "path": fc.path, "name": fc.name, "kind": fc.kind, "size": fc.size,
                "mtimeMs": fc.mtime_ms, "content": fc.content, "truncated": fc.truncated, "encoding": fc.encoding,
            }))
        }

        "fs_stat" => {
            let root = require_vault(&state)?;
            let mut out = serde_json::Map::new();
            if let Some(paths) = p.get("paths").and_then(|v| v.as_array()) {
                for rel in paths.iter().filter_map(|v| v.as_str()) {
                    if let Ok(abs) = fsops::resolve_in_vault(&root, rel) {
                        if let Ok(md) = std::fs::metadata(&abs) {
                            out.insert(
                                rel.to_string(),
                                json!({ "mtimeMs": fsops::mtime_ms_of(&md), "size": md.len() }),
                            );
                        }
                    }
                }
            }
            Ok(Value::Object(out))
        }

        "fs_snapshot" => {
            let root = require_vault(&state)?;
            let entries = fsops::snapshot(&root)?;
            let mut map = serde_json::Map::new();
            for (path, e) in entries {
                map.insert(path, json!({ "mtimeMs": e.mtime_ms, "size": e.size }));
            }
            Ok(json!({ "entries": map, "truncated": false }))
        }

        "fs_search" => {
            let root = require_vault(&state)?;
            let query = p.get("query").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            let case_sensitive = p.get("caseSensitive").and_then(|v| v.as_bool()).unwrap_or(false);
            if query.is_empty() {
                return Ok(json!({ "hits": [], "fileCount": 0, "matchCount": 0, "truncated": false, "elapsedMs": 0 }));
            }
            let started = std::time::Instant::now();
            let mut hits: Vec<(String, String, fsops::FileKind, Vec<fsops::SearchMatch>)> = Vec::new();
            let mut files_scanned = 0usize;
            let mut match_count = 0usize;
            let mut truncated = false;
            let mut stack = vec![root.clone()];
            while let Some(dir) = stack.pop() {
                if truncated || files_scanned >= fsops::MAX_SEARCH_FILES || match_count >= fsops::MAX_TOTAL_MATCHES {
                    truncated = truncated || files_scanned >= fsops::MAX_SEARCH_FILES || match_count >= fsops::MAX_TOTAL_MATCHES;
                    break;
                }
                let Ok(entries) = std::fs::read_dir(&dir) else { continue };
                for e in entries.flatten() {
                    if truncated || files_scanned >= fsops::MAX_SEARCH_FILES || match_count >= fsops::MAX_TOTAL_MATCHES {
                        truncated = true;
                        break;
                    }
                    let Ok(ft) = e.file_type() else { continue };
                    let name = e.file_name().to_string_lossy().into_owned();
                    if ft.is_dir() {
                        if !fsops::is_ignored_dir(&name) {
                            stack.push(e.path());
                        }
                    } else if ft.is_file() {
                        let kind = fsops::kind_of(&name);
                        if !fsops::is_text_kind(kind) {
                            continue;
                        }
                        files_scanned += 1;
                        let Ok(md) = e.metadata() else { continue };
                        if md.len() > fsops::MAX_SEARCH_BYTES {
                            continue;
                        }
                        let Ok(bytes) = std::fs::read(e.path()) else { continue };
                        let (content, _) = fsops::decode_text(&bytes);
                        if content.is_empty() {
                            continue;
                        }
                        let content = if kind == fsops::FileKind::Html { fsops::strip_html_tags(&content) } else { content };
                        let matches = fsops::find_matches(&content, &query, fsops::MAX_MATCHES_PER_FILE, case_sensitive);
                        if !matches.is_empty() {
                            match_count += matches.len();
                            // 相对路径
                            let rel = e.path()
                                .strip_prefix(&root)
                                .map(|rp| rp.to_string_lossy().replace('\\', "/"))
                                .unwrap_or(name.clone());
                            hits.push((rel, name, kind, matches));
                        }
                    }
                }
            }
            // 命中数降序 → 路径自然排序
            hits.sort_by(|a, b| b.3.len().cmp(&a.3.len()).then_with(|| fsops::natural_cmp(&a.0, &b.0)));
            let hits_json: Vec<Value> = hits
                .into_iter()
                .map(|(path, name, kind, ms)| {
                    json!({
                        "path": path, "name": name, "kind": kind,
                        "matches": ms.into_iter().map(|m| json!({ "line": m.line, "text": m.text })).collect::<Vec<_>>(),
                    })
                })
                .collect();
            let file_count = hits_json.len();
            Ok(json!({
                "hits": hits_json, "fileCount": file_count, "matchCount": match_count,
                "truncated": truncated, "elapsedMs": started.elapsed().as_millis() as u64,
            }))
        }

        "settings_get" => {
            let key = p.get("key").and_then(|v| v.as_str()).unwrap_or("");
            let settings = state.settings.lock().unwrap();
            Ok(json!(settings.get(key)))
        }

        "settings_set" => {
            let key = p.get("key").and_then(|v| v.as_str()).unwrap_or("");
            let value = p.get("value").and_then(|v| v.as_str()).unwrap_or("");
            let mut settings = state.settings.lock().unwrap();
            settings.set(key, value);
            settings.save();
            Ok(Value::Null)
        }

        "reveal_in_explorer" => {
            let path = p.get("path").and_then(|v| v.as_str()).unwrap_or("");
            #[cfg(target_os = "windows")]
            {
                std::process::Command::new("explorer").arg("/select,").arg(path).spawn().ok();
            }
            #[cfg(not(target_os = "windows"))]
            {
                if let Some(parent) = std::path::Path::new(path).parent() {
                    open_external_default(&parent.display().to_string());
                }
            }
            Ok(Value::Null)
        }

        "open_external" => {
            let path = p.get("path").and_then(|v| v.as_str()).unwrap_or("");
            #[cfg(target_os = "windows")]
            {
                std::process::Command::new("cmd")
                    .args(["/c", "start", "", path])
                    .spawn()
                    .map_err(|e| format!("打开失败：{}", e))?;
            }
            #[cfg(not(target_os = "windows"))]
            {
                open_external_default(path);
            }
            Ok(Value::Null)
        }

        _ => Err(format!("未知命令: {}", cmd)),
    }
}

#[cfg(not(target_os = "windows"))]
fn open_external_default(path: &str) {
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open").arg(path).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let _ = std::process::Command::new("xdg-open").arg(path).spawn();
}

/// Tauri 命令入口：单一 api(cmd, payload) 与 Web 路由同构
#[tauri::command]
pub fn api(app: tauri::AppHandle, cmd: String, payload: Value) -> Result<Value, String> {
    dispatch(&app, &cmd, &payload)
}
