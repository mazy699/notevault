// 临时工具：当直连 github.com:443 被阻断而 api.github.com 可用时，
// 按提交序列通过 Git Data API（blob→tree→commit→ref）推送本地提交。
// 用法: node scripts/push-via-api.mjs <remote_head_sha> <local_head_sha>
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO = "mazy699/notevault";
const [BASE_SHA, LOCAL_SHA] = process.argv.slice(2);
if (!BASE_SHA || !LOCAL_SHA) {
  console.error("用法: node scripts/push-via-api.mjs <remote_head_sha> <local_head_sha>");
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

function git(args) {
  return execFileSync("git", args, { maxBuffer: 64 * 1024 * 1024 });
}

// 1. 校验远程基线
const remoteHead = gh("commits/main");
if (remoteHead.sha !== BASE_SHA) {
  console.error(`远程 HEAD (${remoteHead.sha.slice(0, 10)}) 与基线 (${BASE_SHA.slice(0, 10)}) 不一致，中止`);
  process.exit(1);
}
console.log(`基线确认: ${BASE_SHA.slice(0, 10)}`);

// 2. 本地待推送提交序列（旧→新）；%T = 完整 tree sha，%x1e = 记录分隔
const raw = git(["log", "--reverse", "--format=commit:%H|%T|%B%x1e", `${BASE_SHA}..${LOCAL_SHA}`]).toString("utf-8");
const commits = raw
  .split("\x1e")
  .filter((s) => s.trim() !== "")
  .map((chunk) => {
    const lines = chunk.trim().split("\n");
    const head = lines[0];
    const message = lines.slice(1).join("\n").trimEnd() + "\n";
    const hash = /^commit:(\w+)/.exec(head)[1];
    const treeSha = /^commit:\w+\|(\w+)/.exec(head)[1];
    return { hash, treeSha, message };
  });
console.log(`待推送提交: ${commits.length} 个`);
if (commits.length === 0) {
  console.log("远程已同步。");
  process.exit(0);
}

// 3. 逐提交推送：本地 diff（父提交均为本地对象）→ 新 blob → tree → commit
let apiParentSha = BASE_SHA;   // API 侧父提交（首个 = 远程 HEAD）
let localParentSha = BASE_SHA; // 本地侧父提交（git diff 用）
for (const c of commits) {
  // 变更文件（-z + quotepath=false：非 ASCII 路径原样）
  const dz = git(["-c", "core.quotepath=false", "diff", "--name-status", "-z", localParentSha, c.hash]).toString("utf-8");
  const entries = dz.split("\0").filter((s) => s !== "");
  const files = [];
  for (let i = 0; i < entries.length; i += 2) {
    files.push({ status: entries[i], path: entries[i + 1] });
  }
  // 父提交 tree（API 侧父提交可能是 API 创建的，tree 内容与本地一致）
  const parentTree = gh(`git/commits/${apiParentSha}`).tree.sha;
  const treeEntries = [];
  for (const f of files) {
    if (f.status === "D") {
      treeEntries.push({ path: f.path, mode: "100644", type: "blob", sha: null });
      continue;
    }
    const bytes = git(["show", `${c.hash}:${f.path}`]);
    const blob = gh("git/blobs", { content: bytes.toString("base64"), encoding: "base64" }, "POST");
    treeEntries.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
    console.log(`  blob ${f.status} ${f.path} → ${blob.sha.slice(0, 10)}`);
  }
  const newTree = gh("git/trees", { base_tree: parentTree, tree: treeEntries }, "POST");
  // 校验：API tree 与本地 tree 内容寻址一致
  const localTree = git(["rev-parse", `${c.hash}^{tree}`]).toString("utf-8").trim();
  const treeMatch = newTree.sha === localTree;
  console.log(`  tree ${newTree.sha.slice(0, 10)} ${treeMatch ? "✓ 与本地一致" : "✗ 不一致! 本地 " + localTree.slice(0, 10)}`);
  if (!treeMatch) {
    console.error("tree 不一致，中止（避免产生错误历史）");
    process.exit(1);
  }
  // 创建 commit（父 = API 侧父提交）
  const newCommit = gh("git/commits", { message: c.message, tree: newTree.sha, parents: [apiParentSha] }, "POST");
  console.log(`  commit ${c.hash.slice(0, 10)} → API ${newCommit.sha.slice(0, 10)}`);
  apiParentSha = newCommit.sha;
  localParentSha = c.hash;
}

// 4. 更新 refs/heads/main（fast-forward）
const ref = gh("git/refs/heads/main", { sha: apiParentSha, force: false }, "PATCH");
console.log(`refs/heads/main → ${ref.object.sha.slice(0, 10)}`);

// 5. 迁移指向旧 HEAD 的 tag
for (const tag of ["v0.3.0"]) {
  try {
    const tagRef = gh(`git/refs/tags/${tag}`);
    if (tagRef.object.sha === BASE_SHA) {
      gh(`git/refs/tags/${tag}`, { sha: apiParentSha, force: true }, "PATCH");
      console.log(`tag ${tag} 已迁移到 ${apiParentSha.slice(0, 10)}`);
    }
  } catch {
    /* tag 不存在则忽略 */
  }
}

console.log("API 推送完成。");
console.log(`注意: 本地 HEAD (${LOCAL_SHA.slice(0, 10)}) 与远程提交 SHA 不同但内容一致（API 元数据差异）。`);
console.log("网络恢复后执行: git fetch && git reset --hard origin/main 对齐本地。");
