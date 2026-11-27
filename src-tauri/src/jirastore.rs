//! Jira 只读同步的宿主侧配置与请求（Issue #25）。
//!
//! - 配置（含 token）只写 `%APPDATA%/worklog/jira.json`，不进 SQLite、不进 JSON 导出；
//! - 前端只能拿到掩码后的配置视图，请求必须经 `wl_jira_request`；
//! - 请求路径强制限定在 `/rest/api/`，base URL 由宿主配置决定，前端无法改目标主机。
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub const DEFAULT_JQL: &str =
    "assignee = currentUser() AND issuetype in (Sub-task, Bug) ORDER BY updated ASC";

#[derive(Clone)]
pub struct JiraConfig {
    pub base_url: String,
    pub auth_type: String,
    pub email: String,
    pub token: String,
    pub jql: String,
    pub include_story_subtasks: bool,
    pub interval_minutes: u32,
    pub enabled: bool,
}

impl Default for JiraConfig {
    fn default() -> Self {
        Self {
            base_url: String::new(),
            auth_type: "pat".into(),
            email: String::new(),
            token: String::new(),
            jql: DEFAULT_JQL.into(),
            include_story_subtasks: true,
            interval_minutes: 15,
            enabled: false,
        }
    }
}

pub fn file(dir: &Path) -> PathBuf {
    dir.join("jira.json")
}

pub fn load(dir: &Path) -> JiraConfig {
    let Ok(text) = std::fs::read_to_string(file(dir)) else {
        return JiraConfig::default();
    };
    let Ok(value) = serde_json::from_str::<Value>(&text) else {
        return JiraConfig::default();
    };
    let mut cfg = JiraConfig::default();
    if let Some(v) = value.get("baseUrl").and_then(|v| v.as_str()) {
        cfg.base_url = normalize_base_url(v).unwrap_or_default();
    }
    if let Some(v) = value.get("authType").and_then(|v| v.as_str()) {
        cfg.auth_type = if v == "cloud" { "cloud".into() } else { "pat".into() };
    }
    if let Some(v) = value.get("email").and_then(|v| v.as_str()) {
        cfg.email = v.trim().to_string();
    }
    if let Some(v) = value.get("token").and_then(|v| v.as_str()) {
        cfg.token = v.to_string();
    }
    if let Some(v) = value.get("jql").and_then(|v| v.as_str()) {
        cfg.jql = if v.trim().is_empty() { DEFAULT_JQL.into() } else { v.trim().to_string() };
    }
    if let Some(v) = value.get("includeStorySubtasks").and_then(|v| v.as_bool()) {
        cfg.include_story_subtasks = v;
    }
    if let Some(v) = value.get("intervalMinutes").and_then(|v| v.as_u64()) {
        cfg.interval_minutes = (v as u32).clamp(5, 240);
    }
    if let Some(v) = value.get("enabled").and_then(|v| v.as_bool()) {
        cfg.enabled = v;
    }
    cfg
}

