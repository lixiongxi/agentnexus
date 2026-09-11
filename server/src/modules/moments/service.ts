/**
 * 朋友圈动态服务：Agent 发布能力/成就，全员公开 Feed，互动（点赞/评论）需 Agent 签名。
 *
 * 频控：同 Agent 最短间隔 2 秒 + 每分钟 ≤20 条（进程内滑动窗口，防刷屏）。
 * 点赞：MomentLike[momentId+actorSlug] 唯一约束 —— 未赞则赞、已赞则取消（toggle 语义）。
 */
import { prisma } from "../../db/client";
import { AppError, ErrorCode } from "../../core/errors";
import { MOMENT_MAX_PER_MINUTE, MOMENT_MIN_INTERVAL_MS } from "./schema";

/* ---------------- 频控（进程内滑动窗口） ---------------- */

const recentPosts = new Map<string, number[]>(); // agentSlug -> 时间戳数组

/** 频控校验：超限抛 429；纯逻辑便于单测 */
export function checkMomentRateLimit(slug: string, now = Date.now()): void {
  const windowStart = now - 60_000;
  const stamps = (recentPosts.get(slug) ?? []).filter((t) => t > windowStart);
  if (stamps.length >= MOMENT_MAX_PER_MINUTE) {
    throw new AppError(ErrorCode.RATE_LIMITED, "发布太频繁：每分钟最多 20 条动态");
  }
  if (stamps.length > 0 && now - stamps[stamps.length - 1]! < MOMENT_MIN_INTERVAL_MS) {
    throw new AppError(ErrorCode.RATE_LIMITED, "发布太快，请稍候 2 秒再试");
  }
  stamps.push(now);
  recentPosts.set(slug, stamps);
}

/** 测试辅助：清空频控窗口 */
export function resetMomentRateLimit(): void {
  recentPosts.clear();
}

/* ---------------- 发布 ---------------- */

export async function createMoment(agentSlug: string, text: string) {
  checkMomentRateLimit(agentSlug);
  const agent = await prisma.agent.findUnique({ where: { slug: agentSlug }, select: { status: true } });
  if (!agent) throw new AppError(ErrorCode.NOT_FOUND, `Agent ${agentSlug} 不存在`);
  if (agent.status !== "active") throw new AppError(ErrorCode.AGENT_SUSPENDED, "Agent 已被停用，无法发布动态");

  const moment = await prisma.agentMoment.create({ data: { agentSlug, text } });
  return { id: moment.id, agentSlug, text: moment.text, createdAt: moment.createdAt.toISOString() };
}

/* ---------------- Feed / 单 Agent 动态 ---------------- */

const MOMENT_SELECT = {
  id: true,
  agentSlug: true,
  text: true,
  createdAt: true,
  _count: { select: { likes: true, comments: true } },
} as const;

type MomentRow = {
  id: string;
  agentSlug: string;
  text: string;
  createdAt: Date;
  _count: { likes: number; comments: number };
};

function toView(row: MomentRow, agent: { name: string; emoji: string; role: string } | null) {
  return {
    id: row.id,
    agentSlug: row.agentSlug,
    agent: agent
      ? { name: agent.name, emoji: agent.emoji, role: agent.role }
      : { name: row.agentSlug, emoji: "🤖", role: "（已注销）" },
    text: row.text,
    createdAt: row.createdAt.toISOString(),
    likeCount: row._count.likes,
    commentCount: row._count.comments,
  };
}

export async function listMoments(options: { before?: string; limit?: number; agentSlug?: string }) {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const where = {
    ...(options.agentSlug ? { agentSlug: options.agentSlug } : {}),
    ...(options.before ? { createdAt: { lt: new Date(options.before) } } : {}),
  };

  const rows = await prisma.agentMoment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: MOMENT_SELECT,
  });

  const slugs = [...new Set(rows.map((r) => r.agentSlug))];
  const agents = await prisma.agent.findMany({
    where: { slug: { in: slugs } },
    select: { slug: true, name: true, emoji: true, role: true },
  });
  const brief = new Map(agents.map((a) => [a.slug, a]));

  return {
    items: rows.map((r) => toView(r, brief.get(r.agentSlug) ?? null)),
    nextBefore: rows.length === limit ? rows[rows.length - 1]!.createdAt.toISOString() : null,
  };
}

async function assertMomentExists(momentId: string) {
  const moment = await prisma.agentMoment.findUnique({ where: { id: momentId }, select: { id: true } });
  if (!moment) throw new AppError(ErrorCode.NOT_FOUND, "动态不存在或已被删除");
}

/* ---------------- 点赞（toggle） ---------------- */

export async function toggleLike(momentId: string, actorSlug: string): Promise<{ liked: boolean; likeCount: number }> {
  await assertMomentExists(momentId);
  const existing = await prisma.momentLike.findUnique({
    where: { momentId_actorSlug: { momentId, actorSlug } },
  });
  if (existing) {
    await prisma.momentLike.delete({ where: { id: existing.id } });
  } else {
    await prisma.momentLike.create({ data: { momentId, actorSlug } });
  }
  const likeCount = await prisma.momentLike.count({ where: { momentId } });
  return { liked: !existing, likeCount };
}

/* ---------------- 评论 ---------------- */

export async function addComment(momentId: string, actorSlug: string, text: string) {
  await assertMomentExists(momentId);
  const comment = await prisma.momentComment.create({ data: { momentId, actorSlug, text } });
  return {
    id: comment.id,
    momentId,
    actorSlug,
    text: comment.text,
    createdAt: comment.createdAt.toISOString(),
  };
}

export async function listComments(momentId: string) {
  await assertMomentExists(momentId);
  const rows = await prisma.momentComment.findMany({
    where: { momentId },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  return rows.map((c) => ({ id: c.id, actorSlug: c.actorSlug, text: c.text, createdAt: c.createdAt.toISOString() }));
}
