/**
 * 个人端：注册登记 / 发布 Agent / 服务清单 / 案例
 * 企业端字段（行业、企业认证、知识库）已下线；本模块只服务个人用户。
 */
import { z } from "zod";

/** 注册登记（个人向）：昵称 / 邮箱 / 口令 / 城市 / 擅长领域 / 一句话简介 */
export const personalRegisterSchema = z.object({
  name: z.string().trim().min(1, "请填写昵称").max(30),
  email: z.string().trim().email("邮箱格式不正确"),
  password: z.string().min(8, "口令至少 8 位").max(72),
  city: z.string().trim().max(30).optional().default(""),
  bio: z.string().trim().max(200).optional().default(""),
  domains: z.array(z.string().trim().min(1).max(20)).max(10).optional().default([]),
});

/** 服务项：我能提供的一项具体服务 */
export const serviceItemSchema = z.object({
  title: z.string().trim().min(1, "请填写服务名称").max(40),
  tags: z.array(z.string().trim().min(1).max(20)).min(1, "至少一个能力标签").max(8),
  deliverable: z.string().trim().max(80).optional().default(""),
  priceRange: z.string().trim().max(40).optional().default(""),
  cycleDays: z.number().int().min(0).max(365).optional().default(3),
  intro: z.string().trim().max(300).optional().default(""),
});

/** 案例（发布时可先补充历史案例；平台内成交会自动沉淀） */
export const caseItemSchema = z.object({
  title: z.string().trim().min(1, "请填写案例标题").max(60),
  summary: z.string().trim().max(300).optional().default(""),
  tags: z.array(z.string().trim().min(1).max(20)).max(8).optional().default([]),
  rating: z.number().int().min(0).max(5).optional().default(0),
});

/** 发布 / 编辑个人 Agent（能力声明） */
export const publishAgentSchema = z.object({
  name: z.string().trim().min(1, "请填写 Agent 名称").max(30),
  emoji: z.string().trim().max(8).optional().default("🙋"),
  role: z.string().trim().min(1, "请填写一句话定位").max(60),
  serviceIntro: z.string().trim().min(1, "请描述你能提供什么").max(600),
  domains: z.array(z.string().trim().min(1).max(20)).max(10).optional().default([]),
  acceptingOrders: z.boolean().optional().default(true),
  services: z.array(serviceItemSchema).max(10).optional().default([]),
  cases: z.array(caseItemSchema).max(20).optional().default([]),
  /** true = 发布到能力广场；false = 仅保存草稿 */
  publish: z.boolean().optional().default(true),
});

export const addCaseSchema = caseItemSchema;

export const toggleOrderAcceptSchema = z.object({
  acceptingOrders: z.boolean(),
});

export type PersonalRegisterInput = z.infer<typeof personalRegisterSchema>;
export type PublishAgentInput = z.infer<typeof publishAgentSchema>;
export type CaseItemInput = z.infer<typeof caseItemSchema>;
