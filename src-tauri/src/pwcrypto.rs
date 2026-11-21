//! 密码库加密：scrypt(N=2^15, r=8, p=1) 派生密钥 + AES-256-GCM。
//! 与 Web 宿主（node:crypto）保持**同一格式**，文件可跨宿主互操作：
//! `{ "format": "notevault-pw-enc-v1", "kdf": "scrypt", "salt": b64, "nonce": b64, "data": b64(ct||tag) }`
use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::Aes256Gcm;
use base64::Engine;
use scrypt::scrypt;

const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const TAG_LEN: usize = 16;
const KEY_LEN: usize = 32;

fn b64_encode(data: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(data)
}

fn b64_decode(s: &str) -> Result<Vec<u8>, String> {
    base64::engine::general_purpose::STANDARD
        .decode(s)
        .map_err(|e| format!("base64 解码失败：{e}"))
}

fn derive_key(master: &str, salt: &[u8]) -> [u8; KEY_LEN] {
    // N=2^15, r=8, p=1 —— 与 node scryptSync({cost:32768, blockSize:8, parallelization:1}) 一致
    let params = scrypt::Params::new(15, 8, 1, KEY_LEN).expect("scrypt 参数固定合法");
    let mut out = [0u8; KEY_LEN];
    scrypt(master.as_bytes(), salt, &params, &mut out).expect("scrypt 派生失败");
    out
}

/// 加密：返回完整 JSON 文件内容（含 format/kdf/salt/nonce/data 字段）
pub fn encrypt_to_json(db_json: &str, master: &str) -> Result<String, String> {
    use rand_core::RngCore;
    let mut salt = [0u8; SALT_LEN];
    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand_core::OsRng.fill_bytes(&mut salt);
    rand_core::OsRng.fill_bytes(&mut nonce_bytes);

    let key = derive_key(master, &salt);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| format!("AES 初始化失败：{e}"))?;
    let nonce = aes_gcm::Nonce::from_slice(&nonce_bytes);
    let ct = cipher
        .encrypt(nonce, Payload { msg: db_json.as_bytes(), aad: &[] })
        .map_err(|_| "加密失败".to_string())?;
    // aes-gcm crate 的 encrypt 返回 ct||tag，与 Node 端 ciphertext||authTag 格式一致
    let enc = serde_json::json!({
        "format": "notevault-pw-enc-v1",
        "kdf": "scrypt",
        "salt": b64_encode(&salt),
        "nonce": b64_encode(&nonce_bytes),
        "data": b64_encode(&ct),
    });
    serde_json::to_string_pretty(&enc).map_err(|e| format!("序列化失败：{e}"))
}

/// 解密：GCM tag 校验失败 = 主密码错误
pub fn decrypt_from_json(raw_json: &str, master: &str) -> Result<String, String> {
    let enc: serde_json::Value = serde_json::from_str(raw_json).map_err(|e| format!("文件解析失败：{e}"))?;
    let salt_b64 = enc.get("salt").and_then(|v| v.as_str()).ok_or("缺少 salt")?;
    let nonce_b64 = enc.get("nonce").and_then(|v| v.as_str()).ok_or("缺少 nonce")?;
    let data_b64 = enc.get("data").and_then(|v| v.as_str()).ok_or("缺少 data")?;
    let salt = b64_decode(salt_b64)?;
    let nonce_bytes = b64_decode(nonce_b64)?;
    let blob = b64_decode(data_b64)?;
    if blob.len() < TAG_LEN {
        return Err("密文数据不完整".into());
    }
    let key = derive_key(master, &salt);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| format!("AES 初始化失败：{e}"))?;
    let nonce = aes_gcm::Nonce::from_slice(&nonce_bytes);
    cipher
        .decrypt(nonce, blob.as_ref())
        .map(|pt| String::from_utf8_lossy(&pt).into_owned())
        .map_err(|_| "主密码错误或文件已损坏".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let db = r#"{"format":"notevault-pw-v1","entries":[],"updatedAt":1}"#;
        let enc = encrypt_to_json(db, "主密码123").unwrap();
        assert!(enc.contains("notevault-pw-enc-v1"));
        let dec = decrypt_from_json(&enc, "主密码123").unwrap();
        assert_eq!(dec, db);
    }

    #[test]
    fn wrong_password_fails() {
        let enc = encrypt_to_json("{}", "right").unwrap();
        assert!(decrypt_from_json(&enc, "wrong").is_err());
    }
}
