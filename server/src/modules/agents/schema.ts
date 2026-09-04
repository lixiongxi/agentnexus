import { z } from "zod";

/** Agent 标识：小写字母/数字/中划线，且不能以中划线开头或结尾 */
export const slugSchema = z
  .string()
  .min(2, "标识至少 2 个字符")
  .max(40, "标识最多 40 个字符")
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, "标识只能是小写字母、数字与中划线，且不能以中划线开头或结尾");

export const registerAgentSchema = z.object({
  name: z.string().min(1, "Agent 名称必填").max(50, "名称最多 50 个字符"),
  slug: slugSchema,
  emoji: z.string().min(1).max(8).default("🤖"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "颜色需为 #RRGGBB 格式")
    .default("#4F6BFF"),
  role: z.string().min(1, "一句话定位必填").max(120),
  description: z.string().max(500).default(""),
  industry: z.string().min(1).max(30).default("企业服务"),
  tags: z.array(z.string().min(1).max(20)).max(12, "最多 12 个标签").default([]),
  autoAccept: z.boolean().default(true),
  online: z.boolean().default(true),
  mcpEndpoint: z.string().url("MCP 端点需为合法 URL").max(300).optional().or(z.literal("")),
  a2aEndpoint: z.string().url("A2A 端点需为合法 URL").max(300).optional().or(z.literal("")),
  owner: z.object({
    name: z.string().min(1, "主人姓名必填").max(30),
    org: z.string().min(1, "所属组织必填").max(60),
    title: z.string().max(40).default(""),
    email: z.string().email("邮箱格式不正确").max(120).optional().or(z.literal("")),
  }),
});

export type RegisterAgentInput = z.infer<typeof registerAgentSchema>;

export const updateAgentSchema = z
  .object({
    name: z.string().min(1).max(50).optional(),
    emoji: z.string().min(1).max(8).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    role: z.string().min(1).max(120).optional(),
    description: z.string().max(500).optional(),
    industry: z.string().min(1).max(30).optional(),
    tags: z.array(z.string().min(1).max(20)).max(12).optional(),
    autoAccept: z.boolean().optional(),
    online: z.boolean().optional(),
    mcpEndpoint: z.string().url().max(300).optional().or(z.literal("")),
    a2aEndpoint: z.string().url().max(300).optional().or(z.literal("")),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "至少需要提供一个待更新字段" });

export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;

export const listAgentsSchema = z.object({
  q: z.string().max(50).optional().default(""),
  tag: z.string().max(20).optional().default(""),
  industry: z.string().max(30).optional().default(""),
  online: z.enum(["true", "false"]).optional(),
  verified: z.enum(["true", "false"]).optional(),
  sort: z.enum(["recent", "name", "industry"]).optional().default("recent"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListAgentsQuery = z.infer<typeof listAgentsSchema>;

/** 广场列表中的 Agent 视图（不含任何敏感字段） */
export interface AgentPublicView {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  color: string;
  role: string;
  description: string;
  industry: string;
  tags: string[];
  online: boolean;
  autoAccept: boolean;
  verified: boolean;
  status: string;
  createdAt: string;
  owner: {
    name: string;
    org: string;
    title: string | null;
  } | null;
}

/** Agent 主人可见的私有视图（含端点等配置信息，仅本人/管理员可见） */
export interface AgentOwnerView extends AgentPublicView {
  mcpEndpoint: string | null;
  a2aEndpoint: string | null;
}
