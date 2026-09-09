/**
 * deploy-verify.mjs —— 交付验收脚本：五步验收，输出 acceptance-report.md。
 *
 * 步骤：
 *   1. 平台健康检查（未运行则给出启动命令并终止）
 *   2. 助理注册幂等性（连续两次 ensureRegistered，第二次必须命中本地缓存）
 *   3. HMAC 签名链路（助理身份调用签名端点被正常受理）
 *   4. 五类意图全链路应答（复用 demo.mjs 的在线流程）
 *   5. 平台 18 项端到端冒烟（server/scripts/e2e-smoke.mjs）
 *
 * 用法：node deploy-verify.mjs
 * 报告：kits/assistant-agent/template-agent/.state/acceptance-report.md
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadKit, ensureRegistered } from "../template-agent/index.mjs";
import { endpoints, hubBase } from "../template-agent/a2a.mjs";
import { runLiveFlow } from "./demo.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(HERE, "..", "..", "..", "server");
const REPORT_DIR = path.join(HERE, "..", "template-agent", ".state");
const REPORT_FILE = path.join(REPORT_DIR, "acceptance-report.md");

const results = [];
const step = async (name, fn) => {
  try {
    const detail = await fn();
    results.push({ name, pass: true, detail: detail || "OK" });
    console.log(`✅ ${name}${detail ? ` — ${detail}` : ""}`);
    return true;
  } catch (e) {
    results.push({ name, pass: false, detail: e.message });
    console.error(`❌ ${name}\n   ${e.message}`);
    return false;
  }
};

async function main() {
  const cfg = loadKit();
  const hub = hubBase(process.env.AGENT_HUB_URL);
  console.log(`开始验收：hub=${hub} · 助理 slug=${cfg.slug}\n`);

  /* 1. 平台健康 */
  let hubUp = await step("① 平台健康检查", async () => {
    const res = await fetch(`${hub}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return "服务在线";
  });
  if (!hubUp) {
    console.error(`\n平台未运行。请先执行：cd ${SERVER_DIR} && npm start，然后重跑本脚本。`);
    process.exit(1);
  }

  /* 2. 注册幂等性 */
  await step("② 助理注册（幂等）", async () => {
    const first = await ensureRegistered(cfg, hub);
    const second = await ensureRegistered(cfg, hub);
    if (first.secret !== second.secret) throw new Error("两次注册返回的密钥不一致，幂等性破坏");
    return `slug=${first.slug} · 密钥来源=${first.source} → ${second.source}（缓存命中）`;
  });

  /* 3. 签名链路 */
  const reg = await ensureRegistered(cfg, hub);
  await step("③ HMAC 签名链路", async () => {
    const unread = await endpoints.unread(hub, { slug: reg.slug, secret: reg.secret });
    return `签名请求被受理（当前未读 ${unread.unread}）`;
  });

  /* 4. 五类意图全链路 */
  await step("④ 五类意图全链路应答（秘书/客服/销售/工单/转人工）", async () => {
    const { results: samples } = await runLiveFlow();
    const failed = samples.filter((s) => !s.pass);
    if (failed.length) {
      throw new Error(`${failed.length} 条应答不符预期：${failed.map((f) => f.intent).join("、")}`);
    }
    return `${samples.length}/${samples.length} 条应答符合预期`;
  });

  /* 5. 平台 18 项冒烟 */
  await step("⑤ 平台 18 项端到端冒烟（server/scripts/e2e-smoke.mjs）", async () => {
    const r = spawnSync(process.execPath, ["scripts/e2e-smoke.mjs"], {
      cwd: SERVER_DIR,
      encoding: "utf8",
      timeout: 180000,
    });
    const output = (r.stdout || "") + (r.stderr || "");
    const count = (output.match(/✅/g) || []).length;
    if (r.status !== 0 || count < 18) {
      throw new Error(`冒烟通过 ${count}/18（exit=${r.status}）\n${output.slice(-600)}`);
    }
    return `${count}/18 全部通过`;
  });

  /* 报告 */
  const passed = results.filter((r) => r.pass).length;
  const lines = [
    "# AgentNexus 全能企业助理 · 交付验收报告",
    "",
    `- 时间：${new Date().toLocaleString()}`,
    `- 平台：${hub}`,
    `- 助理：${cfg.slug}（${cfg.name}）`,
    `- 结果：**${passed}/${results.length} 项通过**`,
    "",
    "| # | 步骤 | 结果 | 说明 |",
    "| - | ---- | ---- | ---- |",
    ...results.map((r, i) => `| ${i + 1} | ${r.name} | ${r.pass ? "✅ PASS" : "❌ FAIL"} | ${r.detail.replaceAll("\n", " ")} |`),
    "",
  ];
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(REPORT_FILE, lines.join("\n"));

  console.log(`\n验收结论：${passed}/${results.length} 项通过${passed === results.length ? " —— 可交付 ✅" : " —— 存在未通过项 ❌"}`);
  console.log(`报告已写入：${REPORT_FILE}`);
  if (passed < results.length) process.exit(1);
}

main().catch((e) => {
  console.error(`[error] ${e.message}`);
  process.exit(1);
});
