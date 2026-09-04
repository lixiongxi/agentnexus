import { z } from "zod";

export const verifySchema = z.object({
  slug: z.string().min(2).max(40),
  verified: z.boolean(),
});

export const llmConfigSchema = z.object({
  apiKey: z.string().min(1, "API Key 不能为空").max(300).optional(),
  baseUrl: z.string().url("baseUrl 需为合法 URL").max(300).optional(),
  model: z.string().min(1).max(100).optional(),
});

export const auditQuerySchema = z.object({
  action: z.string().max(60).optional(),
  actorId: z.string().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  page: z.coerce.number().int().min(1).default(1),
});

export interface AuditLogView {
  id: string;
  actorType: string;
  actorId: string;
  action: string;
  target: string;
  detail: string;
  createdAt: string;
}
