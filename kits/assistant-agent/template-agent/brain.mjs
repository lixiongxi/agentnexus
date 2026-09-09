/**
 * brain.mjs —— 全能企业助理的「大脑」：意图识别 + 能力处理器 + 外部系统适配。
 *
 * 三类能力（可在 agent.json 的 capabilities 中开关）：
 *   secretary —— 会议预约 / 提醒（日历 adapter，默认 mock）
 *   sales     —— 产品推荐 / 报价 / 线索登记（CRM adapter，默认 mock）
 *   ticket    —— 问题登记 / 转人工（工单 adapter，默认 mock）
 *
 * 外部 adapter 约定：agent.json 的 integrations.*ApiUrl 配置了真实地址则
 * 先尝试真实调用（POST JSON，Authorization: Bearer <对应 TOKEN 环境变量>），
 * 失败时静默降级为 mock 回执 —— 保证演示永远不因外部系统而中断。
 */
import crypto from "node:crypto";

const CN_NUM = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const DAY_OFFSET = { 今天: 0, 今日: 0, 明天: 1, 明日: 1, 后天: 2 };

function newId(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

/* ================= 意图识别（优先级从高到低，均为包含匹配） ================= */

const TRIGGERS = {
  escalate: ["转人工", "人工客服", "找你们领导", "投诉到底", "真人"],
  schedule: ["预约", "约个", "约一个", "约会议", "安排会议", "日程", "提醒我", "帮我提醒", "订会议", "约个会"],
  sales: ["有什么产品", "产品介绍", "产品推荐", "推荐", "报价", "多少钱", "价格", "购买", "采购", "线索", "想买"],
  ticket: ["报修", "登记问题", "登记故障", "投诉", "工单", "故障", "坏了"],
};

export function classifyIntent(text, knowledge) {
  const t = String(text || "");
  if (TRIGGERS.escalate.some((w) => t.includes(w))) return "escalate";
  if (TRIGGERS.schedule.some((w) => t.includes(w))) return "schedule";
  if (TRIGGERS.sales.some((w) => t.includes(w))) return "sales";
  if (TRIGGERS.ticket.some((w) => t.includes(w))) return "ticket";
  if ((knowledge.faq || []).some((f) => (f.keywords || []).some((k) => t.includes(k)))) return "faq";
  return "chat";
}

/* ================= 中文时间短语解析（覆盖高频表达，失败则反问） ================= */

export function parseTimePhrase(text, now = new Date()) {
  const m = text.match(
    /(今天|今日|明天|明日|后天)?\s*(上午|早上|中午|下午|晚上)?\s*([0-9一二两三四五六七八九十]+)\s*[点:：]\s*(半|30)?/,
  );
  if (!m) return { ok: false };

  const dayWord = m[1] || "今天";
  const half = m[2] || "";
  let hour = /^[0-9]+$/.test(m[3]) ? Number(m[3]) : (m[3].split("").map((c) => CN_NUM[c]).filter(Boolean)[0] ?? NaN);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return { ok: false };
  const minute = m[4] ? 30 : 0;
  if (hour === 12 && half === "中午") hour = 12;
  else if ((half === "下午" || half === "晚上") && hour < 12) hour += 12;

  const when = new Date(now);
  when.setDate(when.getDate() + (DAY_OFFSET[dayWord] ?? 0));
  when.setHours(hour, minute, 0, 0);
  if (when.getTime() <= now.getTime() && DAY_OFFSET[dayWord] === undefined) when.setDate(when.getDate() + 1);

  const pad = (n) => String(n).padStart(2, "0");
  const week = "周" + "日一二三四五六"[when.getDay()];
  const label = `${when.getMonth() + 1}月${when.getDate()}日（${week}）${pad(when.getHours())}:${pad(when.getMinutes())}`;
  return { ok: true, when, label };
}

/* ================= 外部系统 adapter（真实优先，失败降级 mock） ================= */

async function callExternal(url, tokenEnv, payload) {
  if (!url) return null;
  const token = tokenEnv ? process.env[tokenEnv] : "";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.id ? String(data.id) : newId("EXT");
  } catch {
    return null; // 降级：mock
  }
}

/* ================= 能力处理器 ================= */

/**
 * 统一入口：识别意图 → 分发 → 返回回复文本。
 * @param {object} cfg agent.json 内容
 * @param {object} knowledge knowledge.mjs 内容
 * @param {string} text 客户消息
 * @param {object} [llm] 可选 { chat: async (text)=>string }，由 index.mjs 在配置了 LLM 时注入
 */
export async function handleText(cfg, knowledge, text, llm) {
  const intent = classifyIntent(text, knowledge);
  const caps = cfg.capabilities || {};
  const reply = await HANDLERS[intent](cfg, knowledge, text, llm);
  return { intent, reply };
}

