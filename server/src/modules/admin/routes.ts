import type { FastifyInstance } from "fastify";
import { parse } from "../../http/validate";
import { requireAdminAuth } from "../../http/auth";
import { audit, clientIp } from "../../core/audit";
import { AppError, ErrorCode } from "../../core/errors";
import { prisma } from "../../db/client";
import { registerAdminDebugRoutes } from "./debug";
import { getLlmConfig, setLlmConfig, testLlmConnection } from "../../lib/llm";
import { toPublicView } from "../agents/service";
import { auditQuerySchema, llmConfigSchema, verifySchema } from "./schema";
import type { AuditLogView } from "./schema";

/**
 * 管理端点。
 *
 * 【安全基线】本模块全部端点强制 requireAdminAuth。
 * v1 的 /api/admin/verify 与 /api/llm/config 均为零鉴权——
 * 前者可被任意人取消 Agent 的平台认证，后者可被任意人改写服务端 .env
 * 并把 LLM 端点指向攻击者的服务器（从而截获全平台对话内容）。
 * 实测两个漏洞均可在无任何凭据的情况下利用成功，本次重写已全部收敛。
 */
export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  /* ---------- 审核白名单：认证 / 取消认证 ---------- */
  app.post("/api/admin/verify", { preHandler: [requireAdminAuth] }, async (req) => {
    const { slug, verified } = parse(verifySchema, req.body);

    const agent = await prisma.agent.findUnique({ where: { slug } });
    if (!agent) throw new AppError(ErrorCode.NOT_FOUND, `Agent ${slug} 不存在`);

    const updated = await prisma.agent.update({
      where: { slug },
      data: { verified },
      include: { owner: true, tags: true },
    });

    await audit({
      actorType: "admin",
      actorId: "admin",
      action: verified ? "agent.verify" : "agent.unverify",
      target: slug,
      detail: `${updated.name} 已${verified ? "通过" : "取消"}平台认证`,
      ip: clientIp(req.headers),
    });

    return { agent: toPublicView(updated), verified: updated.verified };
  });

  /* ---------- 停用 / 恢复 Agent ---------- */
  app.post("/api/admin/agents/:slug/status", { preHandler: [requireAdminAuth] }, async (req) => {
    const { slug } = req.params as { slug: string };
    const body = (req.body ?? {}) as { status?: string };
    if (body.status !== "active" && body.status !== "suspended") {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "status 只能是 active 或 suspended");
    }

    const agent = await prisma.agent.findUnique({ where: { slug }, select: { id: true } });
    if (!agent) throw new AppError(ErrorCode.NOT_FOUND, `Agent ${slug} 不存在`);

    const updated = await prisma.agent.update({ where: { slug }, data: { status: body.status } });

    await audit({
      actorType: "admin",
      actorId: "admin",
      action: "agent.status",
      target: slug,
      detail: body.status,
      ip: clientIp(req.headers),
    });

    return { slug: updated.slug, status: updated.status };
  });

  /* ---------- LLM 配置：读取（Key 脱敏） ---------- */
  app.get("/api/admin/llm/config", { preHandler: [requireAdminAuth] }, async () => getLlmConfig());

  /* ---------- LLM 配置：保存（入库，不写 .env） ---------- */
  app.post("/api/admin/llm/config", { preHandler: [requireAdminAuth] }, async (req) => {
    const input = parse(llmConfigSchema, req.body);
    const updated = await setLlmConfig(input);

    // 明细中不记录 apiKey 本身，只记录是否发生了变更
    await audit({
      actorType: "admin",
      actorId: "admin",
      action: "llm.update",
      target: "LlmConfig",
      detail: Object.keys(input).join(","),
      ip: clientIp(req.headers),
    });

    return updated;
  });

  /* ---------- LLM 连通性测试 ---------- */
  app.post("/api/admin/llm/test", { preHandler: [requireAdminAuth] }, async () => testLlmConnection());

  /* ---------- 审计日志查询 ---------- */
  app.get("/api/admin/audit", { preHandler: [requireAdminAuth] }, async (req) => {
    const { action, actorId, limit, page } = parse(auditQuerySchema, req.query);

    const where: Record<string, unknown> = {};
    if (action) where["action"] = action;
    if (actorId) where["actorId"] = actorId;

    const [total, rows] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const items: AuditLogView[] = rows.map((r) => ({
      id: r.id,
      actorType: r.actorType,
      actorId: r.actorId,
      action: r.action,
      target: r.target,
      detail: r.detail,
      createdAt: r.createdAt.toISOString(),
    }));

    return { items, total, page, pageSize: limit };
  });

  /* ---------- 平台概览统计 ---------- */
  app.get("/api/admin/stats", { preHandler: [requireAdminAuth] }, async () => {
    const [agents, verified, connections, messages, owners, pending] = await Promise.all([
      prisma.agent.count(),
      prisma.agent.count({ where: { verified: true } }),
      prisma.connection.count({ where: { status: "accepted" } }),
      prisma.message.count(),
      prisma.owner.count(),
      prisma.connection.count({ where: { status: "pending" } }),
    ]);
    return { agents, verified, connections, messages, owners, pendingConnections: pending };
  });

  await registerAdminDebugRoutes(app);
}
