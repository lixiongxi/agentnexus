/**
 * 个人端服务层：登记 → 发布 Agent（能力声明）→ 服务清单 / 案例 → 统计汇总
 *
 * 统计口径（供撮合排序使用）：
 *   completedCases  已完成案例数（平台成交自动沉淀 + 用户补充的历史案例）
 *   avgCaseRating   案例平均评分（有评分案例的均值）
 *   reputation      信誉分 0-100：评分(60%) + 履约率(30%) + 案例量(10%)
 */
import crypto from "node:crypto";
import { prisma } from "../../db/client";
import { AppError, ErrorCode } from "../../core/errors";
import { registerOwner } from "../auth/service";
import { registerAgent } from "../agents/service";
import { addManualCase, recalcAgentStats } from "../market/stats";
import type { CaseItemInput, PersonalRegisterInput, PublishAgentInput } from "./schema";

/* ---------------- 注册登记 ---------------- */

export interface RegisterPersonalResult {
  token: string;
  profile: {
    id: string;
    name: string;
    email: string | null;
    city: string;
    bio: string;
    domains: string[];
  };
  agent: { slug: string; secret: string; name: string; publishStatus: string };
  next: "publish-agent"; // 前端据此跳转到「发布 Agent」页
}

/**
 * 个人端注册登记：创建个人账号 + 自动生成「未发布」的 Agent 骨架。
 * 用户随后在「发布个人 Agent」页补全能力声明（服务清单 / 案例）并发布。
 */
export async function registerPersonal(input: PersonalRegisterInput): Promise<RegisterPersonalResult> {
  const { token, profile } = await registerOwner({
    name: input.name,
    email: input.email,
    password: input.password,
    city: input.city ?? "",
    bio: input.bio ?? "",
    domains: input.domains ?? [],
  });

  // Agent 名称默认取昵称（个人端：一人一 Agent）
  const registered = await registerAgent({
    name: input.name,
    slug: `me-${crypto.randomBytes(3).toString("hex")}`,
    emoji: "🙋",
    color: "#4F6BFF",
    role: input.domains?.[0] ? `${input.domains[0]}方向创作者` : "待完善定位",
    description: input.bio ?? "",
    industry: input.domains?.[0] ?? "个人服务",
    tags: input.domains ?? [],
    autoAccept: true,
    online: true,
    owner: { name: input.name, title: "", email: input.email },
  });

  // 登记时以「擅长领域」初始化能力标签，服务清单与案例留待发布页填写
  await prisma.agent.update({
    where: { slug: registered.agent.slug },
    data: { publishStatus: "draft", serviceIntro: input.bio ?? "" },
  });

  return {
    token,
    profile,
    agent: {
      slug: registered.agent.slug,
      secret: registered.secret,
      name: registered.agent.name,
      publishStatus: "draft",
    },
    next: "publish-agent",
  };
}

/* ---------------- 发布 / 编辑个人 Agent ---------------- */

export async function publishAgent(slug: string, input: PublishAgentInput): Promise<AbilityProfileView> {
  const agent = await prisma.agent.findUnique({ where: { slug } });
  if (!agent) throw new AppError(ErrorCode.NOT_FOUND, `Agent ${slug} 不存在`);

  await prisma.$transaction(async (tx) => {
    await tx.agent.update({
      where: { slug },
      data: {
        name: input.name,
        emoji: input.emoji || "🙋",
        role: input.role,
        description: input.serviceIntro.slice(0, 200),
        serviceIntro: input.serviceIntro,
        acceptingOrders: input.acceptingOrders ?? true,
        publishStatus: input.publish ? "published" : "draft",
      },
    });

    // 服务清单：全量替换（发布页提交即视为最新）
    await tx.agentService.deleteMany({ where: { agentSlug: slug } });
    if (input.services.length > 0) {
      await tx.agentService.createMany({
        data: input.services.map((s, i) => ({
          agentSlug: slug,
          title: s.title,
          tags: JSON.stringify(s.tags),
          deliverable: s.deliverable ?? "",
          priceRange: s.priceRange ?? "",
          cycleDays: s.cycleDays ?? 3,
          intro: s.intro ?? "",
          sortOrder: i,
        })),
      });
    }

    // 能力标签（复用 Tag / AgentTag 关联表，供能力广场检索与匹配召回）
    await tx.agentTag.deleteMany({ where: { agentId: agent.id } });
    for (const name of input.domains) {
      await tx.tag.upsert({ where: { name }, create: { name }, update: {} });
      await tx.agentTag.create({ data: { agentId: agent.id, tagName: name } });
    }
  });

  // 历史案例（去重：同标题跳过）
  for (const c of input.cases) {
    await addManualCase(slug, c);
  }

  await recalcAgentStats(slug);
  return getAbilityProfile(slug);
}

