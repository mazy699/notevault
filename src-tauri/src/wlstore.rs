//! Worklog 工作台数据文件操作（纯文件层，便于单测/冒烟）。
//! 数据目录：WORKLOG_DATA_DIR 覆盖，默认 %APPDATA%/worklog（与独立 Worklog 共用）。
use std::path::{Path, PathBuf};

pub fn worklog_data_dir() -> PathBuf {
    if let Ok(p) = std::env::var("WORKLOG_DATA_DIR") {
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
    base.join("worklog")
}

pub fn db_file(dir: &Path) -> PathBuf {
    dir.join("worklog.db")
}

pub fn load_db(dir: &Path) -> Result<Option<Vec<u8>>, String> {
    let file = db_file(dir);
    if !file.exists() {
        return Ok(None);
    }
    std::fs::read(&file)
        .map(Some)
        .map_err(|e| format!("读取工作日志数据库失败：{e}"))
}

pub fn save_db(dir: &Path, bytes: &[u8]) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("创建目录失败：{e}"))?;
    let file = db_file(dir);
    let tmp = dir.join("worklog.db.tmp");
    std::fs::write(&tmp, bytes).map_err(|e| format!("写入失败：{e}"))?;
    std::fs::rename(&tmp, &file).map_err(|e| format!("写入失败：{e}"))
}

pub fn aux_read(dir: &Path, name: &str) -> Result<Option<String>, String> {
    let file = dir.join(safe_aux_name(name)?);
    if !file.exists() {
        return Ok(None);
    }
    std::fs::read_to_string(&file)
        .map(Some)
        .map_err(|e| format!("读取失败：{e}"))
}

pub fn aux_write(dir: &Path, name: &str, text: &str) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("创建目录失败：{e}"))?;
    std::fs::write(dir.join(safe_aux_name(name)?), text).map_err(|e| format!("写入失败：{e}"))
}

/// 备份整库：写入 backups/worklog-<毫秒>.db，保留最近 10 份，返回备份路径
pub fn backup(dir: &Path, bytes: &[u8]) -> Result<PathBuf, String> {
    let bdir = dir.join("backups");
    std::fs::create_dir_all(&bdir).map_err(|e| format!("创建备份目录失败：{e}"))?;
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let dest = bdir.join(format!("worklog-{:013}.db", millis));
    std::fs::write(&dest, bytes).map_err(|e| format!("写入备份失败：{e}"))?;
    if let Ok(read) = std::fs::read_dir(&bdir) {
        let mut files: Vec<_> = read
            .flatten()
            .filter_map(|e| {
                let n = e.file_name().to_string_lossy().into_owned();
                (n.starts_with("worklog-") && n.ends_with(".db")).then_some(n)
            })
            .collect();
        files.sort();
        files.reverse();
        for old in files.iter().skip(10) {
            let _ = std::fs::remove_file(bdir.join(old));
        }
    }
    Ok(dest)
}

pub fn info(dir: &Path) -> (String, String) {
    (
        dir.display().to_string(),
        db_file(dir).display().to_string(),
    )
}

pub fn safe_aux_name(name: &str) -> Result<String, String> {
    let ok = !name.is_empty()
        && !name.contains("..")
        && name.ends_with(".json")
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-');
    if !ok {
        return Err("非法的附属文件名".into());
    }
    Ok(name.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aux_name_whitelist() {
        assert!(safe_aux_name("ai.json").is_ok());
        assert!(safe_aux_name("../evil.json").is_err());
        assert!(safe_aux_name("a/b.json").is_err());
        assert!(safe_aux_name("x.txt").is_err());
        assert!(safe_aux_name("").is_err());
    }

    #[test]
    fn full_file_roundtrip() {
        let dir = std::env::temp_dir().join(format!("nv-wlstore-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::env::set_var("WORKLOG_DATA_DIR", &dir);

        assert!(load_db(&dir).unwrap().is_none());
        save_db(&dir, b"hello-sqlite").unwrap();
        assert_eq!(load_db(&dir).unwrap().unwrap(), b"hello-sqlite");

        aux_write(&dir, "ai.json", "{\"model\":\"m\"}").unwrap();
        assert_eq!(aux_read(&dir, "ai.json").unwrap().unwrap(), "{\"model\":\"m\"}");
        assert!(aux_read(&dir, "missing.json").unwrap().is_none());
        assert!(aux_write(&dir, "../x.json", "x").is_err());

        let bpath = backup(&dir, b"backup-bytes").unwrap();
        assert!(bpath.exists());
        assert_eq!(std::fs::read(&bpath).unwrap(), b"backup-bytes");

        // 轮转：手工造 12 份旧备份后应只保留 10 份
        let bdir = dir.join("backups");
        for i in 0..12 {
            let _ = std::fs::write(bdir.join(format!("worklog-000000000000{}0.db", i)), b"old");
        }
        let _ = backup(&dir, b"x");
        let count = std::fs::read_dir(&bdir).unwrap().flatten().count();
        assert_eq!(count, 10, "备份应保留 10 份，实际 {count}");

        let (data_dir, db) = info(&dir);
        assert!(data_dir.contains("nv-wlstore-test"));
        assert!(db.ends_with("worklog.db"));

        let _ = std::fs::remove_dir_all(&dir);
        std::env::remove_var("WORKLOG_DATA_DIR");
    }
}
