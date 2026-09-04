/**
 * 统一错误码与错误类型。
 *
 * 设计要点：
 *  - 业务代码只 throw AppError，不直接 reply.code(...).send(...)，
 *    由统一错误处理器转换成响应 —— 避免 v1 里每个路由各自拼错误体的混乱。
 *  - 错误码稳定可枚举，前端可据此做分支处理（如 SIGNATURE_EXPIRED 触发重新签名）。
 */

export const ErrorCode = {
  // ---- 通用 ----
  BAD_REQUEST: "BAD_REQUEST",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL: "INTERNAL",

  // ---- 鉴权 ----
  SIGNATURE_MISSING: "SIGNATURE_MISSING",
  SIGNATURE_INVALID: "SIGNATURE_INVALID",
  SIGNATURE_EXPIRED: "SIGNATURE_EXPIRED",
  ADMIN_TOKEN_MISSING: "ADMIN_TOKEN_MISSING",
  ADMIN_TOKEN_INVALID: "ADMIN_TOKEN_INVALID",
  OWNER_TOKEN_MISSING: "OWNER_TOKEN_MISSING",
  OWNER_TOKEN_INVALID: "OWNER_TOKEN_INVALID",

  // ---- 业务 ----
  AGENT_SLUG_TAKEN: "AGENT_SLUG_TAKEN",
  AGENT_SUSPENDED: "AGENT_SUSPENDED",
  AGENT_NOT_VERIFIED: "AGENT_NOT_VERIFIED",
  CONNECTION_EXISTS: "CONNECTION_EXISTS",
  CONNECTION_REQUIRED: "CONNECTION_REQUIRED",
  SELF_OPERATION: "SELF_OPERATION",
  CHAT_SESSION_FORBIDDEN: "CHAT_SESSION_FORBIDDEN",
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

const HTTP_STATUS: Record<string, number> = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  SIGNATURE_MISSING: 401,
  SIGNATURE_INVALID: 401,
  SIGNATURE_EXPIRED: 401,
  ADMIN_TOKEN_MISSING: 401,
  ADMIN_TOKEN_INVALID: 401,
  OWNER_TOKEN_MISSING: 401,
  OWNER_TOKEN_INVALID: 401,
  FORBIDDEN: 403,
  AGENT_SUSPENDED: 403,
  AGENT_NOT_VERIFIED: 403,
  CONNECTION_REQUIRED: 403,
  CHAT_SESSION_FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  AGENT_SLUG_TAKEN: 409,
  CONNECTION_EXISTS: 409,
  SELF_OPERATION: 400,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/** 业务异常：携带稳定错误码，HTTP 状态码由错误码映射得出 */
export class AppError extends Error {
  readonly code: ErrorCodeValue;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCodeValue, message?: string, details?: unknown) {
    super(message ?? code);
    this.name = "AppError";
    this.code = code;
    this.status = HTTP_STATUS[code] ?? 500;
    this.details = details;
  }
}

// ---- 便捷构造器 ----
export const badRequest = (msg?: string, d?: unknown) => new AppError(ErrorCode.BAD_REQUEST, msg, d);
export const validationError = (msg: string, d?: unknown) => new AppError(ErrorCode.VALIDATION_ERROR, msg, d);
export const unauthorized = (msg?: string) => new AppError(ErrorCode.UNAUTHORIZED, msg);
export const forbidden = (msg?: string) => new AppError(ErrorCode.FORBIDDEN, msg);
export const notFound = (msg?: string) => new AppError(ErrorCode.NOT_FOUND, msg);
export const conflict = (code: ErrorCodeValue, msg?: string) => new AppError(code, msg);

/** 类型守卫：判断任意异常是否为业务异常 */
export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
