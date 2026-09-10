import { z } from "zod";
import { slugSchema } from "../agents/schema";

/** FAQ 条目 */
export const faqEntrySchema = z.object({
  keywords: z.array(z.string().min(1).max(20)).min(1, "FAQ 至少要有一个触发关键词").max(10),
  answer: z.string().min(1, "FAQ 答案不能为空").max(2000),
});

/** 产品条目 */
export const productEntrySchema = z.object({
  name: z.string().min(1).max(50),
  keywords: z.array(z.string().min(1).max(20)).min(1).max(10),
  pitch: z.string().max(500).default(""),
  priceRange: z.string().max(100).default(""),
  followup: z.string().max(300).default(""),
});

export const assistantCapabilitiesSchema = z.object({
  secretary: z.boolean().default(true),
  sales: z.boolean().default(true),
  ticket: z.boolean().default(true),
});

export const assistantIntegrationsSchema = z.object({
  calendarApiUrl: z.string().url().max(300).optional().or(z.literal("")),
  crmApiUrl: z.string().url().max(300).optional().or(z.literal("")),
  ticketApiUrl: z.string().url().max(300).optional().or(z.literal("")),
});

export const assistantProfileSchema = z.object({
  capabilities: assistantCapabilitiesSchema.default({}),
  faq: z.array(faqEntrySchema).max(50).default([]),
  products: z.array(productEntrySchema).max(50).default([]),
  secretary: z
    .object({
      workDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
      workHours: z
        .object({ start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) })
        .optional(),
      bookable: z.array(z.string().min(1).max(30)).max(10).optional(),
      bookedReply: z.string().max(1000).optional(),
      outsideWork: z.string().max(1000).optional(),
      needTime: z.string().max(500).optional(),
      reminderReply: z.string().max(1000).optional(),
    })
    .default({}),
  ticket: z
    .object({
      askMore: z.string().max(1000).optional(),
      createdReply: z.string().max(1000).optional(),
    })
    .default({}),
  escalate: z.object({ reply: z.string().max(1500).optional() }).default({}),
  fallback: z.string().max(2000).optional(),
  integrations: assistantIntegrationsSchema.default({}),
});

/** 创建企业助理：一次创建 Agent + 助理配置 */
export const createAssistantSchema = z.object({
  slug: slugSchema.optional(), // 不填则自动生成 assistant-xxxx
  name: z.string().min(1, "助理名称必填").max(50),
  emoji: z.string().min(1).max(8).default("🗂️"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#4F6BFF"),
  role: z.string().min(1, "一句话定位必填").max(120),
  description: z.string().max(500).default(""),
  industry: z.string().min(1).max(30).default("企业服务"),
  tags: z.array(z.string().min(1).max(20)).max(12).default([]),
  autoAccept: z.boolean().default(true),
  owner: z.object({
    name: z.string().min(1, "负责人姓名必填").max(30),
    org: z.string().min(1, "企业名称必填").max(60),
    title: z.string().max(40).default(""),
    email: z.string().email("邮箱格式不正确").max(120).optional().or(z.literal("")),
  }),
  profile: assistantProfileSchema.default({}),
});

/** 更新企业助理：仅更新助理配置（Agent 基础信息走既有 /api/agents/:slug） */
export const updateAssistantSchema = z.object({
  profile: assistantProfileSchema,
});

export type CreateAssistantInput = z.infer<typeof createAssistantSchema>;
export type UpdateAssistantInput = z.infer<typeof updateAssistantSchema>;
export type AssistantProfileInput = z.infer<typeof assistantProfileSchema>;
