import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { bus, EVT_MESSAGE } from "../lib/bus.js";
import { botReply } from "../lib/bot.js";
import { checkAgentAuth } from "../lib/auth.js";

const sendSchema = z.object({
  fromAgent: z.string().min(1),
  toAgent: z.string().min(1),
  text: z.string().min(1, "消息不能为空").max(4000),
  type: z.enum(["chat", "task", "event"]).default("chat")
});
const historySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

async function dispatchMessage(msg: { fromAgent: string; toAgent: string; text: string; type: string; id: string; createdAt: Date }) {
  bus.emit(EVT_MESSAGE, { msg });
  return msg;
}

export function registerMessageRoutes(app: FastifyInstance) {
  /* ---------- 发送消息（消息路由网关核心，带 Agent 签名鉴权） ---------- */
  app.post("/api/messages", async (req, reply) => {
    const auth = await checkAgentAuth(req);
    if (!auth.ok) return reply.code(401).send({ ok: false, error: auth.reason, authMode: auth.mode });
    const p = sendSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ ok: false, error: p.error.issues[0]?.message });

    const { fromAgent, toAgent, text, type } = p.data;
    if (fromAgent === toAgent) return reply.code(400).send({ ok: false, error: "不能给自己发消息" });

    const [f, t] = await Promise.all([
      prisma.agent.findUnique({ where: { slug: fromAgent } }),
      prisma.agent.findUnique({ where: { slug: toAgent } })
    ]);
    if (!f) return reply.code(404).send({ ok: false, error: `发送方 ${fromAgent} 不存在` });
    if (!t) return reply.code(404).send({ ok: false, error: `接收方 ${toAgent} 不存在` });

    // 必须存在对接关系（任意方向）
    const conn = await prisma.connection.findFirst({
      where: {
        OR: [
          { fromAgent, toAgent },
          { fromAgent: toAgent, toAgent: fromAgent }
        ]
      }
    });
    if (!conn) return reply.code(403).send({ ok: false, error: "双方尚未建立对接，无法通信" });

    const msg = await prisma.message.create({ data: { fromAgent, toAgent, text, type } });
    await dispatchMessage(msg);

    // 目标 Agent 内置 bot 应答（模拟对方 Agent 在线自动回复，全链路真实路由）
    const botReplyText = botReply(toAgent, fromAgent, text);
    if (botReplyText) {
      const delay = 900 + Math.random() * 900;
      setTimeout(async () => {
        try {
          const botMsg = await prisma.message.create({
            data: { fromAgent: toAgent, toAgent: fromAgent, text: botReplyText, type: "bot" }
          });
          await dispatchMessage(botMsg);
        } catch { /* 忽略：bot 应答失败不影响主流程 */ }
      }, delay);
    }

    return reply.code(201).send({ ok: true, message: msg, bot: !!botReplyText });
  });

  /* ---------- 历史消息（双向，按时间升序） ---------- */
  app.get("/api/messages", async (req, reply) => {
    const p = historySchema.safeParse(req.query);
    if (!p.success) return reply.code(400).send({ ok: false, error: p.error.issues[0]?.message });
    const { from, to, limit } = p.data;
    const rows = await prisma.message.findMany({
      where: {
        OR: [
          { fromAgent: from, toAgent: to },
          { fromAgent: to, toAgent: from }
        ]
      },
      orderBy: { createdAt: "asc" },
      take: limit
    });
    return reply.send({ ok: true, messages: rows });
  });

  /* ---------- 某 Agent 的对接列表（前端会话列表用） ---------- */
  app.get("/api/connections", async (req, reply) => {
    const { agent } = req.query as { agent?: string };
    if (!agent) return reply.code(400).send({ ok: false, error: "agent 参数必填" });
    const conns = await prisma.connection.findMany({
      where: { OR: [{ fromAgent: agent }, { toAgent: agent }], status: "active" }
    });
    // 附带最近一条消息
    const rows = await Promise.all(conns.map(async c => {
      const peer = c.fromAgent === agent ? c.toAgent : c.fromAgent;
      const last = await prisma.message.findFirst({
        where: { OR: [{ fromAgent: agent, toAgent: peer }, { fromAgent: peer, toAgent: agent }] },
        orderBy: { createdAt: "desc" }
      });
      return { id: c.id, peer, since: c.createdAt, last: last || null };
    }));
    rows.sort((a, b) => (b.last?.createdAt?.getTime() || 0) - (a.last?.createdAt?.getTime() || 0));
    return reply.send({ ok: true, connections: rows });
  });
}
