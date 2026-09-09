import { describe, expect, it } from "vitest";
import { canonicalJson, jwksDocument, platformCardKey, signCard, verifyCardWithJwk, verifySignedCard } from "../src/lib/card-signing";
import crypto from "node:crypto";

const card = {
  name: "天璇销售云",
  description: "企业销售助理",
  version: "1.0.0",
  skills: [{ id: "a-crm", name: "CRM", tags: ["CRM"] }],
  security: [{ agentSignature: ["X-Agent"] }],
  nested: { b: 1, a: [2, { z: true, y: null }] },
};

describe("Agent Card 平台签名（Ed25519）", () => {
  it("canonicalJson 与键书写顺序无关", () => {
    const a = canonicalJson({ b: 1, a: { d: 2, c: [3, { i: 1, h: 2 }] } });
    const b = canonicalJson({ a: { c: [3, { h: 2, i: 1 }], d: 2 }, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":{"c":[3,{"h":2,"i":1}],"d":2},"b":1}');
  });

  it("签名 → 平台公钥验证通过；篡改任一字段后失败", () => {
    const signed = signCard(card, "https://hub.example.com");
    expect(verifySignedCard(signed as Record<string, unknown>)).toBe(true);

    const tampered = { ...signed, description: "被篡改的描述" };
    expect(verifySignedCard(tampered)).toBe(false);

    const tamperedSig = { ...signed, signature: { ...signed.signature, value: "AAAA" } };
    expect(verifySignedCard(tamperedSig as Record<string, unknown>)).toBe(false);
  });

  it("键序不同的同一卡片验签同样通过（canonical 化的意义）", () => {
    const signed = signCard(card, "https://hub.example.com");
    const reordered = {
      signature: undefined,
      nested: { a: [2, { y: null, z: true }], b: 1 },
      security: [{ agentSignature: ["X-Agent"] }],
      skills: [{ tags: ["CRM"], name: "CRM", id: "a-crm" }],
      version: "1.0.0",
      description: "企业销售助理",
      name: "天璇销售云",
    } as Record<string, unknown>;
    delete reordered.signature;
    expect(canonicalJson(reordered)).toBe(canonicalJson({ ...signed, signature: undefined } as Record<string, unknown>));
    const jwksDoc = jwksDocument() as { keys: Array<Record<string, string>> };
    expect(verifyCardWithJwk(signed as Record<string, unknown>, jwksDoc.keys[0]! as Record<string, string>)).toBe(true);
  });
  it("JWKS 文档含 OKP/Ed25519 公钥与稳定 kid；keyId 一致", () => {
    const jwks = jwksDocument() as { keys: Array<Record<string, string>> };
    const key = jwks.keys[0]!;
    expect(key).toMatchObject({ kty: "OKP", crv: "Ed25519", use: "sig", alg: "Ed25519" });
    expect(key.kid).toBe(platformCardKey().kid);
    expect((signCard(card, "https://hub.example.com") as any).signature.keyId).toBe(platformCardKey().kid);
    expect(key.x).toHaveLength(43);
  });

  it("外部公钥验签流程：导出 JWK 重建公钥可验证，错误公钥拒绝", () => {
    const signed = signCard(card, "https://hub.example.com");
    const good = platformCardKey().publicKey.export({ format: "jwk" }) as Record<string, string>;
    expect(verifyCardWithJwk(signed as Record<string, unknown>, good)).toBe(true);

    const otherSeed = crypto.scryptSync("other", "x", 32);
    const otherPriv = crypto.createPrivateKey({
      key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), otherSeed]),
      format: "der",
      type: "pkcs8",
    });
    const badJwk = crypto.createPublicKey(otherPriv).export({ format: "jwk" }) as Record<string, string>;
    expect(verifyCardWithJwk(signed as Record<string, unknown>, badJwk)).toBe(false);
  });
});
