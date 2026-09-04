import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { genSecret } from "../lib/crypto.js";
import { checkAgentAuth } from "../lib/auth.js";

const registerSchema = z.object({
  name: z.string().min(1, "Agent 名称必填").max(50),
  slug: z.string().min(2, "标识至少 2 个字符").regex(/^[a-z0-9-]+$/, "标识只能是小写字母/数字/中划线"),
  emoji: z.string().default("🤖"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#4F6BFF"),
  role: z.string().min(1).max(120),
  description: z.string().max(500).default(""),
  industry: z.string().max(30).default("企业服务"),
  tags: z.array(z.string().max(20)).default([]),
  autoAccept: z.boolean().default(true),
  online: z.boolean().default(true),
  mcpEndpoint: z.string().url().optional().or(z.literal("")),
  a2aEndpoint: z.string().url().optional().or(z.literal("")),
  owner: z.object({
    name: z.string().min(1),
    org: z.string().min(1),
    title: z.string().optional().default(""),
    email: z.string().email().optional().or(z.literal(""))
  })
});

const listSchema = z.object({
  q: z.string().max(50).optional().default(""),
  tag: z.string().max(20).optional().default(""),
  industry: z.string().max(30).optional().default(""),
  online: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});

const connectSchema = z.object({
  fromAgent: z.string().min(1),
  toAgent: z.string().min(1)
});

export function agentPublic(a: any) {
  const { secret, owner, ...rest } = a;
  let tags: string[] = [];
  try { tags = JSON.parse(a.tags ?? "[]"); } catch { /* ignore */ }
  // 公开接口不暴露主人邮箱；仅返回名片所需字段
  const safeOwner = owner
    ? { id: owner.id, name: owner.name, org: owner.org, title: owner.title }
    : undefined;
  return { ...rest, tags, ...(safeOwner ? { owner: safeOwner } : {}) };
}

/* ---------- 管理：审核白名单（演示期直接调用，生产接管理员鉴权） ---------- */
export function registerAdminRoutes(app: FastifyInstance) {
  app.post("/api/admin/verify", async (req, reply) => {
    const { slug, verified } = (req.body || {}) as { slug?: string; verified?: boolean };
    if (!slug) return reply.code(400).send({ ok: false, error: "slug 必填" });
    const agent = await prisma.agent.findUnique({ where: { slug } });
    if (!agent) return reply.code(404).send({ ok: false, error: "Agent 不存在" });
    const updated = await prisma.agent.update({
      where: { slug },
      data: { verified: verified === false ? false : true }
    });
    return reply.send({ ok: true, agent: agentPublic(updated), message: `${updated.name} 已${updated.verified ? "通过认证" : "取消认证"}` });
  });
}

export function registerAgentRoutes(app: FastifyInstance) {
  /* ---------- 注册 Agent（返回 secret 仅此一次） ---------- */
  app.post("/api/agents", async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: parsed.error.issues[0]?.message ?? "参数错误" });
    }
    const b = parsed.data;
    const slugExists = await prisma.agent.findUnique({ where: { slug: b.slug } });
    if (slugExists) return reply.code(409).send({ ok: false, error: `标识 ${b.slug} 已被占用` });

    const secret = genSecret();
    const owner = await prisma.owner.create({
      data: { name: b.owner.name, org: b.owner.org, title: b.owner.title, email: b.owner.email }
    });
    const agent = await prisma.agent.create({
      data: {
        slug: b.slug, name: b.name, emoji: b.emoji, color: b.color,
        role: b.role, description: b.description, industry: b.industry,
        tags: JSON.stringify(b.tags), online: b.online, autoAccept: b.autoAccept,
        secret, ownerId: owner.id,
        mcpEndpoint: b.mcpEndpoint || null, a2aEndpoint: b.a2aEndpoint || null
      }
    });
    return reply.code(201).send({
      ok: true,
      agent: { ...agentPublic(agent), secret }, // secret 仅此一次
      message: `Agent「${b.name}」注册成功，已可被广场发现`
    });
  });

  /* ---------- 广场列表（搜索 + 筛选 + 分页） ---------- */
  app.get("/api/agents", async (req, reply) => {
    const q = listSchema.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ ok: false, error: q.error.issues[0]?.message });
    const { q: kw, tag, industry, online, page, pageSize } = q.data;

    const where: any = {};
    if (kw) {
      where.OR = [
        { name: { contains: kw } }, { role: { contains: kw } },
        { industry: { contains: kw } }, { tags: { contains: kw } }
      ];
    }
    if (tag) where.tags = { contains: tag };
    if (industry) where.industry = industry;
    if (online) where.online = online === "true";

    const [total, rows] = await Promise.all([
      prisma.agent.count({ where }),
      prisma.agent.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize,
        orderBy: { createdAt: "asc" }, include: { owner: true }
      })
    ]);
    return reply.send({
      ok: true,
      total, page, pageSize,
      agents: rows.map(a => agentPublic(a))
    });
  });

  /* ---------- Agent 详情 ---------- */
  app.get("/api/agents/:slug", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const agent = await prisma.agent.findUnique({ where: { slug }, include: { owner: true } });
    if (!agent) return reply.code(404).send({ ok: false, error: "Agent 不存在" });
    return reply.send({ ok: true, agent: agentPublic(agent) });
  });

  /* ---------- 发起对接（M0 简化：立即建立；带 Agent 签名鉴权） ---------- */
  app.post("/api/connections", async (req, reply) => {
    const auth = await checkAgentAuth(req);
    if (!auth.ok) return reply.code(401).send({ ok: false, error: auth.reason, authMode: auth.mode });
    const p = connectSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ ok: false, error: "fromAgent/toAgent 必填" });
    const { fromAgent, toAgent } = p.data;
    if (fromAgent === toAgent) return reply.code(400).send({ ok: false, error: "不能对接自己" });
    const [f, t] = await Promise.all([
      prisma.agent.findUnique({ where: { slug: fromAgent } }),
      prisma.agent.findUnique({ where: { slug: toAgent } })
    ]);
    if (!f || !t) return reply.code(404).send({ ok: false, error: "Agent 不存在" });
    const exist = await prisma.connection.findUnique({
      where: { fromAgent_toAgent: { fromAgent, toAgent } }
    });
    if (exist) return reply.code(200).send({ ok: true, connection: exist, message: "已是对接关系" });
    const connection = await prisma.connection.create({ data: { fromAgent, toAgent, status: "active" } });
    return reply.code(201).send({
      ok: true, connection,
      message: `${f.name} → ${t.name} 对接建立成功（对方策略：${t.autoAccept ? "自动接受" : "需人工确认"}）`
    });
  });
}
