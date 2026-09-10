/**
 * 企业助理应答引擎 —— 交付套件（kits/assistant-agent）大脑的平台内置版。
 *
 * 三类能力（capabilities 开关）：秘书（会议预约/提醒）/ 客服（FAQ/工单/转人工）/ 销售（产品推荐/报价/线索登记）。
 * 知识库来自 AssistantProfile（界面创建），不再依赖外部文件与进程：
 *   消息到达 → 意图识别 → 处理器 → 回复文本，由 messages/service 的自动应答链同步落库。
 *
 * 外部集成（calendar/crm/ticket API）：配置了真实地址则先真实调用（失败静默降级），
 * 未配置时用内置 mock 生成编号回执（CAL-/LEAD-/TCK-），保证开箱可演示。
 */
import crypto from "node:crypto";

/* ---------------- 类型 ---------------- */

export interface AssistantCapabilities {
  secretary: boolean;
  sales: boolean;
  ticket: boolean;
}

export interface FaqEntry {
  keywords: string[];
  answer: string;
}

export interface ProductEntry {
  name: string;
  keywords: string[];
  pitch: string;
  priceRange: string;
  followup: string;
}

export interface SecretaryConfig {
  workDays: number[];
  workHours: { start: string; end: string };
  bookable: string[];
  bookedReply: string;
  outsideWork: string;
  needTime: string;
  reminderReply: string;
}

export interface TicketConfig {
  askMore: string;
  createdReply: string;
}

export interface EscalateConfig {
  reply: string;
}

export interface AssistantKnowledge {
  faq: FaqEntry[];
  products: ProductEntry[];
  secretary: SecretaryConfig;
  ticket: TicketConfig;
  escalate: EscalateConfig;
  fallback: string;
}

export interface AssistantIntegrations {
  calendarApiUrl?: string;
  crmApiUrl?: string;
  ticketApiUrl?: string;
}

export interface AssistantConfig {
  slug: string;
  capabilities: AssistantCapabilities;
  integrations: AssistantIntegrations;
}

export type AssistantIntent = "faq" | "schedule" | "sales" | "ticket" | "escalate" | "chat";

/* ---------------- 默认值归一化（界面允许只填部分内容） ---------------- */

const DEFAULT_SECRETARY: SecretaryConfig = {
  workDays: [1, 2, 3, 4, 5],
  workHours: { start: "09:00", end: "18:00" },
  bookable: ["会议"],
  bookedReply: "📅 已为您预约「{title}」，时间：{time}。日程编号 {eventId}，开始前 30 分钟会提醒参会人。如需改期直接告诉我。",
  outsideWork: "提示：您预约的时间 {time} 在工作时间之外，我可以先登记，是否继续？",
  needTime: "好的，请问想约哪一天、几点？例如「明天下午 3 点」。另外请告诉我事项主题。",
  reminderReply: "⏰ 提醒已设置（{time}）：{title}。日程编号 {eventId}。",
};

const DEFAULT_TICKET: TicketConfig = {
  askMore: "收到，为了更快定位问题，请补充：产品名称 + 问题现象 + 联系电话。我会为您生成工单编号。",
  createdReply: "🎫 工单已创建，编号 {ticketId}。工程师将在 2 小时内（工作时间）与您联系，处理进度会同步到这里。",
};

const DEFAULT_ESCALATE: EscalateConfig = {
  reply:
    "好的，已为您转接人工服务。我们的工作人员将在工作时间尽快联系您；非工作时间已生成优先工单，会在下一个工作日第一时间处理。",
};

const DEFAULT_FALLBACK =
  "我是企业智能助理，可以帮您：\n• 解答产品与售后问题（直接提问）\n• 预约会议 / 设置提醒（如「明天下午3点约个会」）\n• 产品推荐与报价（如「有什么产品」）\n• 登记报修工单 / 线索（如「报修」「登记线索」）\n• 转人工（回复「转人工」）\n请问需要哪项服务？";

/** 部分配置 + 默认值 → 完整知识库（引擎与 API 层共用） */
export function normalizeKnowledge(partial: {
  faq?: FaqEntry[];
  products?: ProductEntry[];
  secretary?: Partial<SecretaryConfig>;
  ticket?: Partial<TicketConfig>;
  escalate?: Partial<EscalateConfig>;
  fallback?: string;
}): AssistantKnowledge {
  return {
    faq: partial.faq ?? [],
    products: partial.products ?? [],
    secretary: { ...DEFAULT_SECRETARY, ...(partial.secretary ?? {}) },
    ticket: { ...DEFAULT_TICKET, ...(partial.ticket ?? {}) },
    escalate: { ...DEFAULT_ESCALATE, ...(partial.escalate ?? {}) },
    fallback: partial.fallback?.trim() || DEFAULT_FALLBACK,
  };
}

