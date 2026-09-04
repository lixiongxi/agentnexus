import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve("..");
const SRC = path.join(ROOT, "index.html");
const B = path.join(ROOT, ".uibuild");

const raw = fs.readFileSync(SRC, "utf8");
const lines = raw.split("\n");
const at = (n) => lines[n - 1]; // 1-based

console.log("总行数:", lines.length);

// ---- 完整性校验：确认锚点行符合预期 ----
const checks = [
  [7, "<style>"],
  [245, "</style>"],
  [246, "</head>"],
  [247, "<body>"],
  [315, "<script>"],
  [1567, "</script>"],
  [1568, "</body>"],
  [1569, "</html>"],
];
let ok = true;
for (const [n, expect] of checks) {
  const got = (at(n) ?? "").trim();
  const pass = got === expect;
  if (!pass) ok = false;
  console.log(`  line ${n}: 期望 "${expect}" 实际 "${got}" ${pass ? "OK" : "<-- 不匹配"}`);
}
if (!ok) {
  console.error("\n锚点校验失败，中止构建（未做任何修改）");
  process.exit(1);
}

// ---- 读取构件 ----
const css = fs.readFileSync(path.join(B, "style.css"), "utf8").trimEnd();
const shell = fs.readFileSync(path.join(B, "shell.html"), "utf8").trimEnd();
const head = fs.readFileSync(path.join(B, "head.html"), "utf8").trimEnd();
const extra = fs.readFileSync(path.join(B, "extra.js"), "utf8").trimEnd();

// ---- 拼接（indices 为 0-based；行 n → index n-1） ----
const out = [
  ...lines.slice(0, 6),                 // 1-6   DOCTYPE .. </title>
  head,                                 //        主题预置脚本（防 FOUC）
  "<style>",
  css,
  "</style>",
  lines[245],                           // 246   </head>
  "<body>",                             // 247
  shell,                                // 248-314 新外壳
  lines[314],                           // 315   <script>
  ...lines.slice(315, 1566),            // 316-1566 原业务逻辑（原样保留）
  extra,                                //        界面增强 v2
  lines[1566],                          // 1567  </script>
  lines[1567],                          // 1568  </body>
  lines[1568],                          // 1569  </html>
  "",                                   //        末尾换行
].join("\n");

// ---- 备份并写入 ----
const bak = path.join(B, "index.backup.html");
fs.writeFileSync(bak, raw, "utf8");
fs.writeFileSync(SRC, out, "utf8");

console.log("\n构建完成");
console.log("  备份:", bak);
console.log("  新文件行数:", out.split("\n").length, "(原", lines.length, ")");

// ---- 关键契约自检 ----
const must = ["#view", 'id="buddy-input"', "buddy-input", "noti-pop", "modal-root",
  "toast-root", "api-badge", "global-search", "nav-overlay", "tabbar", "menu-btn",
  "theme-btn", "chat-dot", "chat-dot-tab", "side-ava", "side-name", "side-org", "top-ava"];
const missing = must.filter((k) => !out.includes(k));
console.log("  关键 ID/类缺失:", missing.length ? missing.join(", ") : "无");
