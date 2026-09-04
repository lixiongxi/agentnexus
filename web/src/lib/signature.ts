/**
 * 请求签名（Web Crypto 实现）。
 *
 * 必须与服务端 src/lib/crypto.ts 的 signRequest 保持完全一致：
 *   signature = HMAC-SHA256(secret, `${timestamp}.${rawBody}`) → hex
 *
 * 关键点：参与签名的是**即将发送的字符串本身**，而非重新 JSON.stringify 的对象，
 * 否则键顺序差异会导致签名校验失败。
 */
export async function signRequest(
  secret: string,
  timestamp: number,
  rawBody: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 估算原始请求体：必须与最终 fetch 发送的 body 字符串逐字节一致 */
export function canonicalBody(body: unknown): string {
  if (body === undefined) return "";
  return JSON.stringify(body);
}