/* ---------------- 能力名片（公开） ---------------- */

export interface AbilityProfileView {
  agent: {
    slug: string;
    name: string;
    emoji: string;
    role: string;
    serviceIntro: string;
    publishStatus: string;
    acceptingOrders: boolean;
    online: boolean;
    tags: string[];
    completedCases: number;
    avgCaseRating: number;
    reputation: number;
    ownerName: string | null;
    ownerCity: string | null;
  };
  services: Array<{
    title: string;
    tags: string[];
    deliverable: string;
    priceRange: string;
    cycleDays: number;
    intro: string;
  }>;
  cases: Array<{ title: string; summary: string; tags: string[]; rating: number; completedAt: Date; source: string }>;
}

export async function getAbilityProfile(slug: string): Promise<AbilityProfileView> {
  const agent = await prisma.agent.findUnique({
    where: { slug },
    include: { tags: true, owner: { select: { name: true, city: true } } },
  });
  if (!agent) throw new AppError(ErrorCode.NOT_FOUND, `Agent ${slug} 不存在`);

  const [services, cases] = await Promise.all([
    prisma.agentService.findMany({ where: { agentSlug: slug }, orderBy: { sortOrder: "asc" } }),
    prisma.serviceCase.findMany({ where: { agentSlug: slug }, orderBy: { completedAt: "desc" }, take: 50 }),
  ]);

  const parseArr = (raw: string): string[] => {
    try {
      const v = JSON.parse(raw) as unknown;
      return Array.isArray(v) ? (v as string[]) : [];
    } catch {
      return [];
    }
  };

  return {
    agent: {
      slug: agent.slug,
      name: agent.name,
      emoji: agent.emoji,
      role: agent.role,
      serviceIntro: agent.serviceIntro,
      publishStatus: agent.publishStatus,
      acceptingOrders: agent.acceptingOrders,
      online: agent.online,
      tags: agent.tags.map((t) => t.tagName),
      completedCases: agent.completedCases,
      avgCaseRating: agent.avgCaseRating,
      reputation: agent.reputation,
      ownerName: agent.owner?.name ?? null,
      ownerCity: agent.owner?.city || null,
    },
    services: services.map((s) => ({
      title: s.title,
      tags: parseArr(s.tags),
      deliverable: s.deliverable,
      priceRange: s.priceRange,
      cycleDays: s.cycleDays,
      intro: s.intro,
    })),
    cases: cases.map((c) => ({
      title: c.title,
      summary: c.summary,
      tags: parseArr(c.tags),
      rating: c.rating,
      completedAt: c.completedAt,
      source: c.source,
    })),
  };
}

/** 补充一条历史案例（个人发帖能力展示） */
export async function addCase(slug: string, input: CaseItemInput): Promise<{ added: boolean; completedCases: number }> {
  const added = await addManualCase(slug, input);
  await recalcAgentStats(slug);
  const agent = await prisma.agent.findUniqueOrThrow({ where: { slug }, select: { completedCases: true } });
  return { added, completedCases: agent.completedCases };
}

/** 切换接单状态 */
export async function setAcceptingOrders(slug: string, accepting: boolean): Promise<{ acceptingOrders: boolean }> {
  await prisma.agent.update({ where: { slug }, data: { acceptingOrders: accepting } });
  return { acceptingOrders: accepting };
}
