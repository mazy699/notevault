// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // 无 UI 冒烟测试模式（自动化验证用）
    if std::env::args().any(|a| a == "--smoke") {
        notevault_lib::smoke::run();
        return;
    }

    // WebView2 资源优化：关闭本应用用不到的能力（须在 WebView2 初始化前设置）
    #[cfg(target_os = "windows")]
    {
        // 仅在未显式配置时注入，避免覆盖用户/调试场景的自定义参数
        if std::env::var_os("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").is_none() {
            std::env::set_var(
                "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
                // 优化目标：纯文本阅读场景，用软件渲染换掉 GPU 进程（可省 100MB+），
                // 并关闭本应用不需要的后台能力与遥测组件。
                "--disable-gpu \
                 --disable-gpu-compositing \
                 --disable-software-rasterizer \
                 --disable-background-timer-throttling \
                 --disable-renderer-backgrounding \
                 --disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,CalculateNativeWinOcclusion \
                 --disable-extensions \
                 --disable-sync \
                 --disable-breakpad \
                 --no-first-run \
                 --no-default-browser-check \
                 --renderer-process-limit=1 \
                 --js-flags=--max-old-space-size=192",
            );
        }
    }

    notevault_lib::run();
}