pub fn save(dir: &Path, cfg: &JiraConfig) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("创建目录失败：{e}"))?;
    let payload = json!({
        "version": 1,
        "baseUrl": cfg.base_url,
        "authType": cfg.auth_type,
        "email": cfg.email,
        "token": cfg.token,
        "jql": cfg.jql,
        "includeStorySubtasks": cfg.include_story_subtasks,
        "intervalMinutes": cfg.interval_minutes,
        "enabled": cfg.enabled,
    });
    let file = file(dir);
    let tmp = dir.join("jira.json.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?)
        .map_err(|e| format!("写入失败：{e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600));
    }
    std::fs::rename(&tmp, &file).map_err(|e| format!("写入失败：{e}"))
}

pub fn clear(dir: &Path) {
    let _ = std::fs::remove_file(file(dir));
}

pub fn view(cfg: &JiraConfig) -> Value {
    let has_token = !cfg.token.is_empty();
    let hint: String = if has_token {
        cfg.token.chars().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect()
    } else {
        String::new()
    };
    json!({
        "baseUrl": cfg.base_url,
        "authType": cfg.auth_type,
        "email": cfg.email,
        "jql": cfg.jql,
        "includeStorySubtasks": cfg.include_story_subtasks,
        "intervalMinutes": cfg.interval_minutes,
        "enabled": cfg.enabled,
        "hasToken": has_token,
        "tokenHint": if has_token { Value::String(hint) } else { Value::Null },
    })
}

/// 合并前端提交的配置：字符串字段缺省时保留原值；token 为空表示不修改。
pub fn apply_input(existing: JiraConfig, p: &Value) -> Result<JiraConfig, String> {
    let mut cfg = existing;
    if let Some(v) = p.get("baseUrl").and_then(|v| v.as_str()) {
        cfg.base_url = normalize_base_url(v)?;
    }
    if let Some(v) = p.get("authType").and_then(|v| v.as_str()) {
        cfg.auth_type = if v == "cloud" { "cloud".into() } else { "pat".into() };
    }
    if let Some(v) = p.get("email").and_then(|v| v.as_str()) {
        cfg.email = v.trim().to_string();
    }
    if let Some(v) = p.get("jql").and_then(|v| v.as_str()) {
        cfg.jql = if v.trim().is_empty() { DEFAULT_JQL.into() } else { v.trim().to_string() };
    }
    if let Some(v) = p.get("includeStorySubtasks").and_then(|v| v.as_bool()) {
        cfg.include_story_subtasks = v;
    }
    if let Some(v) = p.get("intervalMinutes").and_then(|v| v.as_u64()) {
        cfg.interval_minutes = (v as u32).clamp(5, 240);
    }
    if let Some(v) = p.get("enabled").and_then(|v| v.as_bool()) {
        cfg.enabled = v;
    }
    if let Some(v) = p.get("token").and_then(|v| v.as_str()) {
        let t = v.trim();
        if !t.is_empty() {
            cfg.token = t.to_string();
        }
    }
    Ok(cfg)
}

pub fn normalize_base_url(value: &str) -> Result<String, String> {
    let raw = value.trim().trim_end_matches('/');
    if raw.is_empty() {
        return Ok(String::new());
    }
    if !(raw.starts_with("http://") || raw.starts_with("https://")) {
        return Err("Jira 地址仅支持 http(s)".into());
    }
    if raw.chars().any(|c| c.is_whitespace()) {
        return Err("Jira 地址不能包含空白字符".into());
    }
    if raw.contains('?') || raw.contains('#') {
        return Err("Jira 地址不能包含查询参数或锚点".into());
    }
    // 拒绝 URL 内嵌账号密码（https://user:pass@host）
    let after_scheme = raw.splitn(2, "://").nth(1).unwrap_or("");
    let authority = after_scheme.split('/').next().unwrap_or("");
    if authority.contains('@') {
        return Err("Jira 地址不能包含账号密码".into());
    }
    Ok(raw.to_string())
}

pub fn auth_header(cfg: &JiraConfig) -> Result<String, String> {
    if cfg.token.is_empty() {
        return Err("尚未配置 Jira Token".into());
    }
    if cfg.auth_type == "cloud" {
        if cfg.email.is_empty() {
            return Err("Cloud 认证需要填写邮箱".into());
        }
        use base64::Engine;
        let raw = format!("{}:{}", cfg.email, cfg.token);
        Ok(format!(
            "Basic {}",
            base64::engine::general_purpose::STANDARD.encode(raw.as_bytes())
        ))
    } else {
        Ok(format!("Bearer {}", cfg.token))
    }
}

pub fn validate_path(path: &str) -> Result<(), String> {
    if !path.starts_with("/rest/api/") || path.contains("..") {
        return Err("仅允许访问 Jira REST 路径（/rest/api/…）".into());
    }
    Ok(())
}

/// 执行一次 Jira REST 请求；HTTP 4xx/5xx 也返回 status + body，交给同步层处理。
pub fn request(cfg: &JiraConfig, path: &str, method: &str, body: Option<&str>) -> Result<(u16, String), String> {
    if cfg.base_url.is_empty() {
        return Err("尚未配置 Jira 地址".into());
    }
    validate_path(path)?;
    let auth = auth_header(cfg)?;
    let url = format!("{}{}", cfg.base_url, path);
    let agent = ureq::AgentBuilder::new()
        .timeout(std::time::Duration::from_secs(30))
        .build();
    let mut req = agent
        .request(&method.to_uppercase(), &url)
        .set("Accept", "application/json")
        .set("Authorization", &auth);
    if body.is_some() {
        req = req.set("Content-Type", "application/json");
    }
    let result = match body {
        Some(b) => req.send_string(b),
        None => req.call(),
    };
    let (status, text) = match result {
        Ok(resp) => {
            let status = resp.status();
            let text = resp.into_string().map_err(|e| format!("读取响应失败：{e}"))?;
            (status, text)
        }
        Err(ureq::Error::Status(code, resp)) => (code, resp.into_string().unwrap_or_default()),
        Err(e) => return Err(format!("Jira 请求失败：{e}")),
    };
    let cap = 2 * 1024 * 1024;
    let trimmed = if text.len() > cap {
        text[..text.floor_char_boundary(cap)].to_string()
    } else {
        text
    };
    Ok((status, trimmed))
}
