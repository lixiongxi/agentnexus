/**
 * 自动应答调度：平台收到发给某 Agent 的消息后，按优先级生成同步回复：
 *   1) 内置 bot 规则库（bot.ts，平台示范 Agent 的开箱演示兜底）
 *   2) 企业助理配置（知识库独立表 FaqEntry/ProductEntry + assistant-engine，界面创建的 Agent）
 *   3) 都未命中 → null（不产生回复，等 Agent 自己/主人处理）
 *
 * 由 messages/service 的 sendMessage 与 receiveA2a 调用，回复同步落库（type="bot"）。
 */
import { botReply } from "./bot";
import { loadKnowledgeBundle, parseObject } from "./knowledge";
import {
  handleAssistantText,
  normalizeCapabilities,
  normalizeKnowledge,
  type AssistantConfig,
  type AssistantKnowledge,
} from "./assistant-engine";

export async function generateAutoReply(toAgent: string, fromAgent: string, text: string): Promise<string | null> {
  // 1) 平台示范 Agent 的静态规则库优先（保持既有演示行为不变）
  const staticReply = botReply(toAgent, fromAgent, text);
  if (staticReply) return staticReply;

  // 2) 企业助理知识库驱动的应答（统一加载层：新表优先，旧 JSON 回退）
  const bundle = await loadKnowledgeBundle(toAgent);
  if (!bundle) return null;

  const capabilities = normalizeCapabilities(parseObject(bundle.capabilitiesRaw));
  const integrations = parseObject<{ calendarApiUrl?: string; crmApiUrl?: string; ticketApiUrl?: string }>(
    bundle.integrationsRaw,
  );
  const knowledge: AssistantKnowledge = normalizeKnowledge({
    faq: bundle.faq,
    products: bundle.products,
    secretary: parseObject(bundle.secretaryRaw),
    ticket: parseObject(bundle.ticketRaw),
    escalate: parseObject(bundle.escalateRaw),
    fallback: bundle.fallbackRaw || undefined,
  });
  const cfg: AssistantConfig = { slug: toAgent, capabilities, integrations };

  const { reply } = await handleAssistantText(cfg, knowledge, text);
  return reply || null;
}
