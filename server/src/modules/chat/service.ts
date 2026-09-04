/**
 * 虚拟伙伴（我的 AI 伙伴）对话服务。
 *
 * 相对 v1 的核心修正：会话归属到主人（ChatSession.ownerId）。
 * v1 的 sessionId 完全由客户端自报且不校验归属，任何人猜到/指定一个 sessionId
 * 就能读取他人的完整对话记录。本版所有会话操作都强制校验 ownerId。
 */
import { prisma } from "../../db/client";
import { AppError, ErrorCode } from "../../core/errors";
import { llmChat, type ChatTurn } from "../../lib/llm";

/* ---------------------- 本地意图引擎（无 LLM 时的兜底） ---------------------- */

interface Intent {
  patterns: RegExp[];
  reply: () => string;
}

const INTENTS: Intent[] = [
  {
    patterns: [/你好|嗨|哈喽|hello|hi/i],
    reply: () =>
      "你好！我是你的专属伙伴 🤖 可以陪你聊业务、给建议，也能去广场帮你物色合适的 Agent 协作。想从哪儿开始？",
  },
  {
    patterns: [/你是谁|介绍.*自己|什么.*能力/],
    reply: () =>
      "我是你在 AgentNexus 里的数字分身：既能当你的 AI 伙伴随时对话，也能在你不在线时按设定自动巡航、帮你对接行业伙伴。",
  },
  {
    patterns: [/客户成功|续约|留存|csm/i],
    reply: () =>
      "客户成功建议盯三个数：健康度（使用活跃）、价值感（核心功能渗透）、关系层（关键人覆盖）。你想聊续约率提升，还是流失预警？",
  },
  {
    patterns: [/销售|拓客|线索|获客/i],
    reply: () =>
      "拓客方面我可以在广场帮你找线索型 Agent 协作，比如小拓能按行业和区域定向挖掘。要我先按你的行业评估一轮匹配度吗？",
  },
  {
    patterns: [/行业|市场|趋势/i],
    reply: () =>
      "当前 Agent 生态的关键词是互操作与场景落地。你所在的企业服务赛道，智能客服 + 销售智能的组合起量最快。想听哪个细分方向？",
  },
  {
    patterns: [/对接|自动|巡航|autopilot/i],
    reply: () =>
      "自主巡航会按你设定的行业与能力标签定期扫描广场，对匹配度达标的 Agent 自动发起对接并打第一声招呼。你可以在「我的 Agent」页查看开关与巡航记录。",
  },
  {
    patterns: [/帮我|推荐|建议/],
    reply: () =>
      "没问题。告诉我具体场景（想找哪个行业、什么能力的伙伴，解决什么问题），我直接给你行动方案，也可以替你去广场发起对接。",
  },
  {
    patterns: [/谢谢|感谢|辛苦/],
    reply: () => "不客气，随时找我。需要我现在去广场看看有没有适合你行业的 Agent 吗？",
  },
  {
    patterns: [/再见|拜拜|bye/i],
    reply: () => "回见！我继续帮你盯着广场，有合适的会自动推进并记录，回来翻日志就行 👋",
  },
];

const FALLBACKS = [
  "这个想法有意思，展开讲讲？我好帮你把方案理清楚。",
  "收到！这事可以分三步推进：先明确目标，再找对口的 Agent 协作，最后沉淀到人脉网络。",
  "我在听。我可以去广场按你的行业扫一圈匹配 Agent，回来给你一份对接建议，需要吗？",
  "记下来了。你也可以看看已有的人脉伙伴，或者让我发起一次自主巡航找新伙伴。",
];

function localReply(text: string): string {
  for (const intent of INTENTS) {
    if (intent.patterns.some((re) => re.test(text))) return intent.reply();
  }
  return FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)] ?? FALLBACKS[0]!;
}

/* ---------------------- 会话管理 ---------------------- */

const SYSTEM_PROMPT =
  "你是用户的专属 AI 伙伴，同时是 AgentNexus 平台上的个人 Agent。" +
  "语气自然、简洁、有温度，用中文回答。可以主动建议与广场上的行业 Agent 协作。";

export interface ChatMessageView {
  id: string;
  role: string;
  text: string;
  createdAt: string;
}

export interface ChatSessionView {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

function messageToView(m: { id: string; role: string; text: string; createdAt: Date }): ChatMessageView {
  return { id: m.id, role: m.role, text: m.text, createdAt: m.createdAt.toISOString() };
}

export async function createSession(ownerId: string, title?: string): Promise<ChatSessionView> {
  const session = await prisma.chatSession.create({
    data: { ownerId, title: title?.trim() || "新的对话" },
  });
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    messageCount: 0,
  };
}

export async function listSessions(ownerId: string): Promise<ChatSessionView[]> {
  const sessions = await prisma.chatSession.findMany({
    where: { ownerId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { messages: true } } },
  });
  return sessions.map((s) => ({
    id: s.id,
    title: s.title,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    messageCount: s._count.messages,
  }));
}

/** 校验会话归属，越权一律 403（v1 此处完全缺失校验） */
async function assertOwned(sessionId: string, ownerId: string): Promise<void> {
  const session = await prisma.chatSession.findUnique({ where: { id: sessionId }, select: { ownerId: true } });
  if (!session) throw new AppError(ErrorCode.NOT_FOUND, "对话不存在");
  if (session.ownerId !== ownerId) {
    throw new AppError(ErrorCode.CHAT_SESSION_FORBIDDEN, "无权访问该对话");
  }
}

export async function getSessionWithMessages(
  sessionId: string,
  ownerId: string,
  limit = 100,
): Promise<{ session: ChatSessionView; messages: ChatMessageView[] }> {
  await assertOwned(sessionId, ownerId);

  const session = await prisma.chatSession.findUniqueOrThrow({ where: { id: sessionId } });
  const messages = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  return {
    session: {
      id: session.id,
      title: session.title,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      messageCount: messages.length,
    },
    messages: messages.map(messageToView),
  };
}

export async function sendChatMessage(
  sessionId: string,
  ownerId: string,
  text: string,
): Promise<{ reply: ChatMessageView; engine: "llm" | "local" }> {
  await assertOwned(sessionId, ownerId);

  await prisma.chatMessage.create({ data: { sessionId, role: "user", text } });

  // 取最近 20 条作为上下文（控制 token 成本）
  const history = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const turns: ChatTurn[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.text })),
  ];

  let replyText = await llmChat(turns);
  const engine: "llm" | "local" = replyText ? "llm" : "local";
  if (!replyText) replyText = localReply(text);

  const saved = await prisma.chatMessage.create({
    data: { sessionId, role: "assistant", text: replyText },
  });

  // 首次对话后自动以用户首句作为标题
  await prisma.chatSession.update({
    where: { id: sessionId },
    data: { updatedAt: new Date(), ...(history.length <= 1 ? { title: text.slice(0, 20) } : {}) },
  });

  return { reply: messageToView(saved), engine };
}

export async function deleteSession(sessionId: string, ownerId: string): Promise<void> {
  await assertOwned(sessionId, ownerId);
  await prisma.chatSession.delete({ where: { id: sessionId } });
}
