/**
 * 端到端冒烟测试：注册 → 签名对接 → 发消息（含 bot 应答）→ 票据兑换 → SSE 订阅。
 * 用法：node scripts/e2e-smoke.mjs [baseUrl]
 */
import crypto from "node:crypto";

const BASE = process.argv[2] ?? "http://localhost:3000";
let passed = 0;
let failed = 0;

function check(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name} ${detail}`);
  }
}

async function api(method, path, { body, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* 非 JSON 响应 */
  }
  return { status: res.status, json };
}

function signedHeaders(slug, secret, rawBody) {
  const ts = Date.now();
  const sig = crypto.createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
  return { "X-Agent": slug, "X-Timestamp": String(ts), "X-Signature": sig };
}

console.log(`\n=== AgentNexus 端到端冒烟测试（${BASE}）===\n`);

/* 1. 健康 */
const health = await api("GET", "/health");
check("健康检查", health.json?.ok === true);

/* 2. 广场 */
const square = await api("GET", "/api/agents?pageSize=5");
check("广场列表返回统一响应体", square.json?.ok === true && Array.isArray(square.json?.data?.items));
check("种子 Agent 就绪", (square.json?.data?.total ?? 0) >= 10, `total=${square.json?.data?.total}`);

/* 3. 注册新 Agent */
const slug = `smoke-${Date.now().toString(36)}`;
const regBody = JSON.stringify({
  name: "冒烟测试员",
  slug,
  role: "端到端冒烟测试",
  industry: "企业服务",
  tags: ["测试"],
  owner: { name: "冒烟", org: "测试组织", email: `smoke-${Date.now()}@test.example` },
});
const reg = await api("POST", "/api/agents", { body: JSON.parse(regBody) });
const secret = reg.json?.data?.secret;
check("注册 Agent 成功并返回密钥", reg.status === 200 && reg.json?.ok === true && typeof secret === "string");

/* 4. 无签名对接被拒 */
const noSig = await api("POST", "/api/connections", { body: { fromAgent: slug, toAgent: "xiaotuo" } });
check("无签名对接被拒（401）", noSig.status === 401 && noSig.json?.error?.code === "SIGNATURE_MISSING");

/* 5. 篡改签名被拒 */
const ts = Date.now();
const tamperedSig = crypto.createHmac("sha256", secret).update(`${ts}.{"evil":true}`).digest("hex");
const tampered = await api("POST", "/api/connections", {
  body: { fromAgent: slug, toAgent: "xiaotuo" },
  headers: { "X-Agent": slug, "X-Timestamp": String(ts), "X-Signature": tamperedSig },
});
check("篡改签名被拒（401）", tampered.status === 401 && tampered.json?.error?.code === "SIGNATURE_INVALID");

/* 6. 冒用他人身份被拒（签名是自己的，fromAgent 却写别人） */
const borrowBody = JSON.stringify({ fromAgent: "xiaotuo", toAgent: "xiaomei" });
const borrow = await api("POST", "/api/connections", {
  body: JSON.parse(borrowBody),
  headers: signedHeaders(slug, secret, borrowBody),
});
check("冒用他人身份发起对接被拒（403）", borrow.status === 403);

/* 7. 签名对接成功 */
const connBody = JSON.stringify({ fromAgent: slug, toAgent: "xiaotuo" });
const conn = await api("POST", "/api/connections", {
  body: JSON.parse(connBody),
  headers: signedHeaders(slug, secret, connBody),
});
check("签名对接成功", conn.json?.ok === true && conn.json?.data?.created === true);

/* 8. 发消息 → bot 应答（同步落库） */
const msgBody = JSON.stringify({ fromAgent: slug, toAgent: "xiaotuo", text: "帮我们拓华东制造业的线索", type: "chat" });
const msg = await api("POST", "/api/messages", {
  body: JSON.parse(msgBody),
  headers: signedHeaders(slug, secret, msgBody),
});
check("消息发送成功", msg.json?.ok === true && msg.json?.data?.message?.id !== undefined);
check("对方 bot 同步应答", typeof msg.json?.data?.bot?.text === "string" && msg.json.data.bot.text.length > 0, msg.json?.data?.bot?.text?.slice(0, 30));

/* 9. 历史消息（含 bot 应答，且自动已读） */
const hist = await api("GET", "/api/messages?peer=xiaotuo&limit=50", { headers: signedHeaders(slug, secret, "") });
check("历史消息双向可查", (hist.json?.data?.messages?.length ?? 0) >= 2);
check("拉取历史后未读清零", hist.json?.data?.unreadCleared >= 1);

/* 10. 票据兑换与 SSE */
const ticketRes = await api("POST", "/api/realtime/ticket", { body: {}, headers: signedHeaders(slug, secret, "{}") });
const ticket = ticketRes.json?.data?.ticket;
check("签名兑换实时票据", typeof ticket === "string");

if (ticket) {
  const sse = await fetch(`${BASE}/api/stream?ticket=${encodeURIComponent(ticket)}`);
  check("票据建立 SSE 连接", sse.status === 200 && sse.headers.get("content-type")?.includes("text/event-stream"));
  // 读取首帧（connected）
  const reader = sse.body.getReader();
  const { value } = await reader.read();
  const firstFrame = new TextDecoder().decode(value ?? new Uint8Array());
  check("SSE 首帧为 connected", firstFrame.includes("connected"));
  // 再发一条消息，验证实时推送
  const msg2Body = JSON.stringify({ fromAgent: slug, toAgent: "xiaotuo", text: "再测一条实时推送", type: "chat" });
  await api("POST", "/api/messages", { body: JSON.parse(msg2Body), headers: signedHeaders(slug, secret, msg2Body) });
  let pushed = "";
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && !pushed.includes("实时推送")) {
    const { value: chunk, done } = await reader.read();
    if (done) break;
    pushed += new TextDecoder().decode(chunk ?? new Uint8Array());
  }
  check("SSE 实时收到新消息", pushed.includes("实时推送"));
  // 票已被消费：重用应被拒绝
  const reuse = await fetch(`${BASE}/api/stream?ticket=${encodeURIComponent(ticket)}`);
  check("票据一次性（重用被拒）", reuse.status === 401);
  await reader.cancel();
}

/* 11. 巡航设置（按 Agent 隔离） */
const apSet = await api("PATCH", "/api/autopilot/settings", {
  body: { minScore: 80 },
  headers: signedHeaders(slug, secret, JSON.stringify({ minScore: 80 })),
});
check("巡航设置可更新", apSet.json?.data?.minScore === 80);

/* 12. 清理测试 Agent 的痕迹（消息与对接由库保留，属演示数据可接受） */
console.log(`\n结果：${passed} 通过 / ${failed} 失败\n`);
process.exit(failed > 0 ? 1 : 0);
