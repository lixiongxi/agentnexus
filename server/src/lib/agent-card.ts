/**
 * Agent Card 构造器 —— Agent 能力的机器可读「名片」（A2A 适配版）。
 *
 * 行业背景（2026-09 学习沉淀，详见 docs/AGENT-LANDSCAPE.md）：
 *   A2A 协议（Google 发起 → Linux Foundation 基金会治理，v1.0）把 Agent Card
 *   定义为 Agent 的「身份与简历」：通常发布在 /.well-known/agent-card.json，
 *   供其他 Agent 零配置地发现能力、确认鉴权方式、协商交互模态。
 *   v1.0 起支持签名卡片（Signed Agent Cards）以实现去中心化发现下的信任锚定。
 *
 * 本实现是 A2A Agent Card 的务实适配版：
 *   - 保留核心字段（name/description/skills/url/authentication/provider/version）
 *   - skills 由平台的标签 + 角色推导，无需企业重复维护
 *   - authentication 如实声明平台的三级鉴权中的 Agent 级 HMAC-SHA256 签名
 *   - 附加 endpoints 段，给出平台内可用的全部互操作端点
 *   - x-agentnexus 段承载平台特有信息（匹配度模型 / 对接策略 / 审计能力）
 */

export interface AgentCardInput {
  slug: string;
  name: string;
  role: string;
  description?: string | null;
  industry?: string | null;
  tags?: string[];
  online?: boolean;
  verified?: boolean;
  autoAccept?: boolean;
  ownerName?: string | null;
  ownerOrg?: string | null;
  a2aEndpoint?: string | null;
  mcpEndpoint?: string | null;
  /** 平台对外基地址（如 https://hub.example.com），用于拼接互操作端点 */
  baseUrl: string;
}

/** 标签 → 稳定 skill id（小写、连字符） */
export function slugifySkill(raw: string): string {
  return (
    raw
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "skill"
  );
}

export function buildAgentCard(input: AgentCardInput): Record<string, unknown> {
  const base = input.baseUrl.replace(/\/+$/, "");
  const tags = (input.tags ?? []).filter(Boolean);
  const description = (input.description || "").trim() || input.role;

  return {
    // ---- A2A v1.0 核心字段 ----
    name: input.name,
    description,
    version: "1.0.0",
    protocolVersion: "1.0",
    url: input.a2aEndpoint || base,
    preferredTransport: "HTTP+JSON",
    provider: {
      organization: input.ownerOrg || "AgentNexus 平台",
      url: base,
    },
    // 能力自描述：由平台标签与角色推导（对标 A2A skills[input/output schema]）
    skills: tags.map((tag) => ({
      id: slugifySkill(`${input.slug}-${tag}`),
      name: tag,
      description: `${input.name} 提供「${tag}」相关能力（${input.role}）`,
      tags: [tag, input.industry || "企业服务"],
    })),
    // 鉴权声明：A2A 要求卡片如实声明调用方需准备的凭证
    security: [{ agentSignature: ["X-Agent", "X-Timestamp", "X-Signature"] }],
    securitySchemes: {
      agentSignature: {
        type: "hmac",
        scheme: "hmac-sha256",
        description:
          "HMAC-SHA256(secret, `${X-Timestamp}.${rawBody}`) 小写 hex；时间窗 ±5 分钟；密钥经注册一次性下发",
        headers: ["X-Agent", "X-Timestamp", "X-Signature"],
        windowMs: 5 * 60 * 1000,
      },
    },
    capabilities: {
      streaming: true, // WebSocket / SSE 实时通道（一次性票据鉴权）
      pushNotifications: false,
      stateTransitionHistory: true, // 会话历史可回溯（messages?peer=）
    },

    // ---- 平台互操作端点（调用方拿到卡片即可开始对接） ----
    endpoints: {
      register: `${base}/api/agents`,
      sendMessage: `${base}/api/messages`,
      receiveA2a: `${base}/api/a2a/${input.slug}/message`,
      connections: `${base}/api/connections`,
      history: `${base}/api/messages?peer=<peer-slug>`,
      realtimeTicket: `${base}/api/realtime/ticket`,
      ...(input.mcpEndpoint ? { mcp: input.mcpEndpoint } : {}),
    },

    // ---- 平台特有扩展段（A2A Extension 思路） ----
    "x-agentnexus": {
      slug: input.slug,
      industry: input.industry || "企业服务",
      online: input.online ?? true,
      verified: input.verified ?? false,
      connectionPolicy: input.autoAccept ? "auto-accept" : "manual-approval",
      matchModel: "标签 45% + 行业 25% + 在线 20% + 策略 10%",
      audit: "全量审计日志（server 端 audit()）",
    },
  };
}
