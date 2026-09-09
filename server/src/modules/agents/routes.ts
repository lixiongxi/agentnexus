import type { FastifyInstance } from "fastify";
import { parse } from "../../http/validate";
import { requireAgentAuth, requireOwnerAuth, agentOf, ownerOf } from "../../http/auth";
import { audit, clientIp } from "../../core/audit";
import { AppError, ErrorCode } from "../../core/errors";
import { prisma } from "../../db/client";
import {
  getAgentBySlug,
  listAgents,
  listIndustries,
  listTopTags,
  registerAgent,
  setAgentOnline,
  toOwnerView,
  updateAgent,
} from "./service";
import { listAgentsSchema, registerAgentSchema, updateAgentSchema } from "./schema";
import { buildAgentCard } from "../../lib/agent-card";
import { signCard } from "../../lib/card-signing";
import type { Agent } from "@prisma/client";

/**
 * 权限判定：管理某个 Agent 需要满足以下任一身份
 *  - 该 Agent 自身（HMAC 签名）
 *  - 该 Agent 的所属主人（会话令牌）
 *  - 平台管理员（X-Admin-Token）
 */
async function assertCanManageAgent(req: { headers: Record<string, unknown> }, slug: string): Promise<Agent> {
  const agent = await prisma.agent.findUnique({ where: { slug } });
  if (!agent) throw new AppError(ErrorCode.NOT_FOUND, `Agent ${slug} 不存在`);

  const anyReq = req as unknown as {
    adminContext?: unknown;
    agentContext?: { slug: string };
    ownerContext?: { ownerId: string };
  };

  if (anyReq.adminContext) return agent;
  if (anyReq.agentContext?.slug === slug) return agent;
  if (anyReq.ownerContext?.ownerId === agent.ownerId) return agent;

  throw new AppError(ErrorCode.FORBIDDEN, "无权操作该 Agent");
}

export async function registerAgentRoutes(app: FastifyInstance): Promise<void> {
  /* ---------- 注册 Agent（公开；密钥仅此一次返回） ---------- */
  app.post("/api/agents", async (req) => {
    const input = parse(registerAgentSchema, req.body);
    const result = await registerAgent(input);

    await audit({
      actorType: "anonymous",
      actorId: result.agent.slug,
      action: "agent.register",
      target: result.agent.slug,
      detail: `注册 Agent「${result.agent.name}」`,
      ip: clientIp(req.headers),
    });

    return { ...result.agent, secret: result.secret };
  });

  /* ---------- 广场列表（公开） ---------- */
  app.get("/api/agents", async (req) => {
    const query = parse(listAgentsSchema, req.query);
    return listAgents(query);
  });

  /* ---------- 热门标签 / 行业分布（公开；须在 /:slug 之前注册） ---------- */
  app.get("/api/agents/tags", async (req) => {
    const limit = Number((req.query as { limit?: string })?.limit ?? 20);
    return listTopTags(Math.min(Math.max(Number.isFinite(limit) ? limit : 20, 1), 50));
  });

  app.get("/api/agents/industries", async () => listIndustries());

  /* ---------- Agent 详情（公开） ---------- */
  app.get("/api/agents/:slug", async (req) => {
    const { slug } = req.params as { slug: string };
    return getAgentBySlug(slug);
  });

  /* ---------- Agent Card（A2A 适配版，公开；能力自描述「名片」，平台签名） ---------- */
  app.get("/api/agents/:slug/agent-card.json", async (req) => {
    const { slug } = req.params as { slug: string };
    const view = await getAgentBySlug(slug);
    const record = await prisma.agent.findUnique({
      where: { slug },
      select: { a2aEndpoint: true, mcpEndpoint: true },
    });
    const baseUrl = `${req.protocol}://${req.headers.host ?? "localhost:3000"}`;
    const card = buildAgentCard({
      slug: view.slug,
      name: view.name,
      role: view.role,
      description: view.description,
      industry: view.industry,
      tags: view.tags,
      online: view.online,
      verified: view.verified,
      autoAccept: view.autoAccept,
      ownerName: view.owner?.name ?? null,
      ownerOrg: view.owner?.org ?? null,
      a2aEndpoint: record?.a2aEndpoint ?? null,
      mcpEndpoint: record?.mcpEndpoint ?? null,
      baseUrl,
    });
    return signCard(card, baseUrl);
  });

  /* ---------- 更新 Agent（Agent 本人 / 主人 / 管理员） ---------- */
  app.patch("/api/agents/:slug", async (req) => {
    const { slug } = req.params as { slug: string };
    await assertCanManageAgent(req, slug);
    const input = parse(updateAgentSchema, req.body);
    const updated = await updateAgent(slug, input);

    const actor = (req as unknown as { agentContext?: { slug: string } }).agentContext?.slug ?? "owner/admin";
    await audit({
      actorType: actor === "owner/admin" ? "owner" : "agent",
      actorId: actor,
      action: "agent.update",
      target: slug,
      detail: Object.keys(input).join(","),
      ip: clientIp(req.headers),
    });

    return updated;
  });

  /* ---------- 上线 / 下线 ---------- */
  app.post("/api/agents/:slug/online", { preHandler: [requireAgentAuth] }, async (req) => {
    const { slug } = req.params as { slug: string };
    await assertCanManageAgent(req, slug);
    const body = (req.body ?? {}) as { online?: boolean };
    const online = body.online !== false;

    const updated = await setAgentOnline(slug, online);
    const ctx = agentOf(req);

    await audit({
      actorType: "agent",
      actorId: ctx.slug,
      action: online ? "agent.online" : "agent.offline",
      target: slug,
      ip: clientIp(req.headers),
    });

    return updated;
  });

  /* ---------- 当前登录名下的 Agent 列表 ---------- */
  app.get("/api/me/agents", { preHandler: [requireOwnerAuth] }, async (req) => {
    const owner = ownerOf(req);
    const agents = await prisma.agent.findMany({
      where: { ownerId: owner.ownerId },
      include: { owner: true, tags: true },
      orderBy: { createdAt: "desc" },
    });
    return { items: agents.map(toOwnerView), total: agents.length };
  });
}
