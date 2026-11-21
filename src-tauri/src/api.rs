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
            if ft.is_symlink() {
                continue;
            }
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
        Some(p) if !p.is_empty() => {
            // 相对路径按当前目录解析为绝对路径（与 Web 版 path.resolve 行为一致）
            let mut pb = PathBuf::from(p);
            if !pb.is_absolute() {
                pb = std::env::current_dir().unwrap_or_default().join(pb);
            }
            Some(pb)
        }
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
            let (entries, truncated) = fsops::snapshot(&root)?;
            let mut map = serde_json::Map::new();
            for (path, e) in entries {
                map.insert(path, json!({ "mtimeMs": e.mtime_ms, "size": e.size }));
            }
            Ok(json!({ "entries": map, "truncated": truncated }))
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
            // (绝对路径, 相对路径) —— 相对路径在遍历时累积，避免盘符大小写导致 strip_prefix 失败
            let mut stack = vec![(root.clone(), String::new())];
            while let Some((dir, rel)) = stack.pop() {
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
                    if ft.is_symlink() {
                        continue;
                    }
                    let name = e.file_name().to_string_lossy().into_owned();
                    let child_rel = if rel.is_empty() { name.clone() } else { format!("{}/{}", rel, name) };
                    if ft.is_dir() {
                        if !fsops::is_ignored_dir(&name) {
                            stack.push((e.path(), child_rel));
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
                            hits.push((child_rel, name, kind, matches));
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

        "fs_read_abs" => {
            let abs = PathBuf::from(p.get("path").and_then(|v| v.as_str()).unwrap_or(""));
            if !abs.is_absolute() {
                return Err("需要绝对路径".into());
            }
            if !abs.is_file() {
                return Err(format!("文件不存在或不可访问：{}", abs.display()));
            }
            let md = std::fs::metadata(&abs).map_err(|e| format!("读取失败：{}", e))?;
            let name = abs.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
            let kind = fsops::kind_of(&name);
            if matches!(kind, fsops::FileKind::Image | fsops::FileKind::Other) {
                return Err(format!("不支持的文件类型：{}（仅支持文本/代码类文件对比）", name));
            }
            let truncated = md.len() > fsops::MAX_READ_BYTES;
            let mut bytes: Vec<u8> = Vec::new();
            {
                use std::io::Read;
                let f = std::fs::File::open(&abs).map_err(|e| format!("读取失败：{}", e))?;
                f.take(fsops::MAX_READ_BYTES).read_to_end(&mut bytes).map_err(|e| format!("读取失败：{}", e))?;
            }
            let (content, encoding) = fsops::decode_text(&bytes);
            Ok(json!({
                "path": abs.display().to_string(), "name": name, "kind": kind,
                "size": md.len(), "mtimeMs": fsops::mtime_ms_of(&md),
                "content": content, "truncated": truncated, "encoding": encoding,
            }))
        }

        "fs_list_dir" => {
            let dir = PathBuf::from(p.get("dirPath").and_then(|v| v.as_str()).unwrap_or(""));
            if !dir.is_dir() {
                return Err(format!("目录不存在或不可访问：{}", dir.display()));
            }
            let rd = std::fs::read_dir(&dir).map_err(|e| format!("读取目录失败：{}", e))?;
            let mut list: Vec<Value> = Vec::new();
            for e in rd.flatten() {
                let name = e.file_name().to_string_lossy().into_owned();
                if name.starts_with('.') {
                    continue;
                }
                let Ok(ft) = e.file_type() else { continue };
                list.push(json!({ "name": name, "dir": ft.is_dir() }));
                if list.len() >= 2000 {
                    break;
                }
            }
            list.sort_by(|a, b| {
                let da = a["dir"].as_bool().unwrap_or(false);
                let db = b["dir"].as_bool().unwrap_or(false);
                if da != db {
                    return if da { std::cmp::Ordering::Less } else { std::cmp::Ordering::Greater };
                }
                a["name"].as_str().unwrap_or("").cmp(b["name"].as_str().unwrap_or(""))
            });
            Ok(json!({ "entries": list }))
        }

        "git_ls" => {
            let repo = PathBuf::from(p.get("repoPath").and_then(|v| v.as_str()).unwrap_or(""));
            if !repo.is_dir() {
                return Err(format!("目录不存在或不可访问：{}", repo.display()));
            }
            let r = git_run(&["ls-files"], &repo)?;
            let files: Vec<String> = r
                .lines()
                .filter(|s| !s.trim().is_empty())
                .take(5000)
                .map(|s| s.to_string())
                .collect();
            Ok(json!({ "files": files }))
        }

        "git_log" => {
            let repo = PathBuf::from(p.get("repoPath").and_then(|v| v.as_str()).unwrap_or(""));
            if !repo.is_dir() {
                return Err(format!("目录不存在或不可访问：{}", repo.display()));
            }
            let file = p.get("filePath").and_then(|v| v.as_str()).unwrap_or("");
            if file.is_empty() {
                return Err("缺少文件路径".into());
            }
            let r = git_run(
                &["log", "--pretty=format:%H%x1f%h%x1f%an%x1f%aI%x1f%s", "-n", "200", "--follow", "--", file],
                &repo,
            )?;
            let commits: Vec<Value> = r
                .lines()
                .filter(|s| !s.trim().is_empty())
                .map(|line| {
                    let parts: Vec<&str> = line.split('\x1f').collect();
                    json!({
                        "hash": parts.first().copied().unwrap_or(""),
                        "subject": format!("{} {}", parts.get(1).copied().unwrap_or(""), parts.get(4).copied().unwrap_or("")).trim().to_string(),
                        "author": parts.get(2).copied().unwrap_or(""),
                        "date": parts.get(3).copied().unwrap_or(""),
                    })
                })
                .filter(|c| c["hash"].as_str().unwrap_or("") != "")
                .collect();
            Ok(json!({ "commits": commits }))
        }

        "git_show" => {
            let repo = PathBuf::from(p.get("repoPath").and_then(|v| v.as_str()).unwrap_or(""));
            if !repo.is_dir() {
                return Err(format!("目录不存在或不可访问：{}", repo.display()));
            }
            let file = p.get("filePath").and_then(|v| v.as_str()).unwrap_or("");
            let ref_name = p.get("ref").and_then(|v| v.as_str()).unwrap_or("");
            if file.is_empty() || ref_name.is_empty() {
                return Err("缺少文件路径或版本".into());
            }
            let name = file.rsplit('/').next().unwrap_or(file).to_string();
            let kind = fsops::kind_of(&name);
            if ref_name == "WORKDIR" {
                return match fsops::read_file_content(&repo, file) {
                    Ok(fc) => Ok(json!({
                        "path": file, "name": fc.name, "kind": fc.kind, "size": fc.size,
                        "mtimeMs": fc.mtime_ms, "content": fc.content, "truncated": fc.truncated, "encoding": fc.encoding,
                    })),
                    Err(e) => Err(e),
                };
            }
            let mut bytes = git_run_bytes(&["show", &format!("{}:{}", ref_name, file)], &repo)?;
            if bytes.len() as u64 > fsops::MAX_READ_BYTES {
                bytes.truncate(fsops::MAX_READ_BYTES as usize);
            }
            let (content, encoding) = fsops::decode_text(&bytes);
            Ok(json!({
                "path": format!("{}@{}", file, &ref_name[..ref_name.len().min(10)]),
                "name": name, "kind": kind, "size": bytes.len(), "mtimeMs": 0,
                "content": content, "truncated": false, "encoding": encoding,
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

/// git 只读命令（字符串输出）。参数数组调用，不经 shell，防注入。
pub(crate) fn git_run(args: &[&str], cwd: &PathBuf) -> Result<String, String> {
    let out = std::process::Command::new("git")
        .args(["-C", cwd.to_string_lossy().as_ref(), "--no-pager", "-c", "core.quotepath=false"])
        .args(args)
        .output()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "未检测到 git 命令，请先安装 Git 并加入 PATH".to_string()
            } else {
                format!("git 执行失败：{}", e)
            }
        })?;
    if !out.status.success() {
        let combined = format!(
            "{}{}",
            String::from_utf8_lossy(&out.stderr).trim(),
            String::from_utf8_lossy(&out.stdout).trim()
        );
        let line = combined.lines().last().unwrap_or("git 命令失败").to_string();
        return Err(line.chars().take(300).collect());
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// git 命令（字节输出，供 git show 后做编码检测）
pub(crate) fn git_run_bytes(args: &[&str], cwd: &PathBuf) -> Result<Vec<u8>, String> {
    let out = std::process::Command::new("git")
        .args(["-C", cwd.to_string_lossy().as_ref(), "--no-pager", "-c", "core.quotepath=false"])
        .args(args)
        .output()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "未检测到 git 命令，请先安装 Git 并加入 PATH".to_string()
            } else {
                format!("git 执行失败：{}", e)
            }
        })?;
    if !out.status.success() {
        let msg = format!(
            "{}{}",
            String::from_utf8_lossy(&out.stdout).trim(),
            String::from_utf8_lossy(&out.stderr).trim()
        );
        let line = msg.lines().last().unwrap_or("git 命令失败").to_string();
        return Err(line.chars().take(300).collect());
    }
    Ok(out.stdout)
}

/// Tauri 命令入口：单一 api(cmd, payload) 与 Web 路由同构。
/// async + spawn_blocking：重 IO（树/搜索/快照）不阻塞主线程。
#[tauri::command]
pub async fn api(app: tauri::AppHandle, cmd: String, payload: Value) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || dispatch(&app, &cmd, &payload))
        .await
        .map_err(|e| format!("任务执行失败: {}", e))?
}
