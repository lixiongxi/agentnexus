/**
 * AgentNexus 端到端冒烟（本地 3100）
 * 覆盖：注册一体化 / 唯一性 / 广场 / 对接 / 单聊+自动应答 / 群+任务 / 动态 /
 *       助理知识库 / 备份体系 / 主人登录 / 名片签名与 JWKS
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const BASE = "http://127.0.0.1:3100";
// 管理员令牌：优先读 server/.env（本地实际配置），避免硬编码失效
const ADMIN = (() => {
  try {
    const env = fs.readFileSync("D:/文件资料/agent-hub/server/.env", "utf8");
    const m = env.match(/^ADMIN_TOKEN=["']?([^"'\r\n]+)["']?$/m);
    return m ? m[1] : "";
  } catch {
    return "";
  }
})();
const rnd = (n = 4) => crypto.randomBytes(n).toString("hex");
const results = [];
const ok = (n, extra = "") => { results.push(true); console.log(`✅ ${n}${extra ? " · " + extra : ""}`); };
const bad = (n, extra = "") => { results.push(false); console.log(`❌ ${n} ${extra}`); };

async function api(method, path, body, auth, extraHeaders = {}) {
  const raw = body === undefined ? "" : JSON.stringify(body);
  const ts = Date.now().toString();
  const headers = { "Content-Type": "application/json", ...extraHeaders };
  if (auth) {
    headers["X-Agent"] = auth.slug;
    headers["X-Timestamp"] = ts;
    headers["X-Signature"] = crypto.createHmac("sha256", auth.secret).update(`${ts}.${raw}`, "utf8").digest("hex");
  }
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : raw });
  let j = {}; try { j = await res.json(); } catch {}
  return { status: res.status, body: j, data: j.data, ok: j.ok };
}

(async () => {
  console.log("──────── AgentNexus 端到端冒烟（本地 3100）────────\n");

  // 1. 注册一体化（账号 + Agent + 密钥）
  const email = `e2e-${rnd()}@test.com`;
  const reg = await api("POST", "/api/auth/register-with-agent", {
    name: "端到端验证", org: "AgentNexus", email, password: "password123",
    agent: { name: "E2E 验证助理", role: "端到端链路验证", industry: "企业服务" },
  });
  const owner = reg.data?.agent?.slug && { slug: reg.data.agent.slug, secret: reg.data.secret };
  reg.ok && owner ? ok("注册一体化（账号+Agent+密钥）", `slug=${owner.slug}`) : bad("注册一体化", JSON.stringify(reg.body).slice(0, 120));
  const ownerToken = reg.data?.token;

  // 2. 唯一性：同邮箱重复注册 → 409
  const dup = await api("POST", "/api/auth/register-with-agent", {
    name: "重复", org: "x", email, password: "password123",
    agent: { name: "重复助理", role: "应被拒绝" },
  });
  dup.status === 409 ? ok("同邮箱重复注册被拒（409 唯一约束）") : bad("唯一性", `status=${dup.status}`);

  // 3. 主人登录 + me
  const login = await api("POST", "/api/auth/login", { email, password: "password123" });
  const me = await api("GET", "/api/auth/me", undefined, null, { "X-Owner-Token": login.data?.token || ownerToken || "" });
  login.ok && me.ok ? ok("主人登录 + /api/auth/me", `name=${me.data?.name}`) : bad("主人登录", JSON.stringify(login.body).slice(0, 120));

  // 4. 广场检索
  const square = await api("GET", "/api/agents?page=1");
  const total = square.data?.total ?? square.data?.items?.length ?? 0;
  square.ok && total > 0 ? ok("广场列表", `${total} 个 Agent`) : bad("广场列表");

  // 5. 技能/标签检索
  const searched = await api("GET", "/api/agents?q=" + encodeURIComponent("助理"));
  searched.ok ? ok("广场关键词检索", `${searched.data?.items?.length ?? 0} 条命中`) : bad("关键词检索");

  // 6. 对接（取一个已有的示范 Agent 作为对方）
  const peerSlug = (square.data?.items || []).find((a) => a.slug !== owner.slug)?.slug;
  const conn = await api("POST", "/api/connections", { fromAgent: owner.slug, toAgent: peerSlug }, owner);
  const conns = await api("GET", "/api/connections", undefined, owner);
  conn.ok && (conns.data?.items || []).some((c) => c.peer.slug === peerSlug)
    ? ok("加联系人（签名对接）", `peer=${peerSlug}`)
    : bad("加联系人", JSON.stringify(conn.body).slice(0, 120));

  // 7. 单聊 + 自动应答
  await api("PATCH", `/api/assistants/${owner.slug}`, {
    profile: {
      capabilities: { secretary: true, sales: true, ticket: true },
      faq: [{ keywords: ["保修", "质保"], answer: "整机保修 12 个月。" }, { keywords: ["发货"], answer: "48 小时内发货。" }],
      products: [{ name: "E2E 产品", keywords: ["产品"], pitch: "验证", priceRange: "面议", followup: "需要资料吗？" }],
      secretary: {}, ticket: {}, escalate: {}, fallback: "已转人工。", integrations: {},
    },
  }, owner);

  const reg2 = await api("POST", "/api/agents", {
    name: "提问方", slug: `asker-${rnd(2)}`, role: "端到端提问", autoAccept: true,
    owner: { name: "tester", org: "AgentNexus" },
  });
  const asker = { slug: reg2.data.slug, secret: reg2.data.secret };
  await api("POST", "/api/connections", { fromAgent: asker.slug, toAgent: owner.slug }, asker);
  const msg = await api("POST", "/api/messages", { fromAgent: asker.slug, toAgent: owner.slug, text: "你们保修多久？", type: "chat" }, asker);
  const bot = msg.data?.bot?.text || "";
  bot.includes("12 个月") ? ok("单聊 + 助理自动应答命中知识库", `回复：${bot}`) : bad("自动应答", `bot=${bot}`);

  const history = await api("GET", `/api/messages?peer=${asker.slug}&limit=20`, undefined, owner);
  (history.data?.messages || []).length >= 2 ? ok("消息历史可读", `${history.data.messages.length} 条`) : bad("消息历史");

  // 8. 建群 + 群消息 + @分派任务 + 状态流转
  const group = await api("POST", "/api/groups", { name: "E2E 协作群", memberSlugs: [asker.slug] }, owner);
  const gid = group.data?.id;
  group.ok && gid ? ok("建群", `id=${gid}`) : bad("建群", JSON.stringify(group.body).slice(0, 120));

  await api("POST", `/api/groups/${gid}/messages`, { text: "大家好，项目启动" }, owner);
  const taskMsg = await api("POST", `/api/groups/${gid}/messages`, { text: `@${asker.slug} 任务：整理 E2E 报告` }, owner);
  const tasks = await api("GET", `/api/groups/${gid}/tasks`, undefined, owner);
  const t = (tasks.data?.tasks || [])[0];
  t ? ok("群内 @分派任务", `${t.taskCode} → ${t.assigneeSlug}`) : bad("任务分派", JSON.stringify(taskMsg.body).slice(0, 140));

  if (t) {
    const flow = await api("PATCH", `/api/groups/${gid}/tasks/${t.id}`, { status: "done" }, owner);
    flow.data?.status === "done" ? ok("任务状态机流转", `${t.taskCode} → done`) : bad("状态流转", JSON.stringify(flow.body).slice(0, 120));
  }

  // 9. 动态发布 + 点赞
  const moment = await api("POST", "/api/moments", { text: "E2E 验证：能力上新" }, owner);
  const feed = await api("GET", "/api/moments?limit=10");
  const like = moment.data?.id ? await api("POST", `/api/moments/${moment.data.id}/like`, {}, asker) : { ok: false };
  moment.ok && like.data?.likeCount >= 1 && (feed.data?.items || []).length > 0
    ? ok("动态发布 + 点赞", `likes=${like.data?.likeCount}`)
    : bad("动态链路", JSON.stringify({ m: moment.body, l: like.body }).slice(0, 160));

  // 10. 公开助手视图（知识库回读）
  const view = await api("GET", `/api/assistants/${owner.slug}`);
  const faq = view.data?.profile?.faq || [];
  faq.length === 2 && (view.data?.profile?.products || []).length === 1
    ? ok("助理知识库公开回读", `faq=${faq.length} products=1`)
    : bad("知识库回读", JSON.stringify(view.body).slice(0, 140));

  // 11. 名片：Agent Card JSON（裸 JSON + 签名）+ HTML 名片页 + JWKS（RFC 7517 裸 JSON）
  const card = await fetch(`${BASE}/api/agents/${owner.slug}/agent-card.json`);
  const html = await fetch(`${BASE}/card/${owner.slug}`);
  const jwks = await fetch(`${BASE}/.well-known/jwks.json`);
  const cardJ = await card.json(); const jwksJ = await jwks.json();
  const htmlText = await html.text();
  const cardIsBare = !("ok" in cardJ) && !!cardJ.signature; // 标准端点应为裸 JSON 且含签名
  const jwksIsBare = Array.isArray(jwksJ.keys);
  cardIsBare && jwksIsBare && /<!doctype/i.test(htmlText) && htmlText.includes("</html>")
    ? ok("Agent Card（裸 JSON + 签名）+ 名片页 + JWKS（裸 JSON）", `kid=${cardJ.signature?.kid ?? cardJ.signature?.keyId ?? "n/a"} keys=${jwksJ.keys.length}`)
    : bad("名片签名/JWKS", `card=${card.status} bare=${cardIsBare} jwks=${jwks.status} bareKeys=${jwksIsBare}`);

  // 12. 备份体系（管理端点 + 快照落盘）
  const snap = await api("POST", "/api/admin/backup/snapshot", {}, null, { "X-Admin-Token": ADMIN });
  const bk = await api("GET", "/api/admin/backup", undefined, null, { "X-Admin-Token": ADMIN });
  snap.ok && bk.ok && Object.keys(bk.data?.counts || {}).length >= 15
    ? ok("备份：快照落盘 + 导出端点", `${Object.keys(bk.data.counts).length} 张表`)
    : bad("备份体系", JSON.stringify({ s: snap.body, b: bk.body }).slice(0, 140));

  const pass = results.filter(Boolean).length;
  console.log(`\n──────── 冒烟结果：${pass}/${results.length} 通过 ────────`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("冒烟脚本异常：", e.message); process.exit(1); });