const HANDLERS = {
  /* ---------- 客服：FAQ ---------- */
  async faq(cfg, knowledge, text, llm) {
    const hit = (knowledge.faq || []).find((f) => (f.keywords || []).some((k) => text.includes(k)));
    if (!hit) return HANDLERS.chat(cfg, knowledge, text, llm);
    if (llm?.chat) {
      try {
        const enhanced = await llm.chat(`请基于以下标准答案回答客户问题（保持事实，不要编造）：\n${hit.answer}\n\n客户问题：${text}`);
        if (enhanced && String(enhanced).trim()) return String(enhanced).trim();
      } catch {
        /* LLM 失败静默降级为标准答案 */
      }
    }
    return hit.answer;
  },

  /* ---------- 秘书：会议预约 / 提醒 ---------- */
  async schedule(cfg, knowledge, text) {
    if (!cfg.capabilities?.secretary) return HANDLERS.chat(cfg, knowledge, text);
    const sec = knowledge.secretary;
    const isReminder = /提醒/.test(text);
    const parsed = parseTimePhrase(text);
    if (!parsed.ok) return sec.needTime;

    // 工作时段校验：给出建议但仍允许登记
    const when = parsed.when;
    const [sh, sm] = sec.workHours.start.split(":").map(Number);
    const [eh] = sec.workHours.end.split(":").map(Number);
    const minutes = when.getHours() * 60 + when.getMinutes();
    const inWindow = sec.workDays.includes(when.getDay()) && minutes >= sh * 60 + sm && minutes <= eh * 60;

    let title = sec.bookable.find((b) => text.includes(b.slice(0, 2))) || "会议";
    const titleMatch = text.match(/(?:约|预约|安排)(?:一个|一场|个)?(.+?)(?:会议|会|$)/);
    if (titleMatch && titleMatch[1] && titleMatch[1].length <= 12) title = titleMatch[1].trim() || title;

    const eventId = (await callExternal(cfg.integrations?.calendarApiUrl, "CALENDAR_TOKEN", {
      type: isReminder ? "reminder" : "meeting",
      title,
      when: when.toISOString(),
    })) ?? newId("CAL");

    const fill = (tpl) =>
      tpl.replaceAll("{time}", parsed.label).replaceAll("{title}", title).replaceAll("{eventId}", eventId);

    if (isReminder) return fill(sec.reminderReply);
    return (inWindow ? "" : fill(sec.outsideWork) + "\n") + fill(sec.bookedReply);
  },

  /* ---------- 销售：产品推荐 / 报价 / 线索登记 ---------- */
  async sales(cfg, knowledge, text) {
    if (!cfg.capabilities?.sales) return HANDLERS.chat(cfg, knowledge, text);
    const sales = knowledge.salesReply;
    const products = knowledge.products || [];

    // 线索登记：文本含手机号（或「线索」+ 姓名称谓）
    const phone = text.match(/1[3-9]\d{9}/);
    if (phone || /登记.{0,6}线索|线索.{0,4}登记/.test(text)) {
      const nameMatch = text.match(/([\u4e00-\u9fa5]{2,4})(?:总|经理|先生|女士)/);
      const lead = {
        name: nameMatch ? nameMatch[0] : "未署名客户",
        phone: phone ? phone[0] : "",
        raw: text,
        source: "assistant-agent",
      };
      const leadId =
        (await callExternal(cfg.integrations?.crmApiUrl, "CRM_TOKEN", { type: "lead", ...lead })) ?? newId("LEAD");
      return sales.leadAckPrefix.replace("{leadId}", leadId);
    }

    // 产品推荐 / 报价
    const hit = products.filter((p) => (p.keywords || []).some((k) => text.includes(k)));
    if (hit.length === 0) {
      return (
        sales.catalogLead +
        "\n" +
        products.map((p) => `• ${p.name}：${p.pitch}`).join("\n") +
        "\n" +
        (products[0]?.followup || "")
      );
    }
    return hit
      .map((p) => `【${p.name}】\n${p.pitch}\n${sales.pricePrefix}${p.priceRange}\n${p.followup}`)
      .join("\n\n");
  },

  /* ---------- 客服：问题登记 / 报修 ---------- */
  async ticket(cfg, knowledge, text) {
    if (!cfg.capabilities?.ticket) return HANDLERS.chat(cfg, knowledge, text);
    const hasDetail = /\d{11}|已经|就是|现象/.test(text) || text.length > 18;
    if (!hasDetail) return knowledge.ticket.askMore;
    const ticketId =
      (await callExternal(cfg.integrations?.ticketApiUrl, "TICKET_TOKEN", { type: "ticket", raw: text })) ??
      newId("TCK");
    return knowledge.ticket.createdReply.replace("{ticketId}", ticketId);
  },

  /* ---------- 客服：转人工 ---------- */
  async escalate(cfg, knowledge) {
    return knowledge.escalate.reply;
  },

  /* ---------- 兜底 ---------- */
  async chat(_cfg, knowledge, text, llm) {
    if (llm?.chat) {
      try {
        const enhanced = await llm.chat(text);
        if (enhanced && String(enhanced).trim()) return String(enhanced).trim();
      } catch {
        /* 降级 */
      }
    }
    return knowledge.fallback;
  },
};
