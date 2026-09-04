import type { AdminContext, AgentContext, OwnerContext } from "../core/context";

declare module "fastify" {
  interface FastifyRequest {
    /** 客户端原始请求体字符串（由 content type parser 注入，供 HMAC 签名校验使用） */
    rawBody?: string;
    /** Agent 身份上下文，由 requireAgentAuth 注入 */
    agentContext?: AgentContext;
    /** 主人身份上下文，由 requireOwnerAuth 注入 */
    ownerContext?: OwnerContext;
    /** 管理员身份上下文，由 requireAdminAuth 注入 */
    adminContext?: AdminContext;
  }
}

export {};
