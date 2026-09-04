/**
 * 对接关系服务。
 *
 * 关键改进：连接以 (aSlug, bSlug) 字典序规范化存储并加联合唯一约束，
 * v1 允许 A→B 与 B→A 两条记录并存，导致「已对接」判定需要双向 OR 查询、
 * 会话消息也会被拆成两半。本版一次查询即可命中。
 */
import { prisma } from "../../db/client";
import { AppError, ErrorCode } from "../../core/errors";
import { publish } from "../../core/bus";
import { botReply } from "../../lib/bot";
import type { ConnectionView, CreateConnectionInput, LastMessageBrief, PeerBrief } from "./schema";

/** 生成规范化的会话键：字典序较小的在前 */
export function normalizePair(a: string, b: string): { aSlug: string; bSlug: string } {
  return a <= b ? { aSlug: a, bSlug: b } : { aSlug: b, bSlug: a };
}

export function conversationIdOf(a: string, b: string): string {
  const { aSlug, bSlug } = normalizePair(a, b);
  return `${aSlug}:${bSlug}`;
}

/* ---------------------- 建立对接 ---------------------- */

export interface CreateConnectionResult {
  connection: { id: string; aSlug: string; bSlug: string; status: string; createdAt: string };
  created: boolean;
  message: string;
}

export async function createConnection(input: CreateConnectionInput): Promise<CreateConnectionResult> {
  const { fromAgent, toAgent } = input;

  const [from, to] = await Promise.all([
    prisma.agent.findUnique({ where: { slug: fromAgent } }),
    prisma.agent.findUnique({ where: { slug: toAgent } }),
  ]);
  if (!from) throw new AppError(ErrorCode.NOT_FOUND, `发起方 Agent ${fromAgent} 不存在`);
  if (!to) throw new AppError(ErrorCode.NOT_FOUND, `目标 Agent ${toAgent} 不存在`);
  if (from.status !== "active") throw new AppError(ErrorCode.AGENT_SUSPENDED, `发起方 ${fromAgent} 已被停用`);
  if (to.status !== "active") throw new AppError(ErrorCode.AGENT_SUSPENDED, `目标 ${toAgent} 已被停用`);

  const { aSlug, bSlug } = normalizePair(fromAgent, toAgent);

  const existing = await prisma.connection.findUnique({ where: { aSlug_bSlug: { aSlug, bSlug } } });
  if (existing) {
    return {
      connection: {
        id: existing.id,
        aSlug: existing.aSlug,
        bSlug: existing.bSlug,
        status: existing.status,
        createdAt: existing.createdAt.toISOString(),
      },
      created: false,
      message: `${from.name} 与 ${to.name} 已是对接关系`,
    };
  }

  // 目标方策略：autoAccept=false 时进入 pending，需对方确认
  const status = to.autoAccept ? "accepted" : "pending";
  const connection = await prisma.connection.create({
    data: { aSlug, bSlug, initiator: fromAgent, status },
  });

  if (status === "accepted") {
    publish({ type: "presence", payload: { agentSlug: fromAgent, online: from.online } });
  }

  return {
    connection: {
      id: connection.id,
      aSlug: connection.aSlug,
      bSlug: connection.bSlug,
      status: connection.status,
      createdAt: connection.createdAt.toISOString(),
    },
    created: true,
    message:
      status === "accepted"
        ? `${from.name} → ${to.name} 对接建立成功（对方策略：自动接受）`
        : `${from.name} → ${to.name} 请求已发出，等待对方确认`,
  };
}

/* ---------------------- 判定 ---------------------- */

export async function isConnected(a: string, b: string): Promise<boolean> {
  const { aSlug, bSlug } = normalizePair(a, b);
  const conn = await prisma.connection.findFirst({
    where: { aSlug, bSlug, status: "accepted" },
    select: { id: true },
  });
  return conn !== null;
}

/* ---------------------- 列表 ---------------------- */

