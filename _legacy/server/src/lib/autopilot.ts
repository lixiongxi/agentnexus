import { prisma } from "../db.js";

/**
 * 自主巡航（Autopilot）引擎
 * 无人值守时：扫描广场 → 行业/能力匹配度评分 → 自动对接 → 自动打招呼
 */

export interface AutopilotSettings {
  enabled: boolean;
  minScore: number;        // 匹配度阈值（0-100）
  autoGreet: boolean;      // 对接成功后自动发第一条消息
  industries: string[];    // 关注行业（空=不限）
  tags: string[];          // 关注能力标签（空=不限）
}

export const DEFAULT_SETTINGS: AutopilotSettings = {
  enabled: true,
  minScore: 60,
  autoGreet: true,
  industries: [],
  tags: []
};

const SETTINGS_KEY = "autopilot";

let settingsCache: AutopilotSettings = { ...DEFAULT_SETTINGS };
export function setSettings(s: Partial<AutopilotSettings>) { settingsCache = { ...settingsCache, ...s }; }
export function getSettings(): AutopilotSettings { return { ...settingsCache }; }

/** 种子生态 Agent（定时巡航跳过，避免刷屏；只巡航用户注册的 Agent） */
export const SEED_SLUGS = ["xiaotuo","xiaocai","fawuguan","xiaomei","xuanpinxia","zengzhangguan","hr-agent","gylgj","yuqingshaobing","shujuzhentan"];

function parseTags(agent: any): string[] {
  try { return JSON.parse(agent.tags || "[]"); } catch { return []; }
}

/** 行业/能力匹配度评分（0-100） */
export function scoreMatch(me: any, peer: any): { score: number; reason: string } {
  const myTags = parseTags(me);
  const peerTags = parseTags(peer);

  // 标签重合度（权重 0.45）
  const overlap = myTags.filter(t => peerTags.includes(t));
  const tagScore = myTags.length ? (overlap.length / Math.max(1, Math.min(myTags.length, peerTags.length || 1))) : 0;

  // 行业互补（权重 0.25）：同行业最高；同"族"次之（企业服务/专业服务 互认）
  let indScore = 0;
  if (me.industry === peer.industry) indScore = 1;
  else {
    const family = (s: string) => (s.includes("企业") || s.includes("专业") || s.includes("金融")) ? "service" : s;
    if (family(me.industry) === family(peer.industry)) indScore = 0.7;
    else indScore = 0.35;
  }

  // 在线（0.2）
  const onlineScore = peer.online ? 1 : 0;

  // 自动接受策略（0.1）
  const acceptScore = peer.autoAccept ? 1 : 0;

  const score = Math.round((tagScore * 45 + indScore * 25 + onlineScore * 20 + acceptScore * 10));
  const parts = [];
  if (overlap.length) parts.push(`共同标签:${overlap.join("、")}`);
  parts.push(`行业:${me.industry}×${peer.industry}`);
  parts.push(peer.online ? "在线" : "离线");
  parts.push(peer.autoAccept ? "自动接受" : "需人工确认");
  return { score, reason: parts.join(" · ") };
}

