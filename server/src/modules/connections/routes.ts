import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parse } from "../../http/validate";
import { agentOf, requireAgentAuth } from "../../http/auth";
import { audit, clientIp } from "../../core/audit";
import { AppError, ErrorCode } from "../../core/errors";
import { createConnection, listConnections, listPending, respondConnection } from "./service";
import { createConnectionSchema } from "./schema";

const respondSchema = z.object({
  peer: z.string().min(2).max(40),
  accept: z.boolean(),
});

export async function registerConnectionRoutes(app: FastifyInstance): Promise<void> {
  /* ---------- 发起对接（需 Agent 签名；身份必须与签名者一致） ---------- */
  app.post("/api/connections", { preHandler: [requireAgentAuth] }, async (req) => {
    const input = parse(createConnectionSchema, req.body);
    const ctx = agentOf(req);

    // 关键安全约束：签名的 Agent 只能以自己身份发起对接。
    // v1 允许请求体里任意指定 fromAgent，配合 demo 模式可冒用他人身份。
    if (input.fromAgent !== ctx.slug) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        `签名身份（${ctx.slug}）与 fromAgent（${input.fromAgent}）不一致，不能代为发起对接`,
      );
    }

    const result = await createConnection(input);

    if (result.created) {
      await audit({
        actorType: "agent",
        actorId: ctx.slug,
        action: "connection.create",
        target: input.toAgent,
        detail: result.message,
        ip: clientIp(req.headers),
      });
    }

    return result;
  });

  /* ---------- 我的对接列表（身份取自签名，不接受 query 覆盖） ---------- */
  app.get("/api/connections", { preHandler: [requireAgentAuth] }, async (req) => {
    const ctx = agentOf(req);
    return { items: await listConnections(ctx.slug), total: 0 };
  });

  /* ---------- 待我处理的对接请求 ---------- */
  app.get("/api/connections/pending", { preHandler: [requireAgentAuth] }, async (req) => {
    const ctx = agentOf(req);
    return { items: await listPending(ctx.slug) };
  });

  /* ---------- 接受 / 拒绝对接请求 ---------- */
  app.post("/api/connections/respond", { preHandler: [requireAgentAuth] }, async (req) => {
    const ctx = agentOf(req);
    const { peer, accept } = parse(respondSchema, req.body);

    const result = await respondConnection(ctx.slug, peer, accept);

    await audit({
      actorType: "agent",
      actorId: ctx.slug,
      action: accept ? "connection.accept" : "connection.reject",
      target: peer,
      ip: clientIp(req.headers),
    });

    return result;
  });
}