export async function listConnections(me: string): Promise<ConnectionView[]> {
  const conns = await prisma.connection.findMany({
    where: { OR: [{ aSlug: me }, { bSlug: me }], status: "accepted" },
    orderBy: { createdAt: "desc" },
  });
  if (conns.length === 0) return [];

  const peerSlugs = conns.map((c) => (c.aSlug === me ? c.bSlug : c.aSlug));
  const conversationIds = conns.map((c) => `${c.aSlug}:${c.bSlug}`);

  const [peers, unreadGroups] = await Promise.all([
    prisma.agent.findMany({
      where: { slug: { in: peerSlugs } },
      include: { tags: true },
    }),
    prisma.message.groupBy({
      by: ["conversationId"],
      where: { conversationId: { in: conversationIds }, toAgent: me, readAt: null },
      _count: { _all: true },
    }),
  ]);

  const peerMap = new Map(peers.map((p) => [p.slug, p]));
  const unreadMap = new Map(unreadGroups.map((g) => [g.conversationId, g._count._all]));

  // 取每个会话的最后一条消息：连接数通常有限，且 conversationId 已建索引，
  // 此处以 N 次索引查询换取代码清晰度（N = 该 Agent 的连接数）。
  const views: ConnectionView[] = await Promise.all(
    conns.map(async (c) => {
      const peerSlug = c.aSlug === me ? c.bSlug : c.aSlug;
      const peer = peerMap.get(peerSlug);
      const conversationId = `${c.aSlug}:${c.bSlug}`;

      const last = await prisma.message.findFirst({
        where: { conversationId },
        orderBy: { createdAt: "desc" },
      });

      const lastBrief: LastMessageBrief | null = last
        ? {
            id: last.id,
            fromAgent: last.fromAgent,
            toAgent: last.toAgent,
            text: last.text,
            type: last.type,
            createdAt: last.createdAt.toISOString(),
          }
        : null;

      const peerBrief: PeerBrief = peer
        ? {
            slug: peer.slug,
            name: peer.name,
            emoji: peer.emoji,
            color: peer.color,
            role: peer.role,
            industry: peer.industry,
            online: peer.online,
            verified: peer.verified,
            tags: peer.tags.map((t) => t.tagName),
          }
        : {
            slug: peerSlug,
            name: peerSlug,
            emoji: "🤖",
            color: "#8B94A8",
            role: "该 Agent 已注销",
            industry: "",
            online: false,
            verified: false,
            tags: [],
          };

      return {
        id: c.id,
        peer: peerBrief,
        since: c.createdAt.toISOString(),
        last: lastBrief,
        unread: unreadMap.get(conversationId) ?? 0,
      };
    }),
  );

  // 按最后一条消息时间倒序（无消息的连接排最后）
  views.sort((a, b) => (b.last?.createdAt ?? b.since).localeCompare(a.last?.createdAt ?? a.since));
  return views;
}

/* ---------------------- 待处理请求 ---------------------- */

export async function listPending(me: string): Promise<{ from: PeerBrief; since: string }[]> {
  const conns = await prisma.connection.findMany({
    where: { OR: [{ aSlug: me }, { bSlug: me }], status: "pending" },
    orderBy: { createdAt: "desc" },
  });
  // 只保留「别人发起、等我处理」的请求
  const incoming = conns.filter((c) => c.initiator !== me);
  const slugs = incoming.map((c) => (c.aSlug === me ? c.bSlug : c.aSlug));
  if (slugs.length === 0) return [];

  const peers = await prisma.agent.findMany({ where: { slug: { in: slugs } }, include: { tags: true } });
  return peers.map((p) => {
    const conn = incoming.find((c) => c.aSlug === p.slug || c.bSlug === p.slug);
    return {
      from: {
        slug: p.slug,
        name: p.name,
        emoji: p.emoji,
        color: p.color,
        role: p.role,
        industry: p.industry,
        online: p.online,
        verified: p.verified,
        tags: p.tags.map((t) => t.tagName),
      },
      since: (conn?.createdAt ?? new Date()).toISOString(),
    };
  });
}

export async function respondConnection(me: string, other: string, accept: boolean): Promise<{ status: string }> {
  const { aSlug, bSlug } = normalizePair(me, other);
  const conn = await prisma.connection.findUnique({ where: { aSlug_bSlug: { aSlug, bSlug } } });
  if (!conn) throw new AppError(ErrorCode.NOT_FOUND, "对接请求不存在");
  if (conn.status !== "pending") throw new AppError(ErrorCode.CONFLICT, "该对接请求已处理");
  if (conn.initiator === me) throw new AppError(ErrorCode.FORBIDDEN, "不能处理自己发起的请求");

  if (accept) {
    await prisma.connection.update({ where: { id: conn.id }, data: { status: "accepted" } });
    // 接受后自动寒暄一句，触发对方 bot 应答形成闭环
    const greet = botReply(me, other, "__greeting__");
    if (greet) {
      await prisma.message.create({
        data: {
          conversationId: `${aSlug}:${bSlug}`,
          fromAgent: me,
          toAgent: other,
          text: greet,
          type: "bot",
        },
      });
    }
    return { status: "accepted" };
  }

  await prisma.connection.update({ where: { id: conn.id }, data: { status: "rejected" } });
  return { status: "rejected" };
}
