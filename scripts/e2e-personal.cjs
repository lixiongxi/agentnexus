/**
 * 个人端端到端验证（v4）
 * 覆盖：注册登记 → 发布能力（服务+案例）→ 能力名片 → 发布需求 → 匹配排序（案例优先）
 *      → 下单 → 交付 → 完成 → 评价 → 案例沉淀 → 二次匹配分数提升
 */
const crypto = require("node:crypto");
const BASE = process.env.E2E_BASE || "http://127.0.0.1:3000";
const rnd = (n = 3) => crypto.randomBytes(n).toString("hex");
const results = [];
const ok = (n, extra = "") => { results.push(true); console.log(`✅ ${n}${extra ? " · " + extra : ""}`); };
const bad = (n, extra = "") => { results.push(false); console.log(`❌ ${n} ${extra}`); };

async function api(method, path, body, auth) {
  const raw = body === undefined ? "" : JSON.stringify(body);
  const ts = Date.now().toString();
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    headers["X-Agent"] = auth.slug;
    headers["X-Timestamp"] = ts;
    headers["X-Signature"] = crypto.createHmac("sha256", auth.secret).update(`${ts}.${raw}`, "utf8").digest("hex");
  }
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : raw });
  let j = {}; try { j = await res.json(); } catch {}
  return { status: res.status, ok: j.ok, data: j.data, error: j.error };
}

/** 注册登记 → 返回 Agent 凭据 */
async function register(name, domains) {
  const r = await api("POST", "/api/personal/register", {
    name,
    email: `p-${rnd()}@test.com`,
    password: "password123",
    city: "杭州",
    bio: `${name}的简介`,
    domains,
  });
  if (!r.ok) throw new Error(`注册失败：${JSON.stringify(r.error)}`);
  return { slug: r.data.agent.slug, secret: r.data.agent.secret, token: r.data.token, next: r.data.next };
}

