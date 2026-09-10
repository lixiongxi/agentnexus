/**
 * 企业助理路由：
 *   POST  /api/assistants       创建（公开，同 /api/agents 注册口径；限流全局限速保护）
 *   GET   /api/assistants/:slug 查询配置（公开：知识库即能力声明）
 *   PATCH /api/assistants/:slug 更新（Agent 签名 / 主人令牌 / 管理员令牌，三选一）
 */
import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { parse } from "../../http/validate";
import { optionalAgentAuth, optionalOwnerAuth } from "../../http/auth";
import { audit, clientIp } from "../../core/audit";
import { AppError, ErrorCode } from "../../core/errors";
import { config } from "../../core/config";
import { prisma } from "../../db/client";
import { createAssistant, getAssistant, updateAssistant } from "./service";
import { createAssistantSchema, updateAssistantSchema } from "./schema";

/** 与 agents/routes 的 assertCanManageAgent 同口径，但兼容「可选鉴权」链 + 手动管理员令牌 */
async function assertCanManageAssistant(req: { headers: Record<string, unknown> }, slug: string): Promise<void> {
  const anyReq = req as unknown as {
    adminContext?: unknown;
    agentContext?: { slug: string };
    ownerContext?: { ownerId: string };
  };
  if (anyReq.adminContext) return;
  if (anyReq.agentContext?.slug === slug) return;

  const agent = await prisma.agent.findUnique({ where: { slug }, select: { ownerId: true } });
  if (!agent) throw new AppError(ErrorCode.NOT_FOUND, `Agent ${slug} 不存在`);
  if (anyReq.ownerContext?.ownerId === agent.ownerId) return;

  const provided = req.headers["x-admin-token"];
  const expected = config.security.adminToken;
  if (typeof provided === "string" && expected) {
    const a = Buffer.from(provided, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return;
  }
  throw new AppError(ErrorCode.FORBIDDEN, "无权操作该助理（需 Agent 签名 / 主人令牌 / 管理员令牌）");
}

export async function registerAssistantRoutes(app: FastifyInstance): Promise<void> {
  /* ---------- 创建企业助理（公开；密钥仅此一次返回） ---------- */
  app.post("/api/assistants", async (req) => {
    const input = parse(createAssistantSchema, req.body);
    const result = await createAssistant(input);

    await audit({
      actorType: "anonymous",
      actorId: result.agent.slug,
      action: "assistant.create",
      target: result.agent.slug,
      detail: `创建企业助理「${result.agent.name}」（FAQ ${result.profile.faq.length} 条 / 产品 ${result.profile.products.length} 个）`,
      ip: clientIp(req.headers),
    });

    return result;
  });

  /* ---------- 查询企业助理配置（公开） ---------- */
  app.get("/api/assistants/:slug", async (req) => {
    const { slug } = req.params as { slug: string };
    return getAssistant(slug);
  });

  /* ---------- 更新企业助理配置（Agent 本人 / 主人 / 管理员） ---------- */
  app.patch(
    "/api/assistants/:slug",
    { preHandler: [optionalAgentAuth, optionalOwnerAuth] },
    async (req) => {
      const { slug } = req.params as { slug: string };
      await assertCanManageAssistant(req, slug);
      const input = parse(updateAssistantSchema, req.body);
      const result = await updateAssistant(slug, input.profile);

      const actor =
        (req as unknown as { agentContext?: { slug: string } }).agentContext?.slug ?? "owner/admin";
      await audit({
        actorType: actor === "owner/admin" ? "owner" : "agent",
        actorId: actor,
        action: "assistant.update",
        target: slug,
        detail: `更新企业助理「${result.agent.name}」配置`,
        ip: clientIp(req.headers),
      });

      return result;
    },
  );
}
