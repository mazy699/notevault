//! 密码库存储：%APPDATA%/notevault/passwords.json（与 Web 宿主同一路径/同一格式）。
//! 可用环境变量 NOTEVAULT_PASSWORDS_FILE 覆盖路径（冒烟测试/多库场景用）。
use crate::pwcrypto;
use std::path::PathBuf;

pub const PLAIN_FORMAT: &str = "notevault-pw-v1";
pub const ENC_FORMAT: &str = "notevault-pw-enc-v1";

pub fn pw_file_path() -> PathBuf {
    if let Ok(p) = std::env::var("NOTEVAULT_PASSWORDS_FILE") {
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
    base.join("notevault").join("passwords.json")
}

/// 加载结果：encrypted=true 且 db=None 表示需解锁（wrong=true 时为密码错误）
pub struct PwLoadResult {
    pub encrypted: bool,
    pub db: Option<serde_json::Value>,
    pub wrong_password: bool,
}

fn empty_db() -> serde_json::Value {
    serde_json::json!({
        "format": PLAIN_FORMAT,
        "entries": [],
        "updatedAt": chrono_now_ms(),
    })
}

fn chrono_now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn load(master: Option<&str>) -> Result<PwLoadResult, String> {
    let path = pw_file_path();
    if !path.exists() {
        return Ok(PwLoadResult { encrypted: false, db: Some(empty_db()), wrong_password: false });
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| format!("读取密码库失败：{e}"))?;
    let probed: serde_json::Value = serde_json::from_str(&raw).map_err(|e| format!("密码库文件损坏：{e}"))?;
    if probed.get("format").and_then(|v| v.as_str()) == Some(ENC_FORMAT) {
        let Some(mp) = master else {
            return Ok(PwLoadResult { encrypted: true, db: None, wrong_password: false });
        };
        match pwcrypto::decrypt_from_json(&raw, mp) {
            Ok(plain) => {
                let db = serde_json::from_str(&plain).map_err(|e| format!("解密后数据损坏：{e}"))?;
                Ok(PwLoadResult { encrypted: true, db: Some(db), wrong_password: false })
            }
            Err(_) => Ok(PwLoadResult { encrypted: true, db: None, wrong_password: true }),
        }
    } else {
        Ok(PwLoadResult { encrypted: false, db: Some(probed), wrong_password: false })
    }
}

pub fn save(db: &serde_json::Value, master: Option<&str>) -> Result<(), String> {
    let path = pw_file_path();
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let json = serde_json::to_string_pretty(db).map_err(|e| format!("序列化失败：{e}"))?;
    let content = match master {
        Some(mp) if !mp.is_empty() => pwcrypto::encrypt_to_json(&json, mp)?,
        _ => json,
    };
    // 原子写：临时文件 + 重命名，避免写一半损坏
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, content).map_err(|e| format!("写入密码库失败：{e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("写入密码库失败：{e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_plain_and_encrypted() {
        let tmp = std::env::temp_dir().join(format!("nv-pw-test-{}.json", std::process::id()));
        std::env::set_var("NOTEVAULT_PASSWORDS_FILE", &tmp);
        let _ = std::fs::remove_file(&tmp);

        // 首次加载 = 空库
        let r = load(None).unwrap();
        assert!(!r.encrypted);
        assert_eq!(r.db.unwrap().get("format").and_then(|v| v.as_str()), Some(PLAIN_FORMAT));

        // 明文保存 → 加密保存 → 加密加载
        let db = serde_json::json!({"format": PLAIN_FORMAT, "entries": [{"id": "a"}], "updatedAt": 1});
        save(&db, None).unwrap();
        let r = load(None).unwrap();
        assert!(!r.encrypted);
        save(&db, Some("我的主密码")).unwrap();
        let r = load(None).unwrap();
        assert!(r.encrypted && r.db.is_none());
        let r = load(Some("错误密码")).unwrap();
        assert!(r.encrypted && r.db.is_none() && r.wrong_password);
        let r = load(Some("我的主密码")).unwrap();
        assert!(r.encrypted && r.db.is_some());
        assert_eq!(r.db.unwrap().get("entries").and_then(|v| v.as_array()).unwrap().len(), 1);

        let _ = std::fs::remove_file(&tmp);
        std::env::remove_var("NOTEVAULT_PASSWORDS_FILE");
    }
}
