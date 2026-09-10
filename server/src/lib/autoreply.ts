/**
 * 自动应答调度：平台收到发给某 Agent 的消息后，按优先级生成同步回复：
 *   1) 内置 bot 规则库（bot.ts，平台示范 Agent 的开箱演示兜底）
 *   2) 企业助理配置（AssistantProfile + assistant-engine，界面创建的 Agent）
 *   3) 都未命中 → null（不产生回复，等 Agent 自己/主人处理）
 *
 * 由 messages/service 的 sendMessage 与 receiveA2a 调用，回复同步落库（type="bot"）。
 */
import { prisma } from "../db/client";
import { botReply } from "./bot";
import {
  handleAssistantText,
  normalizeCapabilities,
  normalizeKnowledge,
  type AssistantConfig,
  type AssistantKnowledge,
} from "./assistant-engine";

function parseObject<T extends object>(raw: string): Partial<T> {
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Partial<T>) : {};
  } catch {
    return {};
  }
}

function parseArray<T>(raw: string): T[] {
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

export async function generateAutoReply(toAgent: string, fromAgent: string, text: string): Promise<string | null> {
  // 1) 平台示范 Agent 的静态规则库优先（保持既有演示行为不变）
  const staticReply = botReply(toAgent, fromAgent, text);
  if (staticReply) return staticReply;

  // 2) 企业助理配置驱动的应答
  const profile = await prisma.assistantProfile.findUnique({ where: { agentSlug: toAgent } });
  if (!profile) return null;

  const capabilities = normalizeCapabilities(parseObject(profile.capabilities));
  const integrations = parseObject<{ calendarApiUrl?: string; crmApiUrl?: string; ticketApiUrl?: string }>(
    profile.integrations,
  );
  const knowledge: AssistantKnowledge = normalizeKnowledge({
    faq: parseArray(profile.faq),
    products: parseArray(profile.products),
    secretary: parseObject(profile.secretary),
    ticket: parseObject(profile.ticket),
    escalate: parseObject(profile.escalate),
    fallback: profile.fallback || undefined,
  });
  const cfg: AssistantConfig = { slug: toAgent, capabilities, integrations };

  const { reply } = await handleAssistantText(cfg, knowledge, text);
  return reply || null;
}
