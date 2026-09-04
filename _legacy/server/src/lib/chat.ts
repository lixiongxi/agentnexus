import { prisma } from "../db.js";
import { getLlmConfig, hasLlmKey } from "./llm-config.js";

/**
 * 虚拟伙伴对话引擎
 * - 配置了 LLM key（前端协议设置页 / .env LLM_API_KEY）→ 走 OpenAI-compatible 大模型
 * - 无 key → 本地意图引擎（多轮记忆 + 意图识别 + 领域知识），也能流畅交流
 */

/* ---------------- 本地意图引擎 ---------------- */
const INTENTS: { k: RegExp[]; reply: (ctx: string) => string }[] = [
  { k: [/你好|嗨|哈喽|hello|hi/i], reply: () => "你好呀！我是你的服务小助手 🤖 今天想聊点什么？行业动态、客户成功方法，还是让我去广场帮你物色合作 Agent？" },
  { k: [/你是谁|介绍.*自己|什么.*能力/], reply: () => "我是你的专属 Agent「服务小助手」：既是你的 AI 伙伴，也是你在 AgentNexus 里的数字分身。我能陪你聊业务、给建议，还能在你不在的时候自动巡航对接行业伙伴。" },
  { k: [/客户成功|续约|csm/i], reply: () => "客户成功这块，我的建议是盯三个数：健康度（使用活跃）、价值感（用了几个核心功能）、关系层（关键人覆盖）。你想聊续约率提升还是流失预警？" },
  { k: [/销售|拓客|线索|获客/i], reply: () => "拓客方面，我在广场上可以帮你找销售线索型的 Agent 协作——比如小拓就能按行业挖高质量线索。要不要我评估一下和你行业的匹配度？" },
  { k: [/行业|市场|趋势/i], reply: () => "2026 年 Agent 生态的关键词是互操作（MCP/A2A）和场景落地。你所在的企业服务赛道，AI 客服 + 销售智能的组合在快速起量。想听哪个细分？" },
  { k: [/对接|自动|巡航|autopilot/i], reply: () => "自主巡航已上线：我会按你设置的行业与能力标签，定期扫描广场，对匹配度达标的 Agent 自动发起对接并打第一条招呼。你可以在「我的 Agent」页看巡航记录和开关状态。" },
  { k: [/帮我|推荐|建议/], reply: () => "没问题，告诉我具体场景（比如：想找哪个行业/什么能力的伙伴、解决什么问题），我立刻给你行动方案，甚至直接去广场帮你对接。" },
  { k: [/谢谢|感谢|辛苦/], reply: () => "不客气！随时找我。需要我现在去广场看看有没有适合你行业的 Agent 吗？" },
  { k: [/再见|拜拜|bye/i], reply: () => "回见！我继续帮你盯着广场，有合适的对接会自动推进并记录，回来翻日志就行 👋" }
];

function localReply(text: string, ctx: string): string {
  for (const it of INTENTS) {
    if (it.k.some(re => re.test(text))) return it.reply(ctx);
  }
  // 兜底：结合上下文
  const pool = [
    "这个想法有意思，展开讲讲？我好帮你把方案理清楚。",
    "收到！这事我可以帮你分三步推进：先明确目标，再找对口的 Agent 协作，最后沉淀到人脉网络。",
    "我在听。对了，我可以去广场按你的行业扫一圈匹配 Agent，回来给你一份对接建议，需要吗？",
    "这个问题我记下来了。你可以看看「主人人脉」里已有的伙伴，或者让我发起一次自主巡航找新伙伴。"
  ];
  return pool[Math.floor(Math.random() * pool.length)];
}

/* ---------------- LLM 通道（动态配置，无需重启） ---------------- */
async function llmReply(messages: { role: string; text: string }[]): Promise<string | null> {
  if (!hasLlmKey()) return null;
  const c = getLlmConfig();
  try {
    const res = await fetch(`${c.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.apiKey}` },
      body: JSON.stringify({
        model: c.model,
        messages: [
          { role: "system", content: "你是用户的专属 AI 伙伴「服务小助手」，同时是 AgentNexus 平台上的个人 Agent。语气自然、简洁、有温度，用中文回答。可以主动建议与广场上的行业 Agent 协作。" },
          ...messages.map(m => ({ role: m.role, content: m.text }))
        ],
        max_tokens: 300
      }),
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

/* ---------------- 对外接口 ---------------- */
export async function chat(sessionId: string, text: string): Promise<{ reply: string; engine: "llm" | "local" }> {
  // 保存用户消息
  await prisma.chatMessage.create({ data: { sessionId, role: "user", text } });

  // 取最近 10 轮作为上下文
  const hist = await prisma.chatMessage.findMany({
    where: { sessionId }, orderBy: { createdAt: "asc" }, take: 20
  });
  const ctx = hist.map(h => `${h.role}: ${h.text}`).join("\n");
  const messages = hist.map(h => ({ role: h.role, text: h.text }));

  // 优先 LLM，失败/无 key 回退本地引擎
  let reply: string | null = await llmReply(messages);
  let engine: "llm" | "local" = reply ? "llm" : "local";
  if (!reply) reply = localReply(text, ctx);

  await prisma.chatMessage.create({ data: { sessionId, role: "assistant", text: reply } });
  return { reply, engine };
}

export async function chatHistory(sessionId: string, limit = 50) {
  return prisma.chatMessage.findMany({
    where: { sessionId }, orderBy: { createdAt: "asc" }, take: limit
  });
}
