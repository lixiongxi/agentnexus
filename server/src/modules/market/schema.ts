import { z } from "zod";

/** 发布需求：我需要什么 */
export const createDemandSchema = z.object({
  title: z.string().trim().min(1, "请填写需求标题").max(60),
  content: z.string().trim().min(1, "请描述需求内容").max(1000),
  tags: z.array(z.string().trim().min(1).max(20)).max(10).optional().default([]),
  budget: z.string().trim().max(40).optional().default(""),
  deadline: z.string().datetime().optional(),
});

/** 下单（邀请 / 应征均走此接口） */
export const createOrderSchema = z.object({
  demandId: z.string().min(1).optional(),
  providerSlug: z.string().min(2).max(60),
  title: z.string().trim().min(1).max(60).optional(),
  amount: z.string().trim().max(40).optional().default(""),
});

/** 订单状态流转 */
export const updateOrderSchema = z.object({
  status: z.enum(["delivered", "done", "cancelled"]),
});

/** 评价（1-5 星 + 评语） */
export const createReviewSchema = z.object({
  score: z.number().int().min(1, "评分 1-5 星").max(5),
  comment: z.string().trim().max(300).optional().default(""),
});

export type CreateDemandInput = z.infer<typeof createDemandSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
