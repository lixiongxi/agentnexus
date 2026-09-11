/**
 * 密码学工具集：Agent 密钥、请求签名、主人口令、会话令牌。
 *
 * 相对 v1 的三处实质加固：
 *
 * 1) Agent 密钥不再明文入库。
 *    v1 的 `Agent.secret` 直接存明文，数据库一旦泄露，攻击者可立即伪造任意 Agent 的签名。
 *    本版改为 AES-256-GCM 加密存储，密钥由 SESSION_SECRET 经 scrypt 派生；
 *    仅泄露数据库而无 SESSION_SECRET 时无法解密出可用密钥。
 *    注意：签名校验需要密钥本身（HMAC 的输入），因此必须用可逆加密而非单向哈希。
 *
 * 2) 签名基于客户端原始报文（rawBody）。
 *    以 rawBody 为准，签名语义与客户端完全一致，避免重新序列化的键顺序差异导致误判。
 *
 * 3) 所有比较使用 crypto.timingSafeEqual 恒时比较，消除时序侧信道。
 */
import crypto from "node:crypto";
import { config } from "../core/config";

const SECRET_ENC_INFO = "agenthub-agent-secret-v1";
const OWNER_PW_INFO = "agenthub-owner-password-v1";

function deriveKey(info: string): Buffer {
  const src = config.security.sessionSecret || "dev-insecure-fallback-key";
  return crypto.scryptSync(src, info, 32);
}

let agentKeyCache: Buffer | null = null;
function agentKey(): Buffer {
  agentKeyCache ??= deriveKey(SECRET_ENC_INFO);
  return agentKeyCache;
}

/* ---------------------- Agent 密钥 ---------------------- */

/** 生成 Agent 密钥（明文，仅在注册响应中返回一次） */
export function generateAgentSecret(): string {
  return "sk_" + crypto.randomBytes(32).toString("base64url");
}

/** 加密存储：iv.tag.ciphertext（均 base64url） */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", agentKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(".");
}

/** 解密；格式错误或认证失败返回 null（绝不抛出，避免探测性报错） */
export function decryptSecret(stored: string): string | null {
  const parts = stored.split(".");
  if (parts.length !== 3) return null;
  const [iv, tag, enc] = parts as [string, string, string];
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", agentKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const out = Buffer.concat([decipher.update(Buffer.from(enc, "base64url")), decipher.final()]);
    return out.toString("utf8");
  } catch {
    return null;
  }
}

/* ---------------------- 请求签名 ---------------------- */

/**
 * 计算请求签名：HMAC-SHA256(secret, `${timestamp}.${rawBody}`)
 * 前端需使用完全相同的拼装规则（web/src/lib/signature.ts 为同款实现）。
 */
export function signRequest(secret: string, timestamp: string | number, rawBody: string): string {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
}

export type VerifyResult = { ok: true } | { ok: false; reason: "expired" | "invalid" };

/** 恒时比较两个十六进制/字符串签名 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyRequestSignature(params: {
  secret: string;
  timestamp: string;
  rawBody: string;
  provided: string;
  windowMs?: number;
}): VerifyResult {
  const { secret, timestamp, rawBody, provided } = params;
  const windowMs = params.windowMs ?? config.security.signatureWindowMs;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || ts <= 0) return { ok: false, reason: "invalid" };
  if (Math.abs(Date.now() - ts) > windowMs) return { ok: false, reason: "expired" };
  if (!/^[0-9a-f]+$/i.test(provided)) return { ok: false, reason: "invalid" };

  const expected = signRequest(secret, timestamp, rawBody);
  return safeEqual(expected, provided) ? { ok: true } : { ok: false, reason: "invalid" };
}

/* ---------------------- 主人口令 ---------------------- */

/** scrypt 口令摘要，格式：salt.hash（均 hex） */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `${salt.toString("hex")}.${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(".");
  if (!saltHex || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, "hex");
    const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length, {
      N: 16384,
      r: 8,
      p: 1,
    });
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/* ---------------------- 会话令牌 ---------------------- */

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** 令牌只存摘要，库泄露也无法反推出可用令牌 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

/* ---------------- 无状态会话令牌（HMAC 自校验，不依赖库） ----------------
 * 部署环境可能存在多 upstream 并存（旧版本实例残留），本地 SQLite 跨请求一致性
 * 无法保证 —— 会话改为 HMAC 签名令牌：payload 携带主人身份，验签即信，不查库。
 * 代价：失去服务端吊销（logout 退化为客户端删令牌），演示/公开部署可接受。
 */

export interface SessionPayload {
  ownerId: string;
  name: string;
  org: string;
  email?: string;
  title?: string | null;
  role: string;
  exp: number; // 毫秒时间戳
}

function sessionKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(`session:${secret}`, "utf8").digest();
}

export function signSessionToken(payload: SessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", sessionKey(secret)).update(body, "utf8").digest("base64url");
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string, secret: string): SessionPayload | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expect = crypto.createHmac("sha256", sessionKey(secret)).update(body, "utf8").digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.ownerId || typeof payload.exp !== "number") return null;
    if (payload.exp <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