export function normalizeCapabilities(partial?: Partial<AssistantCapabilities>): AssistantCapabilities {
  return {
    secretary: partial?.secretary ?? true,
    sales: partial?.sales ?? true,
    ticket: partial?.ticket ?? true,
  };
}

/* ---------------- 意图识别（优先级从高到低，包含匹配） ---------------- */

const TRIGGERS: Record<Exclude<AssistantIntent, "faq" | "chat">, string[]> = {
  escalate: ["转人工", "人工客服", "找你们领导", "投诉到底", "真人"],
  schedule: ["预约", "约个", "约一个", "约会议", "安排会议", "日程", "提醒我", "帮我提醒", "订会议", "约个会"],
  sales: ["有什么产品", "产品介绍", "产品推荐", "推荐", "报价", "多少钱", "价格", "购买", "采购", "线索", "想买"],
  ticket: ["报修", "登记问题", "登记故障", "投诉", "工单", "故障", "坏了"],
};

export function classifyIntent(text: string, knowledge: AssistantKnowledge): AssistantIntent {
  const t = String(text || "");
  if (TRIGGERS.escalate.some((w) => t.includes(w))) return "escalate";
  if (TRIGGERS.schedule.some((w) => t.includes(w))) return "schedule";
  if (TRIGGERS.sales.some((w) => t.includes(w))) return "sales";
  if (TRIGGERS.ticket.some((w) => t.includes(w))) return "ticket";
  if (knowledge.faq.some((f) => f.keywords.some((k) => t.includes(k)))) return "faq";
  return "chat";
}

/* ---------------- 中文时间短语解析（高频表达；失败交回反问） ---------------- */

const CN_NUM: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const DAY_OFFSET: Record<string, number> = { 今天: 0, 今日: 0, 明天: 1, 明日: 1, 后天: 2 };

export interface ParsedTime {
  ok: boolean;
  when?: Date;
  label?: string;
}

export function parseTimePhrase(text: string, now = new Date()): ParsedTime {
  const m = text.match(/(今天|今日|明天|明日|后天)?\s*(上午|早上|中午|下午|晚上)?\s*([0-9一二两三四五六七八九十]+)\s*[点:：]\s*(半|30)?/);
  if (!m) return { ok: false };

  const dayWord = m[1] ?? "今天";
  const half = m[2] ?? "";
  const hourRaw = m[3] ?? "";
  let hour = /^\d+$/.test(hourRaw) ? Number(hourRaw) : (hourRaw.split("").map((c) => CN_NUM[c]).find((n) => n !== undefined) ?? NaN);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return { ok: false };
  const minute = m[4] ? 30 : 0;
  if ((half === "下午" || half === "晚上") && hour < 12) hour += 12;

  const when = new Date(now);
  when.setDate(when.getDate() + (DAY_OFFSET[dayWord] ?? 0));
  when.setHours(hour, minute, 0, 0);
  // 预约语义：任何已过去的时刻都顺延到下一次出现（如上午 9 点说「今天上午 8 点」→ 明天 8 点）
  if (when.getTime() <= now.getTime()) when.setDate(when.getDate() + 1);

  const pad = (n: number) => String(n).padStart(2, "0");
  const week = "周" + "日一二三四五六"[when.getDay()];
  return {
    ok: true,
    when,
    label: `${when.getMonth() + 1}月${when.getDate()}日（${week}）${pad(when.getHours())}:${pad(when.getMinutes())}`,
  };
}

/* ---------------- 外部系统 adapter（真实优先，失败降级 mock） ---------------- */

async function callExternal(url: string | undefined, tokenEnv: string, payload: Record<string, unknown>): Promise<string | null> {
  if (!url) return null;
  const token = process.env[tokenEnv];
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id?: string };
    return data?.id ? String(data.id) : newId("EXT");
  } catch {
    return null;
  }
}

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function fill(tpl: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, v), tpl);
}

/* ---------------- 处理器 ---------------- */

