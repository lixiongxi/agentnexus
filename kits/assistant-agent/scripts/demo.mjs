/**
 * demo.mjs —— 全能企业助理演示脚本。
 *
 * 两部分：
 *   1) 离线大脑演示：不依赖平台，直接展示 5 类意图的识别与回复
 *   2) 在线全链路演示：注册演示客户 Agent → 与助理建立对接 → 经 A2A 签名通道
 *      逐条发送样本消息 → 驱动助理处理一轮 → 校验助理的真实应答
 *
 * 用法：node demo.mjs [--live-only]
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadKit, ensureRegistered, processOnce } from "../template-agent/index.mjs";
import { endpoints, hubBase } from "../template-agent/a2a.mjs";
import { handleText } from "../template-agent/brain.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = path.join(HERE, "..", "template-agent", ".state");
const CUSTOMER_FILE = path.join(STATE_DIR, "customer.json");

/** 5 类意图 × 6 条样本消息（sales 含推荐与线索登记两条） */
export const SAMPLES = [
  { intent: "faq", text: "你们的退货政策是什么？", expect: /退货|7\s*天/ },
  { intent: "schedule", text: "明天下午3点帮我约一个产品演示会议", expect: /预约|已为您|CAL-/ },
  { intent: "sales", text: "你们有什么产品？大概什么价格？", expect: /会议屏|视频会议|前台机/ },
  { intent: "sales", text: "帮我登记一条线索：王总 13800138000 想采购会议屏", expect: /LEAD-|线索已登记/ },
  { intent: "ticket", text: "我们会议室的智能会议屏有故障，屏幕无法点亮，联系电话 13912345678，麻烦报修", expect: /TCK-|工单已创建/ },
  { intent: "escalate", text: "转人工，我要找你们负责人", expect: /人工/ },
];

function loadCustomerState() {
  try {
    return JSON.parse(fs.readFileSync(CUSTOMER_FILE, "utf8"));
  } catch {
    return null;
  }
}

function saveCustomerState(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(CUSTOMER_FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
}

/** 注册一个用于演示的客户 Agent（幂等：优先复用本地缓存的可用密钥） */
async function ensureCustomer(hub, cfg) {
  const cached = loadCustomerState();
  if (cached?.slug && cached?.secret) {
    try {
      await endpoints.unread(hub, { slug: cached.slug, secret: cached.secret });
      return { slug: cached.slug, secret: cached.secret, source: "cache" };
    } catch {
      /* 缓存失效则重新注册 */
    }
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? "demo-customer" : `demo-customer-${Math.random().toString(16).slice(2, 6)}`;
    const res = await fetch(`${hub}/api/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "演示客户",
        slug,
        emoji: "🙋",
        color: "#12A150",
        role: "模拟客户发消息的演示 Agent",
        description: "由 kits/assistant-agent/scripts/demo.mjs 创建，用于演示助理的全链路应答。",
        industry: "企业服务",
        tags: ["演示"],
        autoAccept: true,
        online: true,
        owner: { ...cfg.owner, name: "演示脚本", title: "demo" },
      }),
    });
    const envelope = await res.json();
    // 平台统一信封：成功 {ok:true, data:{...agent, secret}}，失败 {ok:false, error:{message}}
    const data = envelope?.ok ? envelope.data : envelope;
    const errMsg = envelope?.error?.message || `HTTP ${res.status}`;
    if (res.ok && data?.secret) {
      const state = { slug, secret: data.secret };
      saveCustomerState(state);
      return { slug, secret: data.secret, source: "registered" };
    }
    // slug 冲突则换随机后缀重试；其他错误直接抛出
    if (!/已存在|conflict|CONFLICT/i.test(errMsg) && res.status !== 409) {
      throw new Error(`注册演示客户失败：${errMsg}`);
    }
  }
  throw new Error("注册演示客户失败：多次 slug 冲突");
}

/** 校验平台可用性；不可用时给出明确的启动指引 */
async function assertHubUp(hub) {
  try {
    const res = await fetch(`${hub}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    throw new Error(
      `平台未运行（${hub}）。请先启动：cd server && npm start（生产请 AUTH_MODE=strict），再运行本脚本。`,
    );
  }
}

/**
 * 在线全链路演示（deploy-verify.mjs 复用）：
 * 客户经 A2A 签名通道发消息 → 助理处理一轮 → 从客户视角校验应答。
 */
export async function runLiveFlow() {
  const cfg = loadKit();
  const hub = hubBase(process.env.AGENT_HUB_URL);
  await assertHubUp(hub);

  const assistant = await ensureRegistered(cfg, hub);
  const assistantAuth = { slug: assistant.slug, secret: assistant.secret };
  const customer = await ensureCustomer(hub, cfg);
  const customerAuth = { slug: customer.slug, secret: customer.secret };

  // 建立对接（助理 autoAccept=true 时立即生效）
  await endpoints.connect(hub, customerAuth, customer.slug, assistant.slug);

  const knowledge = await import("../template-agent/knowledge.mjs").then((m) => m.default);
  const results = [];

  for (const sample of SAMPLES) {
    // 客户 → 助理（走 A2A 外部接入端点，验签 + 落库）
    await endpoints.a2aSend(hub, customerAuth, assistant.slug, customer.slug, sample.text, "chat");
    // 助理处理一轮：拉新消息 → 意图识别 → 回复
    await processOnce(cfg, assistantAuth, knowledge, null);
    // 客户视角拉取应答
    const history = await endpoints.history(hub, customerAuth, assistant.slug, 20);
    const last = (history.messages || []).filter((m) => m.fromAgent === assistant.slug).pop();
    const reply = last?.text || "（未收到回复）";
    results.push({ ...sample, reply, pass: sample.expect.test(reply) });
  }

  return { assistant, customer, results, hub };
}

/* ---------------- CLI ---------------- */

async function main() {
  const cfg = loadKit();
  const knowledge = await import("../template-agent/knowledge.mjs").then((m) => m.default);
  const liveOnly = process.argv.includes("--live-only");

  if (!liveOnly) {
    console.log("\n========== 第一部分：离线大脑演示（不依赖平台） ==========");
    for (const sample of SAMPLES) {
      const { intent, reply } = await handleText(cfg, knowledge, sample.text, null);
      const preview = reply.length > 72 ? reply.slice(0, 72) + "…" : reply;
      console.log(`\n【${intent}】客户：${sample.text}\n        助理：${preview}`);
    }
  }

  console.log("\n========== 第二部分：在线全链路演示（真实签名 + 落库） ==========");
  const { assistant, customer, results } = await runLiveFlow();
  console.log(`助理：${assistant.slug}（密钥来源 ${assistant.source}） · 客户：${customer.slug}（密钥来源 ${customer.source}）\n`);

  let passCount = 0;
  for (const r of results) {
    passCount += r.pass ? 1 : 0;
    const preview = r.reply.length > 90 ? r.reply.slice(0, 90) + "…" : r.reply;
    console.log(`${r.pass ? "✅" : "❌"} [${r.intent}] ${r.text}\n   ↳ ${preview}`);
  }

  console.log(`\n结果：${passCount}/${results.length} 条应答符合预期。`);
  if (passCount < results.length) process.exit(1);
}

if (import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1] || "").href) {
  main().catch((e) => {
    console.error(`[error] ${e.message}`);
    process.exit(1);
  });
}
