/**
 * 三级鉴权守卫：Agent（HMAC 签名）/ 主人（会话令牌）/ 管理员（管理员令牌）。
 *
 * 这是本次重写修复 P0 漏洞的核心。v1 的问题在于「鉴权是逐路由手写的可选项」——
 * 谁想起来就加一行 checkAgentAuth，想不起来就裸奔（/api/admin/verify、/api/llm/config
 * 正是因此零鉴权暴露）。本版改为：
 *   - 鉴权以 preHandler 形式声明在路由上，缺省即拒绝
 *   - 身份校验通过后写入 request 上下文，业务代码不再重复校验
 *   - 所有敏感操作经 audit() 留痕
 */
import type { FastifyRequest } from "fastify";
import crypto from "node:crypto";
import { config } from "../core/config";
import { AppError, ErrorCode } from "../core/errors";
import { prisma } from "../db/client";
import { decryptSecret, verifyRequestSignature, verifySessionToken } from "../lib/crypto";
import type { AgentContext, OwnerContext } from "../core/context";

/** 从请求体安全读取字符串字段（body 形状未知，避免直接下标断言） */
function bodyString(req: FastifyRequest, key: string): string | undefined {
  const body = req.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== "object") return undefined;
  const v = body[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/**
 * Agent 身份鉴权（HMAC-SHA256 签名）
 *
 * 签名规范：
 *   X-Agent:     <slug>
 *   X-Timestamp: <unix ms>
 *   X-Signature: HMAC-SHA256(secret, `${timestamp}.${rawBody}`) hex
 */
export async function requireAgentAuth(req: FastifyRequest): Promise<void> {
  const slug = (req.headers["x-agent"] as string | undefined)?.trim();
  const signature = (req.headers["x-signature"] as string | undefined)?.trim();
  const timestamp = (req.headers["x-timestamp"] as string | undefined)?.trim();

  const hasHeaders = Boolean(slug && signature && timestamp);

  if (!hasHeaders) {
    // demo 模式：无签名头时降级为「按 slug 识别」，仅用于本地演示
    if (config.security.authMode === "demo") {
      const fallbackSlug = slug || bodyString(req, "fromAgent");
      if (!fallbackSlug) {
        throw new AppError(ErrorCode.SIGNATURE_MISSING, "demo 模式仍需 X-Agent 或 body.fromAgent 标识身份");
      }
      const agent = await prisma.agent.findUnique({ where: { slug: fallbackSlug } });
      if (!agent) throw new AppError(ErrorCode.UNAUTHORIZED, `Agent ${fallbackSlug} 不存在`);
      if (agent.status !== "active") throw new AppError(ErrorCode.AGENT_SUSPENDED, `Agent ${fallbackSlug} 已被停用`);

      const secret = decryptSecret(agent.secretHash);
      if (!secret) throw new AppError(ErrorCode.INTERNAL, "Agent 密钥解密失败，请检查 SESSION_SECRET 配置");

      req.agentContext = {
        kind: "agent",
        slug: agent.slug,
        agentId: agent.id,
        secret,
        ownerId: agent.ownerId,
        verified: agent.verified,
      };
      return;
    }
    throw new AppError(ErrorCode.SIGNATURE_MISSING, "缺少签名头（X-Agent / X-Timestamp / X-Signature）");
  }

  const agent = await prisma.agent.findUnique({ where: { slug: slug as string } });
  if (!agent) throw new AppError(ErrorCode.UNAUTHORIZED, "Agent 不存在");
  if (agent.status !== "active") throw new AppError(ErrorCode.AGENT_SUSPENDED, "Agent 已被停用");

  const secret = decryptSecret(agent.secretHash);
  if (!secret) throw new AppError(ErrorCode.INTERNAL, "Agent 密钥解密失败，请检查 SESSION_SECRET 配置");

  // 签名约定：无请求体（GET 或空 body 未经解析器）时以空串参与签名
  const raw = req.rawBody ?? "";
  const result = verifyRequestSignature({
    secret,
    timestamp: timestamp as string,
    rawBody: raw,
    provided: signature as string,
  });

  if (!result.ok) {
    throw new AppError(
      result.reason === "expired" ? ErrorCode.SIGNATURE_EXPIRED : ErrorCode.SIGNATURE_INVALID,
      result.reason === "expired" ? "签名时间戳超出有效窗口" : "签名校验失败（密钥不匹配或报文被篡改）",
    );
  }

  req.agentContext = {
    kind: "agent",
    slug: agent.slug,
    agentId: agent.id,
    secret,
    ownerId: agent.ownerId,
    verified: agent.verified,
  };
}

/**
 * 可选 Agent 鉴权：有签名则校验，无签名放行（不抛错）。
 * 仅用于「同一接口对匿名与已认证 Agent 表现不同」的读场景。
 */
export async function optionalAgentAuth(req: FastifyRequest): Promise<void> {
  const slug = (req.headers["x-agent"] as string | undefined)?.trim();
  const signature = (req.headers["x-signature"] as string | undefined)?.trim();
  const timestamp = (req.headers["x-timestamp"] as string | undefined)?.trim();
  if (!slug || !signature || !timestamp) return;

  try {
    await requireAgentAuth(req);
  } catch {
    // 可选鉴权下，签名错误只当作「未认证」，不阻断请求
    req.agentContext = undefined;
  }
}

/** 提取主人令牌（Authorization: Bearer 或 X-Owner-Token，二选一） */
function extractOwnerToken(req: FastifyRequest): string {
  const authz = req.headers.authorization;
  const bearer = authz?.startsWith("Bearer ") ? authz.slice(7).trim() : undefined;
  return bearer || (req.headers["x-owner-token"] as string | undefined)?.trim() || "";
}

/** 解析无状态会话令牌（HMAC 验签 + 过期校验），失败返回 null */
function parseOwnerToken(token: string) {
  if (!token || !config.security.sessionSecret) return null;
  return verifySessionToken(token, config.security.sessionSecret);
}

/** 主人身份鉴权（无状态会话令牌：Authorization: Bearer <token> 或 X-Owner-Token） */
export async function requireOwnerAuth(req: FastifyRequest): Promise<void> {
  const token = extractOwnerToken(req);
  if (!token) throw new AppError(ErrorCode.OWNER_TOKEN_MISSING, "缺少主人身份令牌");
  if (!config.security.sessionSecret) {
    throw new AppError(ErrorCode.INTERNAL, "服务端未配置 SESSION_SECRET，无法校验会话");
  }

  const payload = parseOwnerToken(token);
  if (!payload) {
    throw new AppError(ErrorCode.OWNER_TOKEN_INVALID, "会话无效或已过期，请重新登录");
  }

  req.ownerContext = {
    kind: "owner",
    ownerId: payload.ownerId,
    name: payload.name,
    org: payload.org,
    email: payload.email ?? null,
    title: payload.title ?? null,
    role: payload.role,
  };
}

/**
 * 可选主人鉴权：有令牌则校验，无令牌放行（不抛错）。
 * 用于「同一接口对匿名与已登录用户表现不同」的场景。
 */
export async function optionalOwnerAuth(req: FastifyRequest): Promise<void> {
  const token = extractOwnerToken(req);
  const payload = parseOwnerToken(token);
  if (!payload) return;

  req.ownerContext = {
    kind: "owner",
    ownerId: payload.ownerId,
    name: payload.name,
    org: payload.org,
    email: payload.email ?? null,
    title: payload.title ?? null,
    role: payload.role,
  };
}

/** 管理员鉴权（X-Admin-Token，恒时比较） */
export async function requireAdminAuth(req: FastifyRequest): Promise<void> {
  const provided = (req.headers["x-admin-token"] as string | undefined)?.trim();
  const expected = config.security.adminToken;

  if (!expected) {
    throw new AppError(ErrorCode.ADMIN_TOKEN_MISSING, "服务端未配置 ADMIN_TOKEN，管理端点已全部关闭");
  }
  if (!provided) throw new AppError(ErrorCode.ADMIN_TOKEN_MISSING, "缺少管理员令牌（X-Admin-Token）");

  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  const equal = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!equal) throw new AppError(ErrorCode.ADMIN_TOKEN_INVALID, "管理员令牌无效");

  req.adminContext = { kind: "admin", via: "token" };
}

/** 取出已通过鉴权的 Agent 上下文（业务代码用，缺失即视为编程错误） */
export function agentOf(req: FastifyRequest): AgentContext {
  const ctx = req.agentContext;
  if (!ctx) throw new AppError(ErrorCode.UNAUTHORIZED, "未通过 Agent 鉴权");
  return ctx;
}

/** 取出已通过鉴权的主人上下文 */
export function ownerOf(req: FastifyRequest): OwnerContext {
  const ctx = req.ownerContext;
  if (!ctx) throw new AppError(ErrorCode.UNAUTHORIZED, "未通过主人鉴权");
  return ctx;
}
