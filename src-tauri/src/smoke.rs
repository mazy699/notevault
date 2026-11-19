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

    macro_rules! check {
        ($name:expr, $cond:expr) => {
            let pass = $cond;
            checks.push(json!({ "name": $name, "pass": pass }));
            if !pass {
                ok = false;
            }
        };
    }

    // 1. 目录树
    let tree = fsops::build_tree(&dir);
    match &tree {
        Ok(t) => {
            check!("tree_root_dir", t.dir);
            let children = t.children.as_ref().unwrap();
            check!("tree_children_count", children.len() == 2); // a.md + sub
            let sub = children.iter().find(|c| c.name == "sub").unwrap();
            check!("tree_sub_children", sub.children.as_ref().unwrap().len() == 2);
            let a = children.iter().find(|c| c.name == "a.md").unwrap();
            check!("tree_kind_markdown", matches!(a.kind, fsops::FileKind::Markdown));
        }
        Err(e) => check!("tree_built", false),
    }

    // 2. 文件读取
    match fsops::read_file_content(&dir, "a.md") {
        Ok(fc) => {
            check!("read_content", fc.content.contains("关键词"));
            check!("read_encoding", fc.encoding == "utf-8");
        }
        Err(_) => check!("read_ok", false),
    }
    match fsops::read_file_content(&dir, "sub/../a.md") {
        Err(e) => check!("read_traversal_rejected", e.contains("非法")),
        Ok(_) => check!("read_traversal_rejected", false),
    }

    // 3. 搜索
    let (html_plain) = fsops::strip_html_tags("<p>hello <b>world</b><script>hidden()</script></p>");
    check!("strip_html", html_plain.contains("hello") && html_plain.contains("world") && !html_plain.contains("hidden"));
    let matches = fsops::find_matches(md, "关键词", 8);
    check!("search_match", matches.len() == 1 && matches[0].line == 3);

    // 4. 快照
    let snap = fsops::snapshot(&dir);
    match &snap {
        Ok(entries) => check!("snapshot_entries", entries.len() == 4),
        Err(_) => check!("snapshot_ok", false),
    }

    // 5. GBK 解码
    let (text, enc) = fsops::decode_text(&[0xd6, 0xd0, 0xce, 0xc4]);
    check!("gbk_decode", enc == "gbk" && text == "中文");

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
