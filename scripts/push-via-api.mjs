// 临时工具：当直连 github.com:443 被阻断时，通过 gh api（api.github.com）
// 用 Git Data API 推送本地最新提交（文本变更）。
// 用法: node scripts/push-via-api.mjs <local_commit_sha> <base_commit_sha>
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO = "mazy699/notevault";
const [LOCAL_SHA, BASE_SHA] = process.argv.slice(2);
if (!LOCAL_SHA || !BASE_SHA) {
  console.error("用法: node scripts/push-via-api.mjs <local_sha> <base_sha>");
  process.exit(1);
}

function gh(endpoint, payload, method = "GET") {
  const args = ["api", `repos/${REPO}/${endpoint}`];
  if (payload) {
    const tmp = path.join(process.env.TEMP || "/tmp", `ghapi-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    fs.writeFileSync(tmp, JSON.stringify(payload));
    args.push("--input", tmp, "-X", method);
  }
  const out = execFileSync("gh", args, { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
  return out ? JSON.parse(out) : null;
}

// 1. 远程当前状态
const remoteHead = gh("commits/main");
console.log(`远程 HEAD: ${remoteHead.sha.slice(0, 10)} (tree ${remoteHead.commit.tree.sha.slice(0, 10)})`);
if (remoteHead.sha !== BASE_SHA) {
  console.error(`远程 HEAD 已不是预期的基线 ${BASE_SHA.slice(0, 10)}，中止`);
  process.exit(1);
}

// 2. 变更文件清单与类型
const files = execFileSync("git", ["diff", "--name-status", BASE_SHA, LOCAL_SHA], { encoding: "utf-8" })
  .trim().split("\n").map((l) => {
    const [status, ...rest] = l.split("\t");
    return { status: status.trim(), path: rest.join("\t") };
  });
console.log(`变更文件: ${files.map((f) => f.status + " " + f.path).join(", ")}`);

// 3. 创建 blob（base64，文本/二进制通用）
const tree = [];
for (const f of files) {
  if (f.status === "D") {
    tree.push({ path: f.path, mode: "100644", type: "blob", sha: null });
    continue;
  }
  const content = fs.readFileSync(f.path).toString("base64");
  const blob = gh("git/blobs", { content, encoding: "base64" }, "POST");
  tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
  console.log(`  blob ${f.path} → ${blob.sha.slice(0, 10)}`);
}

// 4. 创建 tree（以远程 HEAD 的 tree 为基准）
const newTree = gh("git/trees", { base_tree: remoteHead.commit.tree.sha, tree }, "POST");
console.log(`新 tree: ${newTree.sha.slice(0, 10)}`);

// 5. 创建 commit（沿用本地提交信息与作者时间）
const message = execFileSync("git", ["log", "-1", "--format=%B", LOCAL_SHA], { encoding: "utf-8" });
const newCommit = gh(
  "git/commits",
  { message: message.trimEnd(), tree: newTree.sha, parents: [remoteHead.sha] },
  "POST"
);
console.log(`新 commit: ${newCommit.sha.slice(0, 10)}`);

// 6. 更新 refs/heads/main（fast-forward）
const ref = gh("git/refs/heads/main", { sha: newCommit.sha, force: false }, "PATCH");
console.log(`refs/heads/main → ${ref.object.sha.slice(0, 10)}`);
console.log("API 推送完成。");
