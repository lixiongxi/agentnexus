import type { FastifyInstance } from "fastify";
import { AppError, ErrorCode } from "../../core/errors";
import { bus, publish, type BusEvent } from "../../core/bus";
import { prisma } from "../../db/client";
import { optionalAgentAuth, optionalOwnerAuth } from "../../http/auth";
import { consumeTicket, issueTicket } from "./ticket";

/**
 * 实时通道（WebSocket 主 + SSE 兼容）。
 *
 * 【安全基线】两个通道均要求先兑换一次性票据。
 * v1 的 `/ws?agent=<slug>` 与 `/api/stream?agent=<slug>` 没有任何身份校验，
 * 任何人只要知道 slug 就能订阅该 Agent 的全部实时消息流——
 * 这是本次重写识别出的第 5 处越权漏洞。
 */
export async function registerRealtimeRoutes(app: FastifyInstance): Promise<void> {
  /* ---------- 兑换订阅票据（Agent 签名 或 主人令牌，二选一） ---------- */
  app.post(
    "/api/realtime/ticket",
    { preHandler: [optionalAgentAuth, optionalOwnerAuth] },
    async (req) => {
      const agentCtx = req.agentContext;
      const ownerCtx = req.ownerContext;

      let agentSlug: string;
      let actorId: string;
      let actorType: "agent" | "owner";

      if (agentCtx) {
        agentSlug = agentCtx.slug;
        actorId = agentCtx.slug;
        actorType = "agent";
      } else if (ownerCtx) {
        const requested = (req.body ?? {}) as { agentSlug?: string };
        const slug = requested.agentSlug;
        if (!slug) {
          throw new AppError(ErrorCode.VALIDATION_ERROR, "主人身份兑换票据时需提供 agentSlug");
        }
        // 关键：校验该 Agent 确实属于这位主人，防止横向越权订阅
        const agent = await prisma.agent.findUnique({
          where: { slug },
          select: { ownerId: true },
        });
        if (!agent) throw new AppError(ErrorCode.NOT_FOUND, `Agent ${slug} 不存在`);
        if (agent.ownerId !== ownerCtx.ownerId) {
          throw new AppError(ErrorCode.FORBIDDEN, "该 Agent 不属于当前登录主人");
        }
        agentSlug = slug;
        actorId = ownerCtx.ownerId;
        actorType = "owner";
      } else {
        throw new AppError(ErrorCode.UNAUTHORIZED, "需携带 Agent 签名或主人令牌才能兑换票据");
      }

      return {
        ticket: issueTicket(agentSlug, actorId, actorType),
        agentSlug,
        expiresInMs: 60_000,
      };
    },
  );

  /* ---------- WebSocket 实时通道 ---------- */
  app.get("/ws", { websocket: true }, async (socket, req) => {
    const rawTicket = (req.query as { ticket?: string } | undefined)?.ticket;
    if (!rawTicket) {
      socket.close(4001, "missing ticket");
      return;
    }

    const ticket = consumeTicket(rawTicket);
    if (!ticket) {
      socket.close(4001, "invalid or expired ticket");
      return;
    }

    const me = ticket.agentSlug;
    socket.send(JSON.stringify({ type: "connected", agent: me }));

    // 群消息按「连接建立时的成员群集合」过滤；新加群后重连即可收到（v1 取舍）
    const myGroups = new Set(
      (
        await prisma.groupMember.findMany({
          where: { agentSlug: me },
          select: { groupId: true },
        })
      ).map((m) => m.groupId),
    );

    const unsubscribe = bus.subscribe((event: BusEvent) => {
      if (event.type === "message") {
        const m = event.payload;
        if (m.fromAgent !== me && m.toAgent !== me) return;
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify(event));
        }
        return;
      }
      if (event.type === "group-message") {
        if (!myGroups.has(event.payload.groupId)) return;
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify(event));
        }
      }
    });

    socket.on("close", unsubscribe);
    socket.on("error", unsubscribe);
  });

  /* ---------- SSE 兼容通道（兼容 A2A 事件流规范） ---------- */
  app.get("/api/stream", async (req, reply) => {
    const rawTicket = (req.query as { ticket?: string } | undefined)?.ticket;
    if (!rawTicket) {
      reply.code(401).send({ ok: false, error: { code: "UNAUTHORIZED", message: "缺少订阅票据" } });
      return;
    }

    const ticket = consumeTicket(rawTicket);
    if (!ticket) {
      reply.code(401).send({ ok: false, error: { code: "UNAUTHORIZED", message: "票据无效或已过期" } });
      return;
    }

    const me = ticket.agentSlug;

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const write = (payload: unknown): void => {
      if (!reply.raw.writableEnded) reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    write({ type: "connected", agent: me });

    const myGroups = new Set(
      (
        await prisma.groupMember.findMany({
          where: { agentSlug: me },
          select: { groupId: true },
        })
      ).map((m) => m.groupId),
    );

    const unsubscribe = bus.subscribe((event: BusEvent) => {
      if (event.type === "message") {
        const m = event.payload;
        if (m.fromAgent !== me && m.toAgent !== me) return;
        write(event);
        return;
      }
      if (event.type === "group-message") {
        if (!myGroups.has(event.payload.groupId)) return;
        write(event);
      }
    });

    // 25 秒心跳，防止中间层（nginx 等）因空闲断开连接
    const heartbeat = setInterval(() => {
      if (!reply.raw.writableEnded) reply.raw.write(": ping\n\n");
    }, 25_000);

    req.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}

/** 供其它模块广播在线状态变化 */
export function broadcastPresence(agentSlug: string, online: boolean): void {
  publish({ type: "presence", payload: { agentSlug, online } });
}
