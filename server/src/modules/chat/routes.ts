import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parse } from "../../http/validate";
import { ownerOf, requireOwnerAuth } from "../../http/auth";
import {
  createSession,
  deleteSession,
  getSessionWithMessages,
  listSessions,
  sendChatMessage,
} from "./service";

const createSchema = z.object({
  title: z.string().max(50).optional(),
});

const sendSchema = z.object({
  text: z.string().min(1, "消息不能为空").max(2000, "单条消息最多 2000 字"),
});

/**
 * 虚拟伙伴路由。
 * 全部端点强制 requireOwnerAuth —— v1 的 /api/chat 与 /api/chat/:sessionId
 * 均为零鉴权，任何人可读写任意会话，此处已全部收敛为「仅本人可访问」。
 */
export async function registerChatRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/chat/sessions", { preHandler: [requireOwnerAuth] }, async (req) => {
    const owner = ownerOf(req);
    const { title } = parse(createSchema, req.body ?? {});
    return createSession(owner.ownerId, title);
  });

  app.get("/api/chat/sessions", { preHandler: [requireOwnerAuth] }, async (req) => {
    const owner = ownerOf(req);
    return { items: await listSessions(owner.ownerId) };
  });

  app.get("/api/chat/sessions/:id", { preHandler: [requireOwnerAuth] }, async (req) => {
    const owner = ownerOf(req);
    const { id } = req.params as { id: string };
    return getSessionWithMessages(id, owner.ownerId);
  });

  app.post("/api/chat/sessions/:id/messages", { preHandler: [requireOwnerAuth] }, async (req) => {
    const owner = ownerOf(req);
    const { id } = req.params as { id: string };
    const { text } = parse(sendSchema, req.body);
    return sendChatMessage(id, owner.ownerId, text);
  });

  app.delete("/api/chat/sessions/:id", { preHandler: [requireOwnerAuth] }, async (req) => {
    const owner = ownerOf(req);
    const { id } = req.params as { id: string };
    await deleteSession(id, owner.ownerId);
    return { deleted: true };
  });
}
