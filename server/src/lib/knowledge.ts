/**
 * 知识库统一加载层（v3 数据持久化改造）：
 *
 * 知识库明细（FAQ/产品）已从 AssistantProfile 的 JSON 列拆分到 FaqEntry / ProductEntry
 * 独立表（结构化，可逐条管理）。本模块是唯一的读取入口：
 *   1. 优先读新表
 *   2. 新表为空而旧 JSON 列有值时回退读 JSON（兼容迁移失败/回滚场景，一个版本周期后移除）
 */
import { prisma } from "../db/client";
import { parseArray, parseObject } from "./json-utils";export interface KnowledgeBundle {
  hasProfile: boolean;
  capabilitiesRaw: string;
  integrationsRaw: string;
  secretaryRaw: string;
  ticketRaw: string;
  escalateRaw: string;
  fallbackRaw: string;
  faq: Array<{ keywords: string[]; answer: string }>;
  products: Array<{ name: string; keywords: string[]; pitch: string; priceRange: string; followup: string }>;
}

/** 加载某 Agent 的完整知识库（新表优先，旧 JSON 回退） */
export async function loadKnowledgeBundle(agentSlug: string): Promise<KnowledgeBundle | null> {
  const profile = await prisma.assistantProfile.findUnique({ where: { agentSlug } });
  if (!profile) return null;

  const [faqEntries, productEntries] = await Promise.all([
    prisma.faqEntry.findMany({ where: { agentSlug }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.productEntry.findMany({ where: { agentSlug }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
  ]);

  const legacyFaq = parseArray<{ keywords: string[]; answer: string }>(profile.faq);
  const legacyProducts = parseArray<{
    name: string;
    keywords: string[];
    pitch: string;
    priceRange: string;
    followup: string;
  }>(profile.products);

  return {
    hasProfile: true,
    capabilitiesRaw: profile.capabilities,
    integrationsRaw: profile.integrations,
    secretaryRaw: profile.secretary,
    ticketRaw: profile.ticket,
    escalateRaw: profile.escalate,
    fallbackRaw: profile.fallback,
    // 新表优先；新表为空且旧列有值时回退（迁移兼容期）
    faq:
      faqEntries.length > 0
        ? faqEntries.map((f) => ({ keywords: f.keywords, answer: f.answer }))
        : legacyFaq,
    products:
      productEntries.length > 0
        ? productEntries.map((p) => ({
            name: p.name,
            keywords: p.keywords,
            pitch: p.pitch,
            priceRange: p.priceRange,
            followup: p.followup,
          }))
        : legacyProducts,
  };
}

/** 写入知识库明细（事务：全量替换该 Agent 的 FAQ/产品条目） */
export async function writeKnowledgeEntries(
  agentSlug: string,
  faq: Array<{ keywords: string[]; answer: string }>,
  products: Array<{ name: string; keywords: string[]; pitch: string; priceRange: string; followup: string }>,
): Promise<void> {
  await prisma.$transaction([
    prisma.faqEntry.deleteMany({ where: { agentSlug } }),
    prisma.productEntry.deleteMany({ where: { agentSlug } }),
    prisma.faqEntry.createMany({
      data: faq.map((f, i) => ({ agentSlug, keywords: f.keywords, answer: f.answer, sortOrder: i })),
    }),
    prisma.productEntry.createMany({
      data: products.map((p, i) => ({
        agentSlug,
        name: p.name,
        keywords: p.keywords,
        pitch: p.pitch ?? "",
        priceRange: p.priceRange ?? "",
        followup: p.followup ?? "",
        sortOrder: i,
      })),
    }),
  ]);
}

export { parseArray, parseObject };
