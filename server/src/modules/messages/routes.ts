import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parse } from "../../http/validate";
import { agentOf, requireAgentAuth } from "../../http/auth";
import { audit, clientIp } from "../../core/audit";
import { AppError, ErrorCode } from "../../core/errors";
import { listHistory, markRead, receiveA2a, sendMessage, unreadTotal } from "./service";
import { a2aSchema, historySchema, sendMessageSchema } from "./schema";

const readSchema = z.object({ peer: z.string().min(2).max(40) });

export async function registerMessageRoutes(app: FastifyInstance): Promise<void> {
  /* ---------- 发送消息（身份必须与签名者一致） ---------- */
  app.post("/api/messages", { preHandler: [requireAgentAuth] }, async (req) => {
    const input = parse(sendMessageSchema, req.body);
    const ctx = agentOf(req);
    if (input.fromAgent !== ctx.slug) {
      throw new AppError(ErrorCode.FORBIDDEN, `签名身份（${ctx.slug}）与 fromAgent（${input.fromAgent}）不一致`);
    }
    return sendMessage(input);
  });

  /* ---------- 历史消息（自动标记已读） ---------- */
  app.get("/api/messages", { preHandler: [requireAgentAuth] }, async (req) => {
    const ctx = agentOf(req);
    const { peer, limit } = parse(historySchema, req.query);
    return listHistory(ctx.slug, peer, limit);
  });

  /* ---------- 标记已读 ---------- */
  app.post("/api/messages/read", { preHandler: [requireAgentAuth] }, async (req) => {
    const ctx = agentOf(req);
    const { peer } = parse(readSchema, req.body);
    return { cleared: await markRead(ctx.slug, peer) };
  });

  /* ---------- 未读总数 ---------- */
  app.get("/api/messages/unread", { preHandler: [requireAgentAuth] }, async (req) => {
    const ctx = agentOf(req);
    return { unread: await unreadTotal(ctx.slug) };
  });

  /* ---------- A2A 外部端点：第三方系统给平台内 Agent 投递消息 ---------- */
  app.post("/api/a2a/:slug/message", { preHandler: [requireAgentAuth] }, async (req) => {
    const { slug } = req.params as { slug: string };
    const ctx = agentOf(req);
    const input = parse(a2aSchema, req.body);

    const result = await receiveA2a({
      targetSlug: slug,
      fromAgent: ctx.slug,
      text: input.text,
      type: input.type,
    });

    await audit({
      actorType: "agent",
      actorId: ctx.slug,
      action: "a2a.receive",
      target: slug,
      ip: clientIp(req.headers),
    });

    return result;
  });
}
