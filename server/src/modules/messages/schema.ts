import { z } from "zod";

export const slugField = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, "Agent 标识格式不合法");

export const MESSAGE_TYPES = ["chat", "task", "event"] as const;

export const sendMessageSchema = z.object({
  fromAgent: slugField,
  toAgent: slugField,
  text: z.string().min(1, "消息内容不能为空").max(4000, "单条消息最多 4000 字"),
  type: z.enum(MESSAGE_TYPES).default("chat"),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const historySchema = z.object({
  peer: slugField,
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.string().datetime().optional(),
});

export const a2aSchema = z.object({
  fromAgent: z.string().min(1).max(40),
  text: z.string().min(1).max(4000),
  type: z.enum(MESSAGE_TYPES).default("chat"),
});

export interface MessageView {
  id: string;
  conversationId: string;
  fromAgent: string;
  toAgent: string;
  text: string;
  type: string;
  readAt: string | null;
  createdAt: string;
}
