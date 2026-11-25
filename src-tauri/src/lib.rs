//! NoteVault 桌面宿主（Tauri 2）
pub mod api;
pub mod fsops;
pub mod pwcrypto;
pub mod pwstore;
pub mod snippetstore;
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
        .setup(|app| {
            #[cfg(target_os = "windows")]
            disable_browser_accelerator_keys(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("NoteVault 启动失败");
}

/// Windows WebView2：关闭浏览器加速键，让 Ctrl+P / Ctrl+F 等进入页面（由前端快捷键处理）。
/// 否则 WebView2 会拦截 Ctrl+P（打印）等，导致应用内 Quick Open / 常用语检索无响应。
/// setup 阶段 CoreWebView2 可能尚未就绪，因此后台重试直到设置成功。
#[cfg(target_os = "windows")]
fn disable_browser_accelerator_keys(app: &tauri::AppHandle) {
    use tauri::Manager;
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
    use windows_core::Interface;

    let handle = app.clone();
    std::thread::spawn(move || {
        for _ in 0..20 {
            if let Some(win) = handle.get_webview_window("main") {
                let (tx, rx) = std::sync::mpsc::channel();
                let dispatched = win
                    .with_webview(move |webview| {
                        let applied = unsafe {
                            webview
                                .controller()
                                .CoreWebView2()
                                .ok()
                                .and_then(|core| core.Settings().ok())
                                .and_then(|settings| settings.cast::<ICoreWebView2Settings3>().ok())
                                .map(|settings3| settings3.SetAreBrowserAcceleratorKeysEnabled(false).is_ok())
                                .unwrap_or(false)
                        };
                        let _ = tx.send(applied);
                    })
                    .is_ok();
                if dispatched {
                    if let Ok(true) = rx.recv_timeout(std::time::Duration::from_millis(1000)) {
                        return;
                    }
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    });
}