/** 执行一次巡航：返回本次处理结果列表 */
export async function runAutopilot(fromSlug: string): Promise<{ total: number; created: number; logs: any[] }> {
  const s = getSettings();
  const me = await prisma.agent.findUnique({ where: { slug: fromSlug }, include: { owner: true } });
  if (!me) throw new Error(`Agent ${fromSlug} 不存在`);

  const peers = await prisma.agent.findMany({ where: { slug: { not: fromSlug } } });
  const existing = await prisma.connection.findMany({
    where: { OR: [{ fromAgent: fromSlug }, { toAgent: fromSlug }] }
  });
  const connected = new Set<string>();
  existing.forEach(c => { connected.add(c.fromAgent); connected.add(c.toAgent); });

  let created = 0;
  const logs: any[] = [];

  // 审核白名单：未通过平台认证的 Agent 不参与自动对接（安全底线）
  const unverified = peers.filter(p => !p.verified);
  unverified.forEach(p => {
    logs.push({ toAgent: p.slug, score: 0, reason: "未通过平台认证（审核白名单）", result: "skip_low_score", detail: "verified=false" });
  });
  const candidates = peers
    .filter(p => p.verified)
    .map(p => {
      const { score, reason } = scoreMatch(me, p);
      return { peer: p, score, reason };
    })
    .sort((a, b) => b.score - a.score);

  for (const c of candidates) {
    const { peer, score, reason } = c;
    // 已对接
    if (connected.has(peer.slug)) {
      logs.push({ toAgent: peer.slug, score, reason, result: "already", detail: "已对接" });
      continue;
    }
    // 分数不达标
    if (score < s.minScore) {
      logs.push({ toAgent: peer.slug, score, reason, result: "skip_low_score", detail: `分数 ${score} < 阈值 ${s.minScore}` });
      continue;
    }
    // 行业/标签关注过滤
    if (s.industries.length && !s.industries.includes(peer.industry)) continue;
    if (s.tags.length && !s.tags.some(t => parseTags(peer).includes(t))) continue;

    // 自动对接
    try {
      await prisma.connection.create({ data: { fromAgent: fromSlug, toAgent: peer.slug, status: "active" } });
      connected.add(peer.slug);
      created++;
      // 自动打招呼 → 触发对方 bot 应答，形成自动闭环
      if (s.autoGreet) {
        const ownerName = (me.owner as any)?.name || "";
        const greet = `你好！我是 ${me.name}（${ownerName} 的 Agent），专注${me.industry}领域。检测到我们在能力上有交集（${reason.split(" · ")[0] || "行业相关"}），希望建立协作，随时交流！`;
        await prisma.message.create({
          data: { fromAgent: fromSlug, toAgent: peer.slug, text: greet, type: "autopilot" }
        });
      }
      logs.push({ toAgent: peer.slug, score, reason, result: "created", detail: s.autoGreet ? "已对接并自动打招呼" : "已对接" });
    } catch (e: any) {
      logs.push({ toAgent: peer.slug, score, reason, result: "error", detail: String(e?.message || e).slice(0, 120) });
    }
  }

  // 落库日志：仅持久化有意义的事件（真实对接 / 异常），
  // 避免每次巡航把「已对接 / 未达标 / 未认证」等例行结果刷进库（曾导致日志表爆炸式膨胀）。
  const persistable = logs.filter(l => l.result === "created" || l.result === "error");
  if (persistable.length) {
    await prisma.autopilotLog.createMany({
      data: persistable.map(l => ({
        fromAgent: fromSlug, toAgent: l.toAgent, score: l.score,
        reason: l.reason, result: l.result, detail: l.detail
      }))
    });
  }

  // 自动清理：每个 Agent 仅保留最近 N 条日志，防止无限增长
  await pruneAutopilotLogs();

  return { total: candidates.length, created, logs };
}

/**
 * 自主巡航日志保留策略：每个 Agent 仅保留最近 maxPerAgent 条（默认 300），
 * 超出部分按时间升序删除最旧的。避免 AutopilotLog 无限膨胀拖慢查询与备份。
 */
export async function pruneAutopilotLogs(maxPerAgent = 300): Promise<number> {
  let deleted = 0;
  const groups = await prisma.autopilotLog.groupBy({ by: ["fromAgent"], _count: { _all: true } });
  for (const g of groups) {
    if (g._count._all <= maxPerAgent) continue;
    const excess = g._count._all - maxPerAgent;
    const old = await prisma.autopilotLog.findMany({
      where: { fromAgent: g.fromAgent },
      orderBy: { createdAt: "asc" },
      take: excess,
      select: { id: true }
    });
    if (old.length) {
      await prisma.autopilotLog.deleteMany({ where: { id: { in: old.map(o => o.id) } } });
      deleted += old.length;
    }
  }
  return deleted;
}

/**
 * 清理历史噪声日志：删除 result 为 skip_low_score / already 的记录
 * （这些为每次巡航的例行结果，修复前曾被全部落库导致日志表膨胀）。
 * 仅保留有业务价值的 created（真实对接）/ error（异常）记录。
 */
export async function purgeNoiseAutopilotLogs(): Promise<number> {
  const res = await prisma.autopilotLog.deleteMany({
    where: { result: { in: ["skip_low_score", "already"] } }
  });
  return res.count;
}
