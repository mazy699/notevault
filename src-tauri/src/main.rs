// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // 无 UI 冒烟测试模式（自动化验证用）
    if std::env::args().any(|a| a == "--smoke") {
        notevault_lib::smoke::run();
        return;
    }
    notevault_lib::run();
}
