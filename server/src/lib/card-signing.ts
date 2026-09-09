/**
 * Agent Card 平台签名（对标 A2A v1.0 Signed Agent Cards）。
 *
 * 背景（docs/AGENT-LANDSCAPE.md）：A2A v1.0 为 Agent Card 引入密码学签名，
 * 使「去中心化发现」下接收方可验证卡片确实来自其声称的发布方，防卡片伪造 ——
 * 这是开放发现的信任前提。
 *
 * 本实现（零依赖，Node 原生 crypto）：
 *   - 算法：Ed25519（JWS alg 名 "Ed25519"，JWK kty=OKP）
 *   - 密钥：从 SESSION_SECRET 经 scrypt 确定性派生 32 字节种子 → PKCS8 包装为
 *     Ed25519 私钥。无需落库、无需迁移；代价是轮换 SESSION_SECRET 会同步轮换
 *     卡片签名密钥（kid 随之变化，验签方按 kid 重新取 JWKS 即可）。
 *   - 签名对象：卡片（去除 signature 字段后）的 canonical JSON（键递归排序），
 *     杜绝键序差异导致的验签失败。
 *   - 发现：GET /.well-known/jwks.json 返回平台公钥（JWKS），验签方按
 *     signature.keyId 匹配 kid。
 *
 * 提醒：签名证明「卡片未被篡改且由平台签发」，不证明「Agent 行为可信」——
 * 决策完整性（如 prompt 注入）是另一层问题，见 SECURITY.md。
 */
import crypto from "node:crypto";
import { config } from "../core/config";

const SEED_INFO = "agenthub-card-signing-v1";
/** Ed25519 私钥的 PKCS8 DER 前缀（RFC 8410），后接 32 字节原始种子 */
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export interface PlatformKeyPair {
  privateKey: crypto.KeyObject;
  publicKey: crypto.KeyObject;
  kid: string;
}

let cachedPair: PlatformKeyPair | null = null;

/** 平台卡片签名密钥对（进程内缓存；确定性派生，重启不变） */
export function platformCardKey(): PlatformKeyPair {
  if (cachedPair) return cachedPair;
  const src = config.security.sessionSecret || "dev-insecure-fallback-key";
  const seed = crypto.scryptSync(src, SEED_INFO, 32);
  const privateKey = crypto.createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]),
    format: "der",
    type: "pkcs8",
  });
  const publicKey = crypto.createPublicKey(privateKey);
  const jwk = publicKey.export({ format: "jwk" }) as { x?: string };
  const raw = Buffer.from(jwk.x ?? "", "base64url");
  const kid = `agenthub-card-${crypto.createHash("sha256").update(raw).digest("hex").slice(0, 12)}`;
  cachedPair = { privateKey, publicKey, kid };
  return cachedPair;
}

/** 平台公钥的 JWKS 条目（供 /.well-known/jwks.json 发布） */
export function publicJwk(): Record<string, unknown> {
  const { publicKey, kid } = platformCardKey();
  const jwk = publicKey.export({ format: "jwk" }) as Record<string, string>;
  return { ...jwk, kid, use: "sig", alg: "Ed25519" };
}

/** 平台 JWKS 文档 */
export function jwksDocument(): Record<string, unknown> {
  return { keys: [publicJwk()] };
}

/**
 * canonical JSON：对象键递归排序后序列化（数组保持原序），
 * 使签名与键的书写顺序无关。
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export interface CardSignature {
  algorithm: "Ed25519";
  keyId: string;
  keyUrl: string;
  /** 签名载荷（canonical JSON）的 SHA-256 摘要，便于快速核对 */
  payloadDigest: string;
  /** Ed25519 签名值（base64url），载荷为卡片（去除 signature 字段）的 canonical JSON */
  value: string;
}

/** 对卡片签名：返回附加了 signature 字段的新卡片（原对象不被修改） */
export function signCard<T extends Record<string, unknown>>(card: T, baseUrl: string): T & { signature: CardSignature } {
  const { privateKey, kid } = platformCardKey();
  const unsigned = { ...card, signature: undefined };
  const payload = canonicalJson(unsigned);
  const value = crypto.sign(null, Buffer.from(payload, "utf8"), privateKey).toString("base64url");
  return {
    ...card,
    signature: {
      algorithm: "Ed25519",
      keyId: kid,
      keyUrl: `${baseUrl.replace(/\/+$/, "")}/.well-known/jwks.json`,
      payloadDigest: crypto.createHash("sha256").update(payload, "utf8").digest("hex"),
      value,
    },
  };
}

/** 使用给定公钥 JWK 验证已签名卡片（第三方验签流程，与平台实现解耦） */
export function verifyCardWithJwk(
  signedCard: Record<string, unknown>,
  jwk: Record<string, string>,
): boolean {
  const sig = signedCard.signature as CardSignature | undefined;
  if (!sig?.value || !jwk?.x) return false;
  try {
    const unsigned = { ...signedCard, signature: undefined };
    const payload = Buffer.from(canonicalJson(unsigned), "utf8");
    const publicKey = crypto.createPublicKey({ key: jwk as crypto.JsonWebKey, format: "jwk" });
    return crypto.verify(null, payload, publicKey, Buffer.from(sig.value, "base64url"));
  } catch {
    return false;
  }
}

/** 平台自验（用本地派生公钥） */
export function verifySignedCard(signedCard: Record<string, unknown>): boolean {
  const { publicKey } = platformCardKey();
  const jwk = publicKey.export({ format: "jwk" }) as Record<string, string>;
  return verifyCardWithJwk(signedCard, jwk);
}
