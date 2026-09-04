import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** 生成 Agent 密钥（注册时返回一次，用于后续 HMAC 签名） */
export function genSecret(): string {
  return randomBytes(24).toString("base64url");
}

/** HMAC-SHA256 签名，用于 Agent 请求身份校验（D6，M2 完整启用） */
export function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * 校验签名（防伪造与重放）
 * 使用 crypto.timingSafeEqual 做定长恒时比较，避免时序侧信道攻击。
 */
export function verify(payload: string, secret: string, signature: string | undefined): boolean {
  const expected = sign(payload, secret);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature ?? "", "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
