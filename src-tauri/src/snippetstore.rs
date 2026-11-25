//! 常用语存储：%APPDATA%/notevault/snippets.json（与 Web 宿主同一路径/同一格式）。
//! 可用环境变量 NOTEVAULT_SNIPPETS_FILE 覆盖路径（冒烟测试/多库场景用）。
use std::path::{Path, PathBuf};

pub const FORMAT: &str = "notevault-snippets-v1";

pub fn snippets_file_path() -> PathBuf {
    if let Ok(p) = std::env::var("NOTEVAULT_SNIPPETS_FILE") {
        if !p.is_empty() {
            return PathBuf::from(p);
        }
    }
    let base = std::env::var("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            let home = std::env::var("HOME").unwrap_or_default();
            PathBuf::from(home).join(".local/share")
        });
    base.join("notevault").join("snippets.json")
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn empty_db() -> serde_json::Value {
    serde_json::json!({
        "format": FORMAT,
        "snippets": [],
        "updatedAt": now_ms(),
        "order": [],
    })
}

fn load_from(path: &Path) -> Result<serde_json::Value, String> {
    if !path.exists() {
        return Ok(empty_db());
    }
    let raw = std::fs::read_to_string(path).map_err(|e| format!("读取常用语失败：{e}"))?;
    let db: serde_json::Value = serde_json::from_str(&raw).map_err(|e| format!("常用语文件损坏：{e}"))?;
    if !db.is_object() {
        return Err("常用语文件损坏：根节点不是对象".into());
    }
    Ok(db)
}

fn save_to(path: &Path, db: &serde_json::Value) -> Result<(), String> {
    if !db.is_object() {
        return Err("常用语数据格式错误：根节点必须是对象".into());
    }
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let json = serde_json::to_string_pretty(db).map_err(|e| format!("序列化失败：{e}"))?;
    // 原子写：临时文件 + 重命名，避免写一半损坏
    let tmp = path.with_extension("json.tmp");
    if let Err(e) = std::fs::write(&tmp, json.as_bytes()) {
        let _ = std::fs::remove_file(&tmp);
        return Err(format!("写入常用语失败：{e}"));
    }
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("保存常用语失败：{e}")
    })
}

pub fn load() -> Result<serde_json::Value, String> {
    load_from(&snippets_file_path())
}

pub fn save(db: &serde_json::Value) -> Result<(), String> {
    save_to(&snippets_file_path(), db)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn temp_path(tag: &str) -> PathBuf {
        std::env::temp_dir().join(format!("notevault_snippets_test_{}_{}.json", std::process::id(), tag))
    }

    #[test]
    fn missing_file_returns_empty_db() {
        let path = temp_path("missing");
        let _ = std::fs::remove_file(&path);
        let db = load_from(&path).unwrap();
        assert_eq!(db["format"], FORMAT);
        assert_eq!(db["snippets"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn save_and_load_roundtrip() {
        let path = temp_path("roundtrip");
        let db = json!({
            "format": FORMAT,
            "snippets": [{ "id": "s1", "title": "问候", "content": "你好\n世界", "group": "话术", "createdAt": 1, "updatedAt": 2 }],
            "updatedAt": 3,
            "order": ["s1"],
        });
        save_to(&path, &db).unwrap();
        let loaded = load_from(&path).unwrap();
        assert_eq!(loaded, db);
        assert!(std::fs::read_to_string(&path).unwrap().contains("\"notevault-snippets-v1\""));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn corrupt_file_is_rejected() {
        let path = temp_path("corrupt");
        std::fs::write(&path, "{ not-json").unwrap();
        let err = load_from(&path).unwrap_err();
        assert!(err.contains("损坏"));
        // 原文件未被覆盖
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{ not-json");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn non_object_rejected() {
        let path = temp_path("array");
        std::fs::write(&path, "[]").unwrap();
        assert!(load_from(&path).is_err());
        assert!(save_to(&path, &json!([])).is_err());
        let _ = std::fs::remove_file(&path);
    }
}