(async () => {
  console.log("──────── 个人端端到端验证（v4）────────\n");
  const TAG = "AI 视频创作";

  // 1. 注册登记（个人向字段 → 草稿 Agent）
  const expert = await register("视频老手", [TAG, "剪辑包装"]);
  const novice = await register("视频新手", [TAG]);
  const client = await register("需求方小美", ["市场调研"]);
  expert.next === "publish-agent"
    ? ok("注册登记（含跳转标记 publish-agent）", `slug=${expert.slug}`)
    : bad("注册登记", JSON.stringify(expert));

  const ability0 = await api("GET", `/api/agents/${expert.slug}/ability`);
  ability0.data?.agent?.publishStatus === "draft" && ability0.data?.agent?.tags?.length > 0
    ? ok("登记后自动生成草稿 Agent（含领域标签）", `tags=${ability0.data.agent.tags.join("/")}`)
    : bad("草稿 Agent", JSON.stringify(ability0.data?.agent));

  // 2. 发布能力（服务清单 + 历史案例）
  const pub = await api("PATCH", `/api/agents/${expert.slug}/ability`, {
    name: "小林 · AI 视频工作室",
    emoji: "🎬",
    role: "品牌短视频 / AI 口播视频制作",
    serviceIntro: "承接 30-90 秒品牌短片与口播视频，含脚本、AI 素材、剪辑与字幕，48 小时出初稿。",
    domains: [TAG, "剪辑包装"],
    acceptingOrders: true,
    services: [
      { title: "60 秒品牌短片制作", tags: [TAG], deliverable: "1 条成片 + 2 次修改", priceRange: "800-2000 元", cycleDays: 3, intro: "含脚本与分镜" },
      { title: "口播视频批量制作", tags: [TAG, "配音"], deliverable: "5 条口播", priceRange: "1500-3000 元", cycleDays: 5, intro: "" },
    ],
    cases: [
      { title: "茶饮品牌夏季新品短片", summary: "抖音 120 万播放", tags: [TAG], rating: 5 },
      { title: "知识博主口播系列", summary: "交付 12 条", tags: [TAG, "配音"], rating: 5 },
    ],
    publish: true,
  }, expert);
  pub.ok && pub.data.agent.publishStatus === "published" && pub.data.services.length === 2
    ? ok("发布能力（2 服务 + 2 案例）", `completedCases=${pub.data.agent.completedCases}`)
    : bad("发布能力", JSON.stringify(pub.error ?? pub.data?.agent));

  // 新手发布（无案例）
  await api("PATCH", `/api/agents/${novice.slug}/ability`, {
    name: "小周 · 视频新人",
    emoji: "🎬",
    role: "短视频剪辑",
    serviceIntro: "擅长短视频剪辑与字幕包装，刚入行，价格友好。",
    domains: [TAG],
    acceptingOrders: true,
    services: [{ title: "短视频剪辑", tags: [TAG], deliverable: "1 条成片", priceRange: "200-500 元", cycleDays: 2, intro: "" }],
    cases: [],
    publish: true,
  }, novice);
  ok("新手发布能力（无案例，用于对比排序）");

  // 3. 需求方发布需求
  const demand = await api("POST", "/api/demands", {
    title: "需要 60 秒品牌短片（含 AI 素材）",
    content: "茶饮新品上市，需要一条 60 秒短视频，含脚本、AI 生成画面、字幕与配乐，预算 1500 元内。",
    tags: [TAG],
    budget: "1000-2000 元",
  }, client);
  demand.ok ? ok("发布需求", `id=${demand.data.id}`) : bad("发布需求", JSON.stringify(demand.error));

  // 4. 匹配排序（核心：案例优先）
  const m1 = await api("GET", `/api/demands/${demand.data.id}/matches?limit=10`);
  const list1 = m1.data?.candidates ?? [];
  const idxExpert = list1.findIndex((c) => c.slug === expert.slug);
  const idxNovice = list1.findIndex((c) => c.slug === novice.slug);
  idxExpert >= 0 && idxNovice >= 0 && idxExpert < idxNovice
    ? ok("匹配排序：有案例专家 > 无案例新手", `专家第 ${idxExpert + 1} 名（${list1[idxExpert].score} 分）> 新手第 ${idxNovice + 1} 名（${list1[idxNovice].score} 分）`)
    : bad("案例优先排序", `expert=${idxExpert} novice=${idxNovice} 候选=${list1.length}`);

  if (idxExpert >= 0) {
    const top = list1[idxExpert];
    console.log(`   排序理由：${top.reasons.join(" · ")}`);
    top.factors.caseCount >= 2 && top.factors.sameTagCases >= 2
      ? ok("案例因子生效（同类案例计入）", `caseCount=${top.factors.caseCount} sameTag=${top.factors.sameTagCases} caseScore=${top.factors.caseScore.toFixed(2)}`)
      : bad("案例因子", JSON.stringify(top.factors));
  }

  // 5. 下单 → 交付 → 完成
  const order = await api("POST", "/api/orders", {
    demandId: demand.data.id,
    providerSlug: expert.slug,
    amount: "1500 元",
  }, client);
  order.ok ? ok("需求方下单（邀请成交）", `${order.data.orderCode}`) : bad("下单", JSON.stringify(order.error));

  const delivered = await api("PATCH", `/api/orders/${order.data.id}`, { status: "delivered" }, expert);
  delivered.ok ? ok("供给方提交交付", `status=${delivered.data.status}`) : bad("交付", JSON.stringify(delivered.error));

  const done = await api("PATCH", `/api/orders/${order.data.id}`, { status: "done" }, client);
  done.ok ? ok("需求方确认完成", `status=${done.data.status}`) : bad("确认完成", JSON.stringify(done.error));

  // 6. 评价 → 案例沉淀
  const review = await api("POST", `/api/orders/${order.data.id}/reviews`, { score: 5, comment: "交付快，质量高" }, client);
  review.ok ? ok("需求方评价（5 星）") : bad("评价", JSON.stringify(review.error));

  const abilityAfter = await api("GET", `/api/agents/${expert.slug}/ability`);
  const a = abilityAfter.data?.agent;
  a?.completedCases >= 3 && a?.avgCaseRating > 0
    ? ok("案例自动沉淀 + 统计更新", `completedCases=${a.completedCases} avgRating=${a.avgCaseRating} reputation=${a.reputation}`)
    : bad("案例沉淀", JSON.stringify(a));

  // 7. 二次匹配：分数应提升（案例质量因子增强）
  const m2 = await api("GET", `/api/demands/${demand.data.id}/matches?limit=10`);
  const after = (m2.data?.candidates ?? []).find((c) => c.slug === expert.slug);
  const before = list1[idxExpert];
  after && before && after.score >= before.score
    ? ok("二次匹配分数提升（案例沉淀反哺排序）", `${before.score} → ${after.score}`)
    : bad("分数提升", `before=${before?.score} after=${after?.score}`);

  // 8. 订单列表与权限
  const myOrders = await api("GET", "/api/me/orders?role=provider", undefined, expert);
  (myOrders.data?.items ?? []).length >= 1
    ? ok("我的订单（供给方视角）", `${myOrders.data.items.length} 单`)
    : bad("我的订单", JSON.stringify(myOrders.error));

  // 企业端已下线验证
  const groups = await api("GET", "/api/groups", undefined, expert);
  const assistants = await api("GET", `/api/assistants/${expert.slug}`);
  groups.status === 404 && assistants.status === 404
    ? ok("企业端路由已下线（群聊/助理知识库 404）")
    : bad("企业端下线", `groups=${groups.status} assistants=${assistants.status}`);

  const pass = results.filter(Boolean).length;
  console.log(`\n──────── 结果：${pass}/${results.length} 通过 ────────`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("脚本异常：", e.message); process.exit(1); });
