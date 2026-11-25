//! 无 UI 冒烟测试：--smoke 参数时运行核心 fsops 并退出（供自动化验证）
use serde_json::json;

pub fn run() {
    let mut ok = true;
    let mut checks: Vec<serde_json::Value> = Vec::new();

    let dir = std::env::temp_dir().join(format!("notevault_smoke_{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(dir.join("sub")).expect("创建临时目录");

    let md = "# 标题\n\n正文 contains 关键词 here\n\n```mermaid\nflowchart TD\n```\n";
    std::fs::write(dir.join("a.md"), md).expect("写入 a.md");
    std::fs::write(dir.join("sub/b.html"), "<html><body><p>html 内容 keyword</p><script>var x=1;</script></body></html>").expect("写入 b.html");
    std::fs::write(dir.join("sub/图片.png"), [0u8, 1, 2, 3]).expect("写入 c");
    std::fs::write(dir.join("sub/query.sql"), "SELECT id FROM docs WHERE type = 'md';\n").expect("写入 sql");

    macro_rules! check {
        ($name:expr, $cond:expr) => {{
            let pass: bool = $cond;
            checks.push(json!({ "name": $name, "pass": pass }));
            if !pass {
                ok = false;
            }
        }};
    }

    // 1. 目录树
    let tree = crate::fsops::build_tree(&dir);
    match &tree {
        Ok(t) => {
            check!("tree_root_dir", t.dir);
            let children = t.children.as_ref().unwrap();
            check!("tree_children_count", children.len() == 2); // a.md + sub
            let sub = children.iter().find(|c| c.name == "sub").unwrap();
            check!("tree_sub_children", sub.children.as_ref().unwrap().len() == 3); // b.html + 图片.png + query.sql
            let a = children.iter().find(|c| c.name == "a.md").unwrap();
            check!("tree_kind_markdown", matches!(a.kind, crate::fsops::FileKind::Markdown));
        }
        Err(_) => check!("tree_built", false),
    }

    // 2. 文件读取
    match crate::fsops::read_file_content(&dir, "a.md") {
        Ok(fc) => {
            check!("read_content", fc.content.contains("关键词"));
            check!("read_encoding", fc.encoding == "utf-8");
        }
        Err(_) => check!("read_ok", false),
    }
    match crate::fsops::read_file_content(&dir, "sub/../a.md") {
        Err(e) => check!("read_traversal_rejected", e.contains("非法")),
        Ok(_) => check!("read_traversal_rejected", false),
    }

    // 3. 搜索
    let html_plain = crate::fsops::strip_html_tags("<p>hello <b>world</b><script>hidden()</script></p>");
    check!("strip_html", html_plain.contains("hello") && html_plain.contains("world") && !html_plain.contains("hidden"));
    let matches = crate::fsops::find_matches(md, "关键词", 8, false);
    check!("search_match", matches.len() == 1 && matches[0].line == 3);
    let matches_cs = crate::fsops::find_matches("KEYWORD 大写\nkeyword 小写", "keyword", 8, true);
    check!("search_case_sensitive", matches_cs.len() == 1 && matches_cs[0].line == 2);

    // 4. 快照（4 个文件：a.md、sub/b.html、sub/图片.png、sub/query.sql）
    let snap = crate::fsops::snapshot(&dir);
    match &snap {
        Ok((entries, truncated)) => {
            check!("snapshot_entries", entries.len() == 4 && !*truncated);
        }
        Err(_) => check!("snapshot_ok", false),
    }

    // 5. GBK 解码
    let (text, enc) = crate::fsops::decode_text(&[0xd6, 0xd0, 0xce, 0xc4]);
    check!("gbk_decode", enc == "gbk" && text == "中文");

    // 6. 代码文件分类与读取（sql → code 类型，可读、可搜索）
    check!("kind_sql_code", matches!(crate::fsops::kind_of("query.sql"), crate::fsops::FileKind::Code));
    match crate::fsops::read_file_content(&dir, "sub/query.sql") {
        Ok(fc) => {
            check!("code_read", fc.content.contains("SELECT") && fc.encoding == "utf-8");
            check!("code_kind", matches!(fc.kind, crate::fsops::FileKind::Code));
        }
        Err(_) => check!("code_read_ok", false),
    }

    // 7. Git 对比链路（真实 git 仓库：init → commit → git_run_bytes 读历史版本）
    let gdir = std::env::temp_dir().join(format!("notevault_smoke_git_{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&gdir);
    std::fs::create_dir_all(&gdir).expect("创建 git 临时目录");
    std::fs::write(gdir.join("demo.txt"), "version one\n").expect("写入 demo.txt");
    let init = |args: &[&str]| {
        std::process::Command::new("git")
            .args(["-C", gdir.to_string_lossy().as_ref(), "-c", "user.name=t", "-c", "user.email=t@t"])
            .args(args)
            .output()
            .expect("git 可用")
    };
    init(&["init", "-q"]);
    init(&["add", "."]);
    init(&["commit", "-q", "-m", "v1"]);
    std::fs::write(gdir.join("demo.txt"), "version two\n").expect("写入 v2");
    init(&["add", "."]);
    init(&["commit", "-q", "-m", "v2"]);
    let log = crate::api::git_run(&["log", "--pretty=format:%H", "--", "demo.txt"], &gdir);
    match log {
        Ok(hashes) => {
            let heads: Vec<&str> = hashes.lines().collect();
            check!("git_log_commits", heads.len() == 2);
            if heads.len() == 2 {
                match crate::api::git_run_bytes(&["show", &format!("{}:demo.txt", heads[1])], &gdir) {
                    Ok(bytes) => {
                        let (content, _) = crate::fsops::decode_text(&bytes);
                        check!("git_show_旧版本", content.contains("version one"));
                    }
                    Err(_) => check!("git_show_ok", false),
                }
                match crate::api::git_run_bytes(&["show", &format!("{}:demo.txt", heads[0])], &gdir) {
                    Ok(bytes) => {
                        let (content, _) = crate::fsops::decode_text(&bytes);
                        check!("git_show_新版本", content.contains("version two"));
                    }
                    Err(_) => check!("git_show_ok2", false),
                }
            }
        }
        Err(e) => check!(format!("git_log_failed: {}", e).as_str(), false),
    }
    // 状态栏分支解析（git_branch 的核心调用）
    match crate::api::git_run(&["rev-parse", "--abbrev-ref", "HEAD"], &gdir) {
        Ok(out) => {
            let name = out.trim();
            check!("git_branch_resolve", !name.is_empty() && name != "HEAD");
        }
        Err(_) => check!("git_branch_resolve", false),
    }
    let _ = std::fs::remove_dir_all(&gdir);

    // ---------------- 密码工作台：pwstore + pwcrypto（独立临时文件，不碰真实用户库） ----------------
    let pw_path = std::env::temp_dir().join(format!("notevault_smoke_pw_{}.json", std::process::id()));
    let _ = std::fs::remove_file(&pw_path);
    std::env::set_var("NOTEVAULT_PASSWORDS_FILE", &pw_path);

    // 首次加载 = 空明文库
    match crate::pwstore::load(None) {
        Ok(r) => {
            check!("pw_first_load_empty", !r.encrypted && r.db.is_some());
        }
        Err(e) => check!(format!("pw_first_load_failed: {}", e).as_str(), false),
    }
    // 明文保存 → 识别为明文
    let db = json!({"format": "notevault-pw-v1", "entries": [{"id": "e1", "title": "t", "password": "p"}], "updatedAt": 1});
    let save_r = crate::pwstore::save(&db, None);
    check!("pw_save_plain", save_r.is_ok());
    // 加密保存 → 未提供密码时 encrypted+db=None
    check!("pw_save_encrypted", crate::pwstore::save(&db, Some("master-主密码")).is_ok());
    match crate::pwstore::load(None) {
        Ok(r) => check!("pw_locked_without_master", r.encrypted && r.db.is_none() && !r.wrong_password),
        Err(e) => check!(format!("pw_locked_failed: {}", e).as_str(), false),
    }
    // 错误密码 → wrongPassword
    match crate::pwstore::load(Some("错误")) {
        Ok(r) => check!("pw_wrong_password", r.encrypted && r.db.is_none() && r.wrong_password),
        Err(e) => check!(format!("pw_wrong_failed: {}", e).as_str(), false),
    }
    // 正确密码 → 数据一致（roundtrip）
    match crate::pwstore::load(Some("master-主密码")) {
        Ok(r) => {
            let entries_ok = r
                .db
                .as_ref()
                .and_then(|d| d.get("entries").and_then(|v| v.as_array()))
                .map(|a| a.len() == 1)
                .unwrap_or(false);
            check!("pw_unlock_roundtrip", r.encrypted && entries_ok);
        }
        Err(e) => check!(format!("pw_unlock_failed: {}", e).as_str(), false),
    }
    // pwcrypto 加密格式自检（Node 互操作格式由 Web 端实测覆盖）
    let enc = crate::pwcrypto::encrypt_to_json("{\"x\":1}", "pw").expect("encrypt");
    check!("pw_crypto_format", enc.contains("notevault-pw-enc-v1") && enc.contains("\"kdf\""));

    let _ = std::fs::remove_file(&pw_path);
    std::env::remove_var("NOTEVAULT_PASSWORDS_FILE");

    // ---------------- 常用语工作台：snippetstore（独立临时文件） ----------------
    let sn_path = std::env::temp_dir().join(format!("notevault_smoke_snippets_{}.json", std::process::id()));
    let _ = std::fs::remove_file(&sn_path);
    std::env::set_var("NOTEVAULT_SNIPPETS_FILE", &sn_path);
    match crate::snippetstore::load() {
        Ok(db) => check!(
            "snippets_first_load_empty",
            db.get("format").and_then(|v| v.as_str()) == Some("notevault-snippets-v1")
                && db.get("snippets").and_then(|v| v.as_array()).map(|a| a.is_empty()).unwrap_or(false)
        ),
        Err(e) => check!(format!("snippets_first_load_failed: {}", e).as_str(), false),
    }
    let sdb = json!({
        "format": "notevault-snippets-v1",
        "snippets": [{ "id": "s1", "title": "问候", "content": "你好\n世界", "group": "话术", "createdAt": 1, "updatedAt": 2 }],
        "updatedAt": 3,
        "order": ["s1"],
    });
    check!("snippets_save", crate::snippetstore::save(&sdb).is_ok());
    match crate::snippetstore::load() {
        Ok(db) => {
            let content = db
                .get("snippets")
                .and_then(|v| v.as_array())
                .and_then(|a| a.first())
                .and_then(|s| s.get("content"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            check!("snippets_roundtrip", content == "你好\n世界");
        }
        Err(e) => check!(format!("snippets_roundtrip_failed: {}", e).as_str(), false),
    }
    std::fs::write(&sn_path, "{ bad-json").expect("写入损坏常用语文件");
    check!("snippets_corrupt_rejected", crate::snippetstore::load().is_err());
    let _ = std::fs::remove_file(&sn_path);
    std::env::remove_var("NOTEVAULT_SNIPPETS_FILE");

    // ---------------- Worklog 工作台：整库文件层（独立临时目录） ----------------
    let wl_dir = std::env::temp_dir().join(format!("notevault_smoke_wl_{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&wl_dir);
    std::env::set_var("WORKLOG_DATA_DIR", &wl_dir);
    check!("wl_load_empty", crate::wlstore::load_db(&wl_dir).unwrap().is_none());
    check!("wl_save_roundtrip", crate::wlstore::save_db(&wl_dir, b"SQLite format 3").is_ok()
        && crate::wlstore::load_db(&wl_dir).unwrap().unwrap() == b"SQLite format 3");
    check!(
        "wl_aux_roundtrip",
        crate::wlstore::aux_write(&wl_dir, "ai.json", "{\"k\":1}").is_ok()
            && crate::wlstore::aux_read(&wl_dir, "ai.json").unwrap().unwrap().contains("\"k\"")
    );
    match crate::wlstore::backup(&wl_dir, b"bk") {
        Ok(p) => check!("wl_backup_written", p.exists()),
        Err(_) => check!("wl_backup_written", false),
    }
    let _ = std::fs::remove_dir_all(&wl_dir);
    std::env::remove_var("WORKLOG_DATA_DIR");

    let _ = std::fs::remove_dir_all(&dir);

    println!("SMOKE_RESULT={}", json!({ "ok": ok }));
    for c in &checks {
        if !c["pass"].as_bool().unwrap_or(false) {
            println!("SMOKE_FAIL={}", c);
        }
    }
    println!("SMOKE_DETAIL=共 {} 项，失败 {} 项", checks.len(), checks.iter().filter(|c| !c["pass"].as_bool().unwrap_or(false)).count());
    std::process::exit(if ok { 0 } else { 1 });
}
