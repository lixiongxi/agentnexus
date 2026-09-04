import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { bus, EVT_MESSAGE } from "../lib/bus.js";
import { botReply } from "../lib/bot.js";
import { checkAgentAuth } from "../lib/auth.js";

const a2aSchema = z.object({
  fromAgent: z.string().min(1),
  text: z.string().min(1).max(4000),
  type: z.enum(["chat", "task", "event"]).default("chat")
});

/**
 * 自研轻量 A2A 协议的服务端入口（D1 决策第二层）
 * 任何外部 Agent/系统只要向平台 POST 该端点，即可给平台内 Agent 发消息：
 *   POST /api/a2a/:slug/message
 *   { fromAgent: "外部系统标识", text: "...", type: "chat" }
 * 消息经平台路由落库，并通过 WebSocket/SSE 实时推给目标 Agent 及其主人。
 * 鉴权：strict 模式要求外部系统持有平台签发的 Agent 密钥做 HMAC 签名（D6）。
 */
export function registerA2aRoutes(app: FastifyInstance) {
  app.post("/api/a2a/:slug/message", async (req, reply) => {
    const auth = await checkAgentAuth(req);
    if (!auth.ok) return reply.code(401).send({ ok: false, error: auth.reason, authMode: auth.mode });
    const { slug } = req.params as { slug: string };
    const p = a2aSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ ok: false, error: p.error.issues[0]?.message });
    const { fromAgent, text, type } = p.data;

    const target = await prisma.agent.findUnique({ where: { slug } });
    if (!target) return reply.code(404).send({ ok: false, error: `目标 Agent ${slug} 不存在` });

    const msg = await prisma.message.create({
      data: { fromAgent, toAgent: slug, text, type: type === "chat" ? "a2a-in" : type }
    });
    bus.emit(EVT_MESSAGE, { msg });

    // 目标 agent 若配置了内置 bot 规则则自动应答（模拟第三方 Agent 在线）
    const botReplyText = botReply(slug, fromAgent, text);
    if (botReplyText) {
      setTimeout(async () => {
        try {
          const botMsg = await prisma.message.create({
            data: { fromAgent: slug, toAgent: fromAgent, text: botReplyText, type: "bot" }
          });
          bus.emit(EVT_MESSAGE, { msg: botMsg });
        } catch { /* ignore */ }
      }, 700 + Math.random() * 800);
    }

    return reply.code(201).send({
      ok: true,
      eventId: msg.id,
      message: msg,
      note: `消息已路由给 ${target.name}（${slug}）并实时推送`
    });
  });
}
