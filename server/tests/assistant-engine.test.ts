import { describe, expect, it } from "vitest";
import {
  classifyIntent,
  handleAssistantText,
  normalizeCapabilities,
  normalizeKnowledge,
  parseTimePhrase,
} from "../src/lib/assistant-engine";

const knowledge = normalizeKnowledge({
  faq: [{ keywords: ["退货", "退款"], answer: "7 天无理由退货。" }],
  products: [
    {
      name: "阿克米工业机械臂 X1",
      keywords: ["机械臂", "机械"],
      pitch: "六轴协作机械臂",
      priceRange: "¥120,000 起",
      followup: "负载需求是多少？",
    },
  ],
});

const cfg = {
  slug: "test-assistant",
  capabilities: normalizeCapabilities({}),
  integrations: {},
};

describe("企业助理引擎", () => {
  it("意图识别：六类互斥触发，优先级 escalate > schedule > sales > ticket > faq > chat", () => {
    expect(classifyIntent("转人工，快点", knowledge)).toBe("escalate");
    expect(classifyIntent("明天下午3点约个会", knowledge)).toBe("schedule");
    expect(classifyIntent("你们有什么产品", knowledge)).toBe("sales");
    expect(classifyIntent("设备坏了要报修", knowledge)).toBe("ticket");
    expect(classifyIntent("退货政策是什么", knowledge)).toBe("faq");
    expect(classifyIntent("你好呀", knowledge)).toBe("chat");
    // 带登记线索字样的消息归销售而非工单
    expect(classifyIntent("帮客户登记线索：王总 13800138000", knowledge)).toBe("sales");
  });

  it("FAQ：关键词命中返回答案，未命中回退兜底", async () => {
    const hit = await handleAssistantText(cfg, knowledge, "退货政策是什么");
    expect(hit.intent).toBe("faq");
    expect(hit.reply).toContain("7 天无理由退货");

    const miss = await handleAssistantText(cfg, knowledge, "今天天气怎么样");
    expect(miss.reply).toContain("企业智能助理");
  });

  it("秘书：解析中文时间并回执日程编号；缺时间时反问", async () => {
    const ok = await handleAssistantText(cfg, knowledge, "明天下午3点帮我约一个产品演示会议");
    expect(ok.intent).toBe("schedule");
    expect(ok.reply).toMatch(/已为您预约.*CAL-/);

    const ask = await handleAssistantText(cfg, knowledge, "帮我约个会");
    expect(ask.reply).toContain("哪一天");
  });

  it("销售：目录不带报价，点名查询带报价；线索登记生成编号；能力关闭时回兜底", async () => {
    const catalog = await handleAssistantText(cfg, knowledge, "你们有什么产品");
    expect(catalog.reply).toContain("阿克米工业机械臂 X1");

    const rec = await handleAssistantText(cfg, knowledge, "机械臂多少钱");
    expect(rec.intent).toBe("sales");
    expect(rec.reply).toContain("¥120,000 起");

    const lead = await handleAssistantText(cfg, knowledge, "帮客户登记线索：王总 13800138000 想采购");
    expect(lead.reply).toMatch(/LEAD-/);

    const off = await handleAssistantText(
      { ...cfg, capabilities: normalizeCapabilities({ sales: false }) },
      knowledge,
      "你们有什么产品",
    );
    expect(off.reply).toContain("企业智能助理");
  });

  it("工单：信息不足先追问，补足后生成编号；转人工走独立话术", async () => {
    const ask = await handleAssistantText(cfg, knowledge, "报修");
    expect(ask.reply).toContain("补充");

    const done = await handleAssistantText(cfg, knowledge, "会议室屏幕有故障无法点亮，电话 13912345678，麻烦报修");
    expect(done.reply).toMatch(/TCK-/);

    const human = await handleAssistantText(cfg, knowledge, "转人工");
    expect(human.reply).toContain("转接人工");
  });

  it("时间解析：中文数字/半天归一/过去时间顺延一天", () => {
    const now = new Date("2026-09-10T08:00:00");
    expect(parseTimePhrase("明天下午3点", now).label).toContain("15:00");
    expect(parseTimePhrase("周五上午10点半", now).ok).toBe(true);
    const past = parseTimePhrase("今天上午8点", new Date("2026-09-10T09:00:00"));
    expect(past.ok).toBe(true);
    expect(past.when!.getDate()).toBe(11); // 已过时刻顺延到明天
    expect(parseTimePhrase("随便什么时候").ok).toBe(false);
  });

  it("normalizeKnowledge：空配置也能得到完整默认知识库", () => {
    const k = normalizeKnowledge({});
    expect(k.secretary.workHours.start).toBe("09:00:00".slice(0, 5));
    expect(k.ticket.createdReply).toContain("{ticketId}");
    expect(k.fallback).toContain("转人工");
  });
});
