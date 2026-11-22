//! NoteVault 桌面宿主（Tauri 2）
pub mod api;
pub mod fsops;
pub mod pwcrypto;
pub mod pwstore;
pub mod wlstore;
pub mod settings;
pub mod vault_proto;
pub mod smoke;

use std::sync::Mutex;

pub struct AppState {
    pub settings: Mutex<settings::Settings>,
    pub vault_path: Mutex<Option<std::path::PathBuf>>,
    pub vault_history: Mutex<Vec<String>>,
}

pub fn run() {
    let settings = settings::Settings::load();
    let vault_path = settings.get("last_vault").map(std::path::PathBuf::from);
    let vault_history: Vec<String> = settings
        .get("vault_history")
        .and_then(|v| serde_json::from_str(&v).ok())
        .unwrap_or_default();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AppState {
            settings: Mutex::new(settings),
            vault_path: Mutex::new(vault_path),
            vault_history: Mutex::new(vault_history),
        })
        .invoke_handler(tauri::generate_handler![api::api])
        .register_uri_scheme_protocol("vault", vault_proto::handle)
        .run(tauri::generate_context!())
        .expect("NoteVault 启动失败");
}
