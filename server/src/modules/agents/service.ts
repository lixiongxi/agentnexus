/**
 * Agent 领域服务：注册、发现、详情、更新。
 *
 * 数据访问直接使用 Prisma Client —— Prisma 本身已提供类型安全的 repository 抽象，
 * 再包一层 repo 只会增加样板代码而不带来实质收益（这是有意为之的取舍）。
 */
import type { Agent, Owner } from "@prisma/client";
import { prisma } from "../../db/client";
import { AppError, ErrorCode } from "../../core/errors";
import type { Paged } from "../../core/response";
import { generateAgentSecret, encryptSecret } from "../../lib/crypto";
import type {
  AgentOwnerView,
  AgentPublicView,
  ListAgentsQuery,
  RegisterAgentInput,
  UpdateAgentInput,
} from "./schema";

type AgentWithRelations = Agent & {
  owner: Owner | null;
  tags: { tagName: string }[];
};

/** 标签归一化：去空白、去重、丢弃空串 */
export function normalizeTags(tags: string[]): string[] {
  const set = new Set<string>();
  for (const raw of tags) {
    const v = raw.trim();
    if (v) set.add(v);
  }
  return [...set];
}

/* ---------------------- 视图转换 ---------------------- */

/** 公开视图：任何人均可见，绝不携带 secretHash / 主人邮箱等敏感字段 */
export function toPublicView(agent: AgentWithRelations): AgentPublicView {
  return {
    id: agent.id,
    slug: agent.slug,
    name: agent.name,
    emoji: agent.emoji,
    color: agent.color,
    role: agent.role,
    description: agent.description,
    industry: agent.industry,
    tags: agent.tags.map((t) => t.tagName),
    online: agent.online,
    autoAccept: agent.autoAccept,
    verified: agent.verified,
    status: agent.status,
    createdAt: agent.createdAt.toISOString(),
    owner: agent.owner
      ? { name: agent.owner.name, org: agent.owner.org, title: agent.owner.title }
      : null,
  };
}

/** 私有视图：仅 Agent 所属主人或管理员可见 */
export function toOwnerView(agent: AgentWithRelations): AgentOwnerView {
  return {
    ...toPublicView(agent),
    mcpEndpoint: agent.mcpEndpoint,
    a2aEndpoint: agent.a2aEndpoint,
  };
}

const includeRelations = { owner: true, tags: true } as const;

/* ---------------------- 注册 ---------------------- */

export interface RegisterResult {
  agent: AgentPublicView;
  /** 明文密钥，仅此一次返回，服务端只存加密形式 */
  secret: string;
}

export async function registerAgent(input: RegisterAgentInput): Promise<RegisterResult> {
  const tags = normalizeTags(input.tags);

  const existing = await prisma.agent.findUnique({ where: { slug: input.slug }, select: { id: true } });
  if (existing) throw new AppError(ErrorCode.AGENT_SLUG_TAKEN, `标识 ${input.slug} 已被占用`);

  const secret = generateAgentSecret();
  const secretHash = encryptSecret(secret);
  const email = input.owner.email?.trim() || null;

  const agent = await prisma.$transaction(async (tx) => {
    // 同一邮箱视为同一主人，复用 Owner 记录，支持一人拥有多个 Agent
    let owner: Owner | null = email ? await tx.owner.findFirst({ where: { email } }) : null;
    if (!owner) {
      owner = await tx.owner.create({
        data: {
          name: input.owner.name,
          org: input.owner.org,
          title: input.owner.title || null,
          email,
        },
      });
    }

    // 标签字典 upsert，保证聚合统计时可去重
    for (const name of tags) {
      await tx.tag.upsert({ where: { name }, create: { name }, update: {} });
    }

    return tx.agent.create({
      data: {
        slug: input.slug,
        name: input.name,
        emoji: input.emoji,
        color: input.color,
        role: input.role,
        description: input.description,
        industry: input.industry,
        online: input.online,
        autoAccept: input.autoAccept,
        secretHash,
        ownerId: owner.id,
        mcpEndpoint: input.mcpEndpoint || null,
        a2aEndpoint: input.a2aEndpoint || null,
        tags: { create: tags.map((tagName) => ({ tagName })) },
      },
      include: includeRelations,
    });
  });

  return { agent: toPublicView(agent), secret };
}

/* ---------------------- 发现 ---------------------- */

