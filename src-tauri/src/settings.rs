//! 设置持久化：%APPDATA%/notevault/settings.json（与 Web 宿主同一文件、同一格式）
use std::fs;
use std::path::PathBuf;

pub struct Settings {
    map: serde_json::Map<String, serde_json::Value>,
    path: PathBuf,
}

impl Settings {
    pub fn load() -> Self {
        let base = std::env::var("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                // 非 Windows 回退
                let home = std::env::var("HOME").unwrap_or_default();
                PathBuf::from(home).join(".local/share")
            });
        let path = base.join("notevault").join("settings.json");
        let map = fs::read(&path)
            .ok()
            .and_then(|b| serde_json::from_slice::<serde_json::Map<String, serde_json::Value>>(&b).ok())
            .unwrap_or_default();
        Self { map, path }
    }

    pub fn get(&self, key: &str) -> Option<String> {
        self.map.get(key).and_then(|v| v.as_str()).map(|s| s.to_string())
    }

    pub fn set(&mut self, key: &str, value: &str) {
        self.map.insert(key.to_string(), serde_json::Value::String(value.to_string()));
    }

    pub fn save(&self) {
        if let Some(dir) = self.path.parent() {
            let _ = fs::create_dir_all(dir);
        }
        if let Ok(json) = serde_json::to_vec_pretty(&self.map) {
            let _ = fs::write(&self.path, json);
        }
    }
}