const HANDLERS: Record<AssistantIntent, (cfg: AssistantConfig, k: AssistantKnowledge, text: string) => Promise<string>> = {
  async faq(_cfg, k, text) {
    const hit = k.faq.find((f) => f.keywords.some((kw) => text.includes(kw)));
    return hit?.answer ?? HANDLERS.chat(_cfg, k, text);
  },

  async schedule(cfg, k, text) {
    if (!cfg.capabilities.secretary) return HANDLERS.chat(cfg, k, text);
    const sec = k.secretary;
    const isReminder = /提醒/.test(text);
    const parsed = parseTimePhrase(text);
    if (!parsed.ok || !parsed.when || !parsed.label) return sec.needTime;

    const [sh = 9, sm0 = 0] = sec.workHours.start.split(":").map(Number);
    const [eh = 18] = sec.workHours.end.split(":").map(Number);
    const minutes = parsed.when.getHours() * 60 + parsed.when.getMinutes();
    const inWindow =
      sec.workDays.includes(parsed.when.getDay()) && minutes >= sh * 60 + sm0 && minutes <= eh * 60;

    const titleMatch = text.match(/(?:约|预约|安排)(?:一个|一场|个)?(.+?)(?:会议|会|$)/);
    const title = (titleMatch?.[1] ?? "").trim().slice(0, 12) || sec.bookable[0] || "会议";

    const eventId =
      (await callExternal(cfg.integrations.calendarApiUrl, "CALENDAR_TOKEN", {
        type: isReminder ? "reminder" : "meeting",
        title,
        when: parsed.when.toISOString(),
      })) ?? newId("CAL");

    const vars = { time: parsed.label, title, eventId };
    if (isReminder) return fill(sec.reminderReply, vars);
    return (inWindow ? "" : fill(sec.outsideWork, vars) + "\n") + fill(sec.bookedReply, vars);
  },

  async sales(cfg, k, text) {
    if (!cfg.capabilities.sales) return HANDLERS.chat(cfg, k, text);
    const products = k.products;

    // 线索登记：含手机号或明确「线索」字样
    const phone = text.match(/1[3-9]\d{9}/);
    if (phone || /登记.{0,6}线索|线索.{0,4}登记/.test(text)) {
      const nameMatch = text.match(/([\u4e00-\u9fa5]{2,4})(?:总|经理|先生|女士)/);
      const leadId =
        (await callExternal(cfg.integrations.crmApiUrl, "CRM_TOKEN", {
          type: "lead",
          name: nameMatch?.[0] ?? "未署名客户",
          phone: phone?.[0] ?? "",
          raw: text,
          source: "assistant-engine",
        })) ?? newId("LEAD");
      return `✅ 线索已登记，编号 ${leadId}。销售顾问将在 1 个工作日内与客户联系。`;
    }

    const hits = products.filter((p) => p.keywords.some((kw) => text.includes(kw)));
    if (hits.length === 0) {
      if (products.length === 0) {
        // 未配置产品库：价格类问题常见于 FAQ，先查知识库再兜底
        const hit = k.faq.find((f) => f.keywords.some((kw) => text.includes(kw)));
        if (hit) return hit.answer;
        return HANDLERS.chat(cfg, k, text);
      }
      return (
        "我们主要产品线如下，您可以回复产品名了解详情：\n" +
        products.map((p) => `• ${p.name}：${p.pitch}`).join("\n") +
        (products[0]?.followup ? `\n${products[0].followup}` : "")
      );
    }
    return hits
      .map((p) => `【${p.name}】\n${p.pitch}\n【参考报价】${p.priceRange}${p.followup ? `\n${p.followup}` : ""}`)
      .join("\n\n");
  },

  async ticket(cfg, k, text) {
    if (!cfg.capabilities.ticket) return HANDLERS.chat(cfg, k, text);
    const hasDetail = /\d{11}|已经|就是|现象/.test(text) || text.length > 18;
    if (!hasDetail) return k.ticket.askMore;
    const ticketId =
      (await callExternal(cfg.integrations.ticketApiUrl, "TICKET_TOKEN", { type: "ticket", raw: text })) ?? newId("TCK");
    return fill(k.ticket.createdReply, { ticketId });
  },

  async escalate(_cfg, k) {
    return k.escalate.reply;
  },

  async chat(_cfg, k) {
    return k.fallback;
  },
};

/** 统一入口：意图识别 → 处理器 → 回复 */
export async function handleAssistantText(
  cfg: AssistantConfig,
  knowledge: AssistantKnowledge,
  text: string,
): Promise<{ intent: AssistantIntent; reply: string }> {
  const intent = classifyIntent(text, knowledge);
  const reply = await HANDLERS[intent](cfg, knowledge, text);
  return { intent, reply };
}
