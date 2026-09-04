import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  generateAgentSecret,
  hashPassword,
  hashToken,
  signRequest,
  verifyPassword,
  verifyRequestSignature,
} from "../src/lib/crypto";

describe("Agent 密钥加解密（AES-256-GCM）", () => {
  it("加密后可解密还原", () => {
    const secret = generateAgentSecret();
    const stored = encryptSecret(secret);
    expect(stored).not.toContain(secret);
    expect(decryptSecret(stored)).toBe(secret);
  });

  it("同一明文两次加密结果不同（随机 IV）", () => {
    const a = encryptSecret("same-plain");
    const b = encryptSecret("same-plain");
    expect(a).not.toBe(b);
  });

  it("密文被篡改时解密返回 null 而非抛错", () => {
    const stored = encryptSecret("top-secret");
    const parts = stored.split(".");
    // 翻转密文段第一个字符
    const body = parts[2]!;
    const flipped = (body[0] === "A" ? "B" : "A") + body.slice(1);
    const tampered = [parts[0], parts[1], flipped].join(".");
    expect(decryptSecret(tampered)).toBeNull();
  });
});

describe("HMAC 请求签名", () => {
  const secret = "sk_test_secret";
  const body = JSON.stringify({ text: "你好" });

  it("正确签名校验通过", () => {
    const ts = String(Date.now());
    const sig = signRequest(secret, ts, body);
    expect(verifyRequestSignature({ secret, timestamp: ts, rawBody: body, provided: sig })).toEqual({ ok: true });
  });

  it("body 被篡改后校验失败", () => {
    const ts = String(Date.now());
    const sig = signRequest(secret, ts, body);
    const result = verifyRequestSignature({ secret, timestamp: ts, rawBody: body + "x", provided: sig });
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("错误密钥签出的签名被拒绝", () => {
    const ts = String(Date.now());
    const sig = signRequest("wrong-secret", ts, body);
    const result = verifyRequestSignature({ secret, timestamp: ts, rawBody: body, provided: sig });
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("超出时间窗的时间戳被判为 expired", () => {
    const ts = String(Date.now() - 10 * 60 * 1000);
    const sig = signRequest(secret, ts, body);
    const result = verifyRequestSignature({ secret, timestamp: ts, rawBody: body, provided: sig });
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("非十六进制签名直接判 invalid", () => {
    const ts = String(Date.now());
    const result = verifyRequestSignature({ secret, timestamp: ts, rawBody: body, provided: "not-hex!!" });
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("GET 请求约定：空 body 参与签名", () => {
    const ts = String(Date.now());
    const sig = signRequest(secret, ts, "");
    expect(verifyRequestSignature({ secret, timestamp: ts, rawBody: "", provided: sig })).toEqual({ ok: true });
  });
});

describe("主人口令摘要（scrypt）", () => {
  it("同一口令可验证通过，错误口令被拒绝", () => {
    const stored = hashPassword("Passw0rd!123");
    expect(verifyPassword("Passw0rd!123", stored)).toBe(true);
    expect(verifyPassword("wrong-password", stored)).toBe(false);
  });

  it("两次摘要不同（随机盐）", () => {
    expect(hashPassword("abc12345")).not.toBe(hashPassword("abc12345"));
  });
});

describe("会话令牌摘要", () => {
  it("hashToken 是确定性的 SHA-256 且不可逆推原文", () => {
    const token = generateAgentSecret();
    const h1 = hashToken(token);
    expect(h1).toBe(hashToken(token));
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).not.toContain(token);
  });
});
