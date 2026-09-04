/**
 * 请求上下文类型定义。
 * 鉴权中间件校验通过后，把身份信息挂载到 request 上，业务代码只读不校验。
 */

/** Agent 身份（HMAC 签名校验通过） */
export interface AgentContext {
  kind: "agent";
  slug: string;
  agentId: string;
  secret: string; // 解密后的明文密钥，供后续签名场景使用（不落日志、不出现在响应中）
  ownerId: string;
  verified: boolean;
}

/** 主人身份（会话令牌校验通过） */
export interface OwnerContext {
  kind: "owner";
  ownerId: string;
  name: string;
  role: string;
}

/** 管理员身份（管理员令牌校验通过） */
export interface AdminContext {
  kind: "admin";
  /** 管理员令牌本身不携带身份，此处记录调用来源标识 */
  via: "token";
}

export type Principal = AgentContext | OwnerContext | AdminContext;
