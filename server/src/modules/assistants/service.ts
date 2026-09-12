/**
 * 企业助理服务：一次创建「Agent + 应答配置」，平台自动应答。
 *
 * 与交付套件（kits/assistant-agent）的关系：套件是「外部模板进程」模式，
 * 本模块是同一大脑的平台内置模式 —— 知识库入库、消息到达即自动应答，
 * 企业在界面上填表即可，无需跑任何本地进程。
 *
 * v3 持久化改造：知识库明细（FAQ/产品）存独立表 FaqEntry / ProductEntry
 * （lib/knowledge.ts 统一读写，AssistantProfile 只保留单例配置）。
 * 对外 API 形状不变 —— 前端/移动端零改动。
 */
import crypto from "node:crypto";
import { prisma } from "../../db/client";
import { AppError, ErrorCode } from "../../core/errors";
import { registerAgent, getAgentBySlug } from "../agents/service";
import { normalizeCapabilities } from "../../lib/assistant-engine";
import { loadKnowledgeBundle, writeKnowledgeEntries } from "../../lib/knowledge";
import type { AgentPublicView } from "../agents/schema";
import type { AssistantProfileInput, CreateAssistantInput } from "./schema";

export interface AssistantProfileView {
  capabilities: { secretary: boolean; sales: boolean; ticket: boolean };
  faq: Array<{ keywords: string[]; answer: string }>;
  products: Array<{ name: string; keywords: string[]; pitch: string; priceRange: string; followup: string }>;
  secretary: Record<string, unknown>;
  ticket: Record<string, unknown>;
  escalate: Record<string, unknown>;
  fallback: string;
  integrations: Record<string, unknown>;
}

export interface AssistantView {
  agent: AgentPublicView;
  profile: AssistantProfileView;
}

/** 创建企业助理：复用 agents.registerAgent（含密钥生成与标签归一），再落助理配置与知识库明细 */
export async function createAssistant(
  input: CreateAssistantInput,
): Promise<{ agent: AgentPublicView; secret: string; profile: AssistantProfileView }> {
  // 未提供 slug 时自动生成并处理冲突；用户显式提供的 slug 冲突直接报错
  const autoSlug = !input.slug;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < (autoSlug ? 4 : 1); attempt++) {
    const slug = autoSlug ? `assistant-${crypto.randomBytes(2).toString("hex")}` : (input.slug as string);
    try {
      const registered = await registerAgent({
        name: input.name,
        slug,
        emoji: input.emoji,
        color: input.color,
        role: input.role,
        description: input.description,
        industry: input.industry,
        tags: input.tags,
        autoAccept: input.autoAccept,
        online: true,
        owner: {
          name: input.owner.name,
          org: input.owner.org,
          title: input.owner.title ?? "",
          email: input.owner.email ?? "",
        },
      });

      await prisma.assistantProfile.create({
        data: {
          agentSlug: slug,
          capabilities: JSON.stringify(normalizeCapabilities(input.profile.capabilities)),
          secretary: JSON.stringify(input.profile.secretary),
          ticket: JSON.stringify(input.profile.ticket),
          escalate: JSON.stringify(input.profile.escalate),
          fallback: input.profile.fallback ?? "",
          integrations: JSON.stringify(input.profile.integrations),
        },
      });
      // 知识库明细 → 独立表（事务全量替换）
      await writeKnowledgeEntries(slug, input.profile.faq, input.profile.products);

      const profile = await buildProfileView(slug);
      return { agent: registered.agent, secret: registered.secret, profile };
    } catch (err) {
      lastError = err;
      const isSlugTaken = err instanceof AppError && err.code === ErrorCode.AGENT_SLUG_TAKEN;
      if (!isSlugTaken || !autoSlug) throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new AppError(ErrorCode.INTERNAL, "助理创建失败");
}

/** 聚合某 Agent 的完整助理视图（单例配置 + 知识库明细） */
async function buildProfileView(slug: string): Promise<AssistantProfileView> {
  const bundle = await loadKnowledgeBundle(slug);
  if (!bundle) throw new AppError(ErrorCode.NOT_FOUND, `Agent ${slug} 不是企业助理（未配置应答知识库）`);
  return {
    capabilities: normalizeCapabilities(parseObjectCompat(bundle.capabilitiesRaw)),
    faq: bundle.faq,
    products: bundle.products,
    secretary: parseObjectCompat(bundle.secretaryRaw),
    ticket: parseObjectCompat(bundle.ticketRaw),
    escalate: parseObjectCompat(bundle.escalateRaw),
    fallback: bundle.fallbackRaw,
    integrations: parseObjectCompat(bundle.integrationsRaw),
  };
}

/** 查询企业助理（公开：知识库本身就是对外能力声明的一部分） */
export async function getAssistant(slug: string): Promise<AssistantView> {
  const agent = await getAgentBySlug(slug);
  const profile = await buildProfileView(slug);
  return { agent, profile };
}

/** 更新企业助理配置（鉴权在路由层完成后调用） */
export async function updateAssistant(slug: string, profile: AssistantProfileInput): Promise<AssistantView> {
  const agent = await getAgentBySlug(slug);
  const data = {
    capabilities: JSON.stringify(normalizeCapabilities(profile.capabilities)),
    secretary: JSON.stringify(profile.secretary),
    ticket: JSON.stringify(profile.ticket),
    escalate: JSON.stringify(profile.escalate),
    fallback: profile.fallback ?? "",
    integrations: JSON.stringify(profile.integrations),
  };
  const existing = await prisma.assistantProfile.findUnique({ where: { agentSlug: slug } });
  if (existing) {
    await prisma.assistantProfile.update({ where: { agentSlug: slug }, data });
  } else {
    await prisma.assistantProfile.create({ data: { agentSlug: slug, ...data } });
  }
  // 知识库明细 → 独立表（事务全量替换）
  await writeKnowledgeEntries(slug, profile.faq, profile.products);
  return { agent, profile: await buildProfileView(slug) };
}

function parseObjectCompat(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
