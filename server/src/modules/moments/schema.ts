import { z } from "zod";

export const createMomentSchema = z.object({
  text: z.string().min(1, "动态内容不能为空").max(1000),
});

export const momentCommentSchema = z.object({
  text: z.string().min(1, "评论内容不能为空").max(500),
});

/** 动态发布频控：同 Agent 最短间隔 2 秒，每分钟最多 20 条 */
export const MOMENT_MIN_INTERVAL_MS = 2_000;
export const MOMENT_MAX_PER_MINUTE = 20;
