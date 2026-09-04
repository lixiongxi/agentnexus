/**
 * 消息路由网关：校验对接关系 → 落库 → 实时推送 → 内置 bot 应答。
 *
 * 相对 v1 的两处修正：
 *  1. bot 应答由 setTimeout 异步延迟落库改为同步落库。
 *     v1 的做法在进程重启时会直接丢失应答消息，造成「对方说了话但没回复」的断层；
 *     延迟带来的「思考感」改由前端 typing 指示承担，可靠性优先。
 *  2. 会话统一用 conversationId 查询，v1 需要双向 OR + 两张表扫描。
 */
import { prisma } from "../../db/client";
import { AppError, ErrorCode } from "../../core/errors";
import { publish, type MessagePayload } from "../../core/bus";
import { botReply } from "../../lib/bot";
import { conversationIdOf, isConnected } from "../connections/service";
import type { MessageView, SendMessageInput } from "./schema";

function toView(m: {
  id: string;
  conversationId: string;
  fromAgent: string;
  toAgent: string;
  text: string;
  type: string;
  readAt: Date | null;
  createdAt: Date;
}): MessageView {
  return {
    id: m.id,
    conversationId: m.conversationId,
    fromAgent: m.fromAgent,
    toAgent: m.toAgent,
    text: m.text,
    type: m.type,
    readAt: m.readAt ? m.readAt.toISOString() : null,
    createdAt: m.createdAt.toISOString(),
  };
}

function toPayload(m: {
  id: string;
  conversationId: string;
  fromAgent: string;
  toAgent: string;
  text: string;
  type: string;
  createdAt: Date;
}): MessagePayload {
  return {
    id: m.id,
    conversationId: m.conversationId,
    fromAgent: m.fromAgent,
    toAgent: m.toAgent,
    text: m.text,
    type: m.type,
    createdAt: m.createdAt.toISOString(),
  };
}

/* ---------------------- 发送 ---------------------- */

export interface SendResult {
  message: MessageView;
  bot: MessageView | null;
}

export async function sendMessage(input: SendMessageInput): Promise<SendResult> {
  const { fromAgent, toAgent, text, type } = input;

  const [from, to] = await Promise.all([
    prisma.agent.findUnique({ where: { slug: fromAgent }, select: { slug: true, status: true, name: true } }),
    prisma.agent.findUnique({ where: { slug: toAgent }, select: { slug: true, status: true, name: true } }),
  ]);
  if (!from) throw new AppError(ErrorCode.NOT_FOUND, `发送方 ${fromAgent} 不存在`);
  if (!to) throw new AppError(ErrorCode.NOT_FOUND, `接收方 ${toAgent} 不存在`);
  if (from.status !== "active") throw new AppError(ErrorCode.AGENT_SUSPENDED, `发送方 ${fromAgent} 已被停用`);
  if (to.status !== "active") throw new AppError(ErrorCode.AGENT_SUSPENDED, `接收方 ${toAgent} 已被停用`);

  const connected = await isConnected(fromAgent, toAgent);
  if (!connected) {
    throw new AppError(ErrorCode.CONNECTION_REQUIRED, "双方尚未建立对接关系，无法通信");
  }

  const conversationId = conversationIdOf(fromAgent, toAgent);
  const created = await prisma.message.create({
    data: { conversationId, fromAgent, toAgent, text, type },
  });
  publish({ type: "message", payload: toPayload(created) });

  // 内置 bot 应答：同步落库并推送，保证不因进程重启而丢失
  const botText = botReply(toAgent, fromAgent, text);
  let botView: MessageView | null = null;
  if (botText) {
    const botMsg = await prisma.message.create({
      data: { conversationId, fromAgent: toAgent, toAgent: fromAgent, text: botText, type: "bot" },
    });
    publish({ type: "message", payload: toPayload(botMsg) });
    botView = toView(botMsg);
  }

  return { message: toView(created), bot: botView };
}

/* ---------------------- 历史 ---------------------- */

/** 拉取与某 Agent 的双向历史，并顺带把对方发给我的消息标记为已读 */
export async function listHistory(
  me: string,
  peer: string,
  limit: number,
): Promise<{ messages: MessageView[]; unreadCleared: number }> {
  const conversationId = conversationIdOf(me, peer);
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const cleared = await markRead(me, peer);
  return { messages: rows.reverse().map(toView), unreadCleared: cleared };
}

/** 标记某个会话中「发给我」的未读消息为已读，返回清除条数 */
export async function markRead(me: string, peer: string): Promise<number> {
  const conversationId = conversationIdOf(me, peer);
  const res = await prisma.message.updateMany({
    where: { conversationId, toAgent: me, readAt: null },
    data: { readAt: new Date() },
  });
  return res.count;
}

/** 全局未读总数（用于角标） */
export async function unreadTotal(me: string): Promise<number> {
  return prisma.message.count({ where: { toAgent: me, readAt: null } });
}

/* ---------------------- A2A 外部接入 ---------------------- */

/**
 * 自研轻量 A2A 协议服务端入口。
 * 外部 Agent/系统向平台内 Agent 投递消息，平台负责路由、落库与实时推送。
 * 该路径同样要求调用方持有平台签发的 Agent 密钥（strict 模式）。
 */
export async function receiveA2a(input: {
  targetSlug: string;
  fromAgent: string;
  text: string;
  type: string;
}): Promise<{ message: MessageView; bot: MessageView | null }> {
  const target = await prisma.agent.findUnique({ where: { slug: input.targetSlug } });
  if (!target) throw new AppError(ErrorCode.NOT_FOUND, `目标 Agent ${input.targetSlug} 不存在`);
  if (target.status !== "active") throw new AppError(ErrorCode.AGENT_SUSPENDED, "目标 Agent 已被停用");

  // A2A 是「外部系统主动找上门」的通道，要求目标方已建立过对接关系，
  // 避免任何持密钥者都能对任意 Agent 投递消息（v1 此处无对接校验）。
  const connected = await isConnected(input.fromAgent, input.targetSlug);
  if (!connected) {
    throw new AppError(
      ErrorCode.CONNECTION_REQUIRED,
      `外部系统 ${input.fromAgent} 与 ${input.targetSlug} 尚未建立对接，请先完成对接`,
    );
  }

  const conversationId = conversationIdOf(input.fromAgent, input.targetSlug);
  const created = await prisma.message.create({
    data: {
      conversationId,
      fromAgent: input.fromAgent,
      toAgent: input.targetSlug,
      text: input.text,
      type: input.type === "chat" ? "a2a-in" : input.type,
    },
  });
  publish({ type: "message", payload: toPayload(created) });

  const botText = botReply(input.targetSlug, input.fromAgent, input.text);
  let botView: MessageView | null = null;
  if (botText) {
    const botMsg = await prisma.message.create({
      data: {
        conversationId,
        fromAgent: input.targetSlug,
        toAgent: input.fromAgent,
        text: botText,
        type: "bot",
      },
    });
    publish({ type: "message", payload: toPayload(botMsg) });
    botView = toView(botMsg);
  }

  return { message: toView(created), bot: botView };
}
