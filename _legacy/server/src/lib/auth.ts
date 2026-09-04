import type { FastifyRequest } from "fastify";
import { prisma } from "../db.js";
import { verify } from "./crypto.js";

/**
 * Agent 身份鉴权（D6）
 * - AUTH_MODE=demo（默认）：有签名则校验，无签名放行（演示/开发不阻塞）
 * - AUTH_MODE=strict（生产）：写操作必须携带有效签名
 *
 * 签名规范（前端 crypto.subtle 同款实现）：
 *   X-Agent:      <slug>
 *   X-Timestamp:  <unix ms>
 *   X-Signature:  HMAC-SHA256(secret, `${timestamp}.${JSON.stringify(body)}`) hex
 */
const AUTH_MODE = (process.env.AUTH_MODE || "demo").toLowerCase();

export interface AuthResult { ok: boolean; slug?: string; reason?: string; mode: string }

export async function checkAgentAuth(req: FastifyRequest): Promise<AuthResult> {
  const slug = req.headers["x-agent"] as string | undefined;
  const sig = req.headers["x-signature"] as string | undefined;
  const ts = req.headers["x-timestamp"] as string | undefined;

  // 无签名头
  if (!slug || !sig || !ts) {
    if (AUTH_MODE === "strict") return { ok: false, reason: "缺少签名头（X-Agent/X-Timestamp/X-Signature）", mode: AUTH_MODE };
    return { ok: true, slug, reason: "demo 模式：无签名放行", mode: AUTH_MODE };
  }

  const agent = await prisma.agent.findUnique({ where: { slug } });
  if (!agent) return { ok: false, reason: `Agent ${slug} 不存在`, mode: AUTH_MODE };

  const tsNum = Number(ts);
  if (!tsNum || Math.abs(Date.now() - tsNum) > 5 * 60 * 1000) {
    return { ok: false, reason: "签名时间戳过期（5 分钟窗口）", mode: AUTH_MODE };
  }

  // 优先用原始请求体校验（客户端签名即基于原始 JSON 字符串），
  // 退而求其次用重新序列化的 body（键顺序一致时等价）。
  const raw = (req as unknown as { rawBody?: string }).rawBody;
  const payload = raw !== undefined ? `${ts}.${raw}` : `${ts}.${JSON.stringify(req.body ?? {})}`;
  if (!verify(payload, agent.secret, sig)) {
    return { ok: false, reason: "签名无效（secret 不匹配或 body 被篡改）", mode: AUTH_MODE };
  }
  return { ok: true, slug, mode: AUTH_MODE };
}

/** 严格模式快捷判断 */
export function isStrictMode() { return AUTH_MODE === "strict"; }

/** 供调试/文档展示 */
export function authMode() { return AUTH_MODE; }