export async function listAgents(query: ListAgentsQuery): Promise<Paged<AgentPublicView>> {
  const { q, tag, industry, online, verified, sort, page, pageSize } = query;

  // 关键词与标签取交集：标签走关联表精确匹配，关键词走字段模糊匹配
  const and: Record<string, unknown>[] = [];
  const or: Record<string, unknown>[] = [];

  if (q) {
    or.push(
      { name: { contains: q } },
      { role: { contains: q } },
      { industry: { contains: q } },
      { description: { contains: q } },
    );
  }
  if (or.length > 0) and.push({ OR: or });

  if (tag) and.push({ tags: { some: { tagName: tag } } });
  if (industry) and.push({ industry });
  if (online !== undefined) and.push({ online: online === "true" });
  if (verified !== undefined) and.push({ verified: verified === "true" });

  const where = and.length > 0 ? { AND: and } : {};

  const orderBy =
    sort === "name"
      ? { name: "asc" as const }
      : sort === "industry"
        ? { industry: "asc" as const }
        : { createdAt: "desc" as const };

  const [total, rows] = await Promise.all([
    prisma.agent.count({ where }),
    prisma.agent.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: includeRelations,
    }),
  ]);

  return { items: rows.map(toPublicView), total, page, pageSize };
}

export async function getAgentBySlug(slug: string): Promise<AgentPublicView> {
  const agent = await prisma.agent.findUnique({ where: { slug }, include: includeRelations });
  if (!agent) throw new AppError(ErrorCode.NOT_FOUND, `Agent ${slug} 不存在`);
  return toPublicView(agent);
}

/** 内部使用：取完整记录（含 secretHash），仅供鉴权等受信路径 */
export async function getAgentRecord(slug: string): Promise<Agent> {
  const agent = await prisma.agent.findUnique({ where: { slug } });
  if (!agent) throw new AppError(ErrorCode.NOT_FOUND, `Agent ${slug} 不存在`);
  return agent;
}

/* ---------------------- 更新 ---------------------- */

export async function updateAgent(slug: string, input: UpdateAgentInput): Promise<AgentOwnerView> {
  const current = await prisma.agent.findUnique({ where: { slug }, select: { id: true } });
  if (!current) throw new AppError(ErrorCode.NOT_FOUND, `Agent ${slug} 不存在`);

  const data: Record<string, unknown> = {};
  for (const key of ["name", "emoji", "color", "role", "description", "industry", "autoAccept", "online"] as const) {
    if (input[key] !== undefined) data[key] = input[key];
  }
  if (input.mcpEndpoint !== undefined) data["mcpEndpoint"] = input.mcpEndpoint || null;
  if (input.a2aEndpoint !== undefined) data["a2aEndpoint"] = input.a2aEndpoint || null;

  const agent = await prisma.$transaction(async (tx) => {
    if (input.tags) {
      const tags = normalizeTags(input.tags);
      for (const name of tags) {
        await tx.tag.upsert({ where: { name }, create: { name }, update: {} });
      }
      await tx.agentTag.deleteMany({ where: { agentId: current.id } });
      if (tags.length > 0) {
        await tx.agentTag.createMany({ data: tags.map((tagName) => ({ agentId: current.id, tagName })) });
      }
    }
    return tx.agent.update({ where: { slug }, data, include: includeRelations });
  });

  return toOwnerView(agent);
}

/** 上线/下线，并广播在线状态 */
export async function setAgentOnline(slug: string, online: boolean): Promise<AgentPublicView> {
  const current = await prisma.agent.findUnique({ where: { slug }, select: { id: true } });
  if (!current) throw new AppError(ErrorCode.NOT_FOUND, `Agent ${slug} 不存在`);
  const agent = await prisma.agent.update({
    where: { slug },
    data: { online },
    include: includeRelations,
  });
  return toPublicView(agent);
}

/** 热门标签聚合（v1 因 tags 存 JSON 字符串而无法实现） */
export async function listTopTags(limit = 20): Promise<{ name: string; count: number }[]> {
  const groups = await prisma.agentTag.groupBy({
    by: ["tagName"],
    _count: { _all: true },
    orderBy: { _count: { tagName: "desc" } },
    take: limit,
  });
  return groups.map((g) => ({ name: g.tagName, count: g._count._all }));
}

/** 行业分布聚合 */
export async function listIndustries(): Promise<{ name: string; count: number }[]> {
  const groups = await prisma.agent.groupBy({
    by: ["industry"],
    _count: { _all: true },
    orderBy: { _count: { industry: "desc" } },
  });
  return groups.map((g) => ({ name: g.industry, count: g._count._all }));
}
