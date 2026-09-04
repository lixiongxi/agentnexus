/**
 * 自主巡航（Autopilot）：无人值守时扫描广场 → 匹配度评分 → 自动对接 → 自动打招呼。
 *
 * 相对 v1 的关键修正：
 *  1. 巡航设置按 Agent 持久化到 AgentSetting 表。v1 用模块级全局单例变量，
 *     多 Agent 场景下后一个的设置会覆盖前一个，且进程重启即丢失。
 *  2. 只持久化有意义事件（created / error）。v1 曾把每次巡航的
 *     skip_low_score / already 全部落库，导致日志表爆炸式增长（数千条），
 *     事后只能靠额外的清理脚本补救。本版从源头就不写入噪声。
 */
import { prisma } from "../../db/client";
import { config } from "../../core/config";
import { AppError, ErrorCode } from "../../core/errors";
import { parseJsonArray } from "../../lib/json";
import { conversationIdOf, normalizePair } from "../connections/service";
import { publish } from "../../core/bus";
import type {
  AutopilotLogView,
  AutopilotRunResult,
  AutopilotSettingInput,
  AutopilotSettingView,
} from "./schema";

/* ---------------------- 设置（按 Agent 隔离） ---------------------- */

export async function getSetting(agentSlug: string): Promise<AutopilotSettingView> {
  await assertAgentExists(agentSlug);

  let row = await prisma.agentSetting.findUnique({ where: { agentSlug } });
  if (!row) {
    row = await prisma.agentSetting.create({ data: { agentSlug } });
  }
  return {
    enabled: row.enabled,
    minScore: row.minScore,
    autoGreet: row.autoGreet,
    industries: parseJsonArray(row.industries),
    tags: parseJsonArray(row.tags),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function updateSetting(
  agentSlug: string,
  input: AutopilotSettingInput,
): Promise<AutopilotSettingView> {
  await assertAgentExists(agentSlug);

  const current = await getSetting(agentSlug);
  const next = {
    enabled: input.enabled ?? current.enabled,
    minScore: input.minScore ?? current.minScore,
    autoGreet: input.autoGreet ?? current.autoGreet,
    industries: JSON.stringify(input.industries ?? current.industries),
    tags: JSON.stringify(input.tags ?? current.tags),
  };

  await prisma.agentSetting.upsert({
    where: { agentSlug },
    create: { agentSlug, ...next },
    update: next,
  });

  return getSetting(agentSlug);
}

async function assertAgentExists(slug: string): Promise<void> {
  const exists = await prisma.agent.findUnique({ where: { slug }, select: { id: true } });
  if (!exists) throw new AppError(ErrorCode.NOT_FOUND, `Agent ${slug} 不存在`);
}

/* ---------------------- 匹配度评分 ---------------------- */

export interface ScoreResult {
  score: number;
  reason: string;
}

/**
 * 匹配度评分（0-100）：
 *   标签重合度 45% + 行业契合 25% + 在线 20% + 自动接受 10%
 */
export function scoreMatch(
  me: { industry: string; tags: { tagName: string }[] },
  peer: { industry: string; online: boolean; autoAccept: boolean; tags: { tagName: string }[] },
): ScoreResult {
  const myTags = me.tags.map((t) => t.tagName);
  const peerTags = peer.tags.map((t) => t.tagName);

  // 标签重合度：以双方标签数的较小值为分母，避免单方标签过多稀释分数
  const overlap = myTags.filter((t) => peerTags.includes(t));
  const denominator = Math.max(1, Math.min(myTags.length, peerTags.length || 1));
  const tagScore = myTags.length ? overlap.length / denominator : 0;

  // 行业契合：同行业最高，同族次之，跨行业最低
  let industryScore = 0.35;
  if (me.industry === peer.industry) {
    industryScore = 1;
  } else {
    const family = (s: string) =>
      s.includes("企业") || s.includes("专业") || s.includes("金融") ? "service" : s;
    if (family(me.industry) === family(peer.industry)) industryScore = 0.7;
  }

  const onlineScore = peer.online ? 1 : 0;
  const acceptScore = peer.autoAccept ? 1 : 0;

  const score = Math.round(tagScore * 45 + industryScore * 25 + onlineScore * 20 + acceptScore * 10);

  const parts: string[] = [];
  if (overlap.length > 0) parts.push(`共同标签:${overlap.join("、")}`);
  parts.push(`行业:${me.industry}×${peer.industry}`);
  parts.push(peer.online ? "在线" : "离线");
  parts.push(peer.autoAccept ? "自动接受" : "需人工确认");

  return { score, reason: parts.join(" · ") };
}

/* ---------------------- 执行一次巡航 ---------------------- */

export async function runAutopilot(agentSlug: string): Promise<AutopilotRunResult> {
  const setting = await getSetting(agentSlug);
  if (!setting.enabled) {
    return { scanned: 0, created: 0, greeted: 0, details: [] };
  }

  const me = await prisma.agent.findUnique({
    where: { slug: agentSlug },
    include: { tags: true, owner: true },
  });
  if (!me) throw new AppError(ErrorCode.NOT_FOUND, `Agent ${agentSlug} 不存在`);
  if (me.status !== "active") throw new AppError(ErrorCode.AGENT_SUSPENDED, "Agent 已被停用");

  const [peers, connections] = await Promise.all([
    prisma.agent.findMany({
      where: { slug: { not: agentSlug }, status: "active" },
      include: { tags: true },
    }),
    prisma.connection.findMany({
      where: { OR: [{ aSlug: agentSlug }, { bSlug: agentSlug }] },
      select: { aSlug: true, bSlug: true, status: true },
    }),
  ]);

  const connected = new Set<string>();
  for (const c of connections) {
    if (c.status === "rejected") continue;
    connected.add(c.aSlug === agentSlug ? c.bSlug : c.aSlug);
  }

  const details: AutopilotRunResult["details"] = [];
  let created = 0;
  let greeted = 0;

  for (const peer of peers) {
    // 安全底线：未通过平台认证的不参与自动对接
    if (!peer.verified) continue;
    if (connected.has(peer.slug)) continue;

    const { score, reason } = scoreMatch(me, peer);
    if (score < setting.minScore) continue;

    // 关注范围过滤
    if (setting.industries.length > 0 && !setting.industries.includes(peer.industry)) continue;
    const peerTags = peer.tags.map((t) => t.tagName);
    if (setting.tags.length > 0 && !setting.tags.some((t) => peerTags.includes(t))) continue;

    try {
      const { aSlug, bSlug } = normalizePair(agentSlug, peer.slug);
      await prisma.connection.upsert({
        where: { aSlug_bSlug: { aSlug, bSlug } },
        create: { aSlug, bSlug, initiator: agentSlug, status: "accepted" },
        update: { status: "accepted" },
      });
      connected.add(peer.slug);
      created++;

      if (setting.autoGreet) {
        const ownerName = me.owner?.name ?? "";
        const greet =
          `你好！我是 ${me.name}${ownerName ? `（${ownerName} 的 Agent）` : ""}，` +
          `专注${me.industry}领域。检测到我们在能力上有交集（${reason.split(" · ")[0] ?? "行业相关"}），` +
          `希望建立协作，随时交流！`;

        const msg = await prisma.message.create({
          data: {
            conversationId: conversationIdOf(agentSlug, peer.slug),
            fromAgent: agentSlug,
            toAgent: peer.slug,
            text: greet,
            type: "autopilot",
          },
        });
        publish({
          type: "message",
          payload: {
            id: msg.id,
            conversationId: msg.conversationId,
            fromAgent: msg.fromAgent,
            toAgent: msg.toAgent,
            text: msg.text,
            type: msg.type,
            createdAt: msg.createdAt.toISOString(),
          },
        });
        greeted++;
      }

      details.push({ toAgent: peer.slug, score, reason, result: "created" });
    } catch (err: unknown) {
      details.push({
        toAgent: peer.slug,
        score,
        reason,
        result: `error:${err instanceof Error ? err.message.slice(0, 80) : "unknown"}`,
      });
    }
  }

  // 仅落库有意义事件，从源头避免日志膨胀
  const persistable = details.filter((d) => d.result === "created" || d.result.startsWith("error"));
  if (persistable.length > 0) {
    await prisma.autopilotLog.createMany({
      data: persistable.map((d) => {
        const isError = d.result.startsWith("error");
        return {
          fromAgent: agentSlug,
          toAgent: d.toAgent,
          score: d.score,
          reason: d.reason,
          result: isError ? "error" : "created",
          detail: isError ? d.result.slice(6) : "已自动对接",
        };
      }),
    });
  }

  return { scanned: peers.length, created, greeted, details };
}

/* ---------------------- 日志 ---------------------- */

export async function listLogs(agentSlug: string, limit = 30): Promise<AutopilotLogView[]> {
  const rows = await prisma.autopilotLog.findMany({
    where: { fromAgent: agentSlug },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
  });
  return rows.map((r) => ({
    id: r.id,
    toAgent: r.toAgent,
    score: r.score,
    reason: r.reason,
    result: r.result,
    detail: r.detail,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** 每个 Agent 仅保留最近 keep 条，超出按时间升序清理 */
export async function pruneLogs(keep = config.autopilot.logKeep): Promise<number> {
  let deleted = 0;
  const groups = await prisma.autopilotLog.groupBy({ by: ["fromAgent"], _count: { _all: true } });

  for (const g of groups) {
    if (g._count._all <= keep) continue;
    const excess = g._count._all - keep;
    const old = await prisma.autopilotLog.findMany({
      where: { fromAgent: g.fromAgent },
      orderBy: { createdAt: "asc" },
      take: excess,
      select: { id: true },
    });
    if (old.length > 0) {
      const res = await prisma.autopilotLog.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
      deleted += res.count;
    }
  }
  return deleted;
}

/** 待巡航的用户 Agent（排除种子示范 Agent） */
export async function listCruiseTargets(seedSlugs: string[]): Promise<string[]> {
  const rows = await prisma.agent.findMany({
    where: { slug: { notIn: seedSlugs }, status: "active" },
    select: { slug: true },
  });
  return rows.map((r) => r.slug);
}
