/**
 * strict 模式验证：模拟前端签名请求
 * 用法：node scripts/strict-auth-test.mjs <secret> <slug>
 * 断言：
 *   1. 带签名 POST /api/messages → 通过（ok:true）
 *   2. 无签名 POST /api/messages → 401
 *   3. 篡改 body → 401
 */
import { webcrypto } from "node:crypto";

const SECRET = process.argv[2];
const SLUG = process.argv[3];
if (!SECRET || !SLUG) { console.log("用法: node strict-auth-test.mjs <secret> <slug>"); process.exit(1); }

async function hmacHex(secret, data) {
  const enc = new TextEncoder();
  const key = await webcrypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const buf = await webcrypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

const body = { fromAgent: SLUG, toAgent: "xiaotuo", text: "strict 模式签名验证消息" };
const ts = Date.now().toString();
const sig = await hmacHex(SECRET, `${ts}.${JSON.stringify(body)}`);

const post = async (headers) => {
  const r = await fetch("http://localhost:3000/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  return { status: r.status, data: await r.json() };
};

console.log("=== strict 模式签名验证 ===");
const expected = [201, 401, 401, 401];
const actual = [];
// 1. 带正确签名
let r = await post({ "X-Agent": SLUG, "X-Timestamp": ts, "X-Signature": sig });
actual[0] = r.status;
console.log(`[1] 带签名请求        → ${r.status} ${r.data.ok ? "✅ 通过" : "❌ " + r.data.error}`);
// 2. 无签名
r = await post({});
actual[1] = r.status;
console.log(`[2] 无签名请求        → ${r.status} ${r.data.ok ? "❌ 不应通过" : "✅ 已拒绝: " + (r.data.error || "").slice(0, 30)}`);
// 3. 篡改 body（签名与 body 不匹配）
r = await post({ "X-Agent": SLUG, "X-Timestamp": ts, "X-Signature": sig.replace(/^./, "0") });
actual[2] = r.status;
console.log(`[3] 篡改签名请求      → ${r.status} ${r.data.ok ? "❌ 不应通过" : "✅ 已拒绝: " + (r.data.error || "").slice(0, 30)}`);
// 4. 过期时间戳
const oldTs = (Date.now() - 6 * 60 * 1000).toString();
const oldSig = await hmacHex(SECRET, `${oldTs}.${JSON.stringify(body)}`);
r = await post({ "X-Agent": SLUG, "X-Timestamp": oldTs, "X-Signature": oldSig });
actual[3] = r.status;
console.log(`[4] 过期时间戳请求    → ${r.status} ${r.data.ok ? "❌ 不应通过" : "✅ 已拒绝: " + (r.data.error || "").slice(0, 30)}`);

const allPass = expected.every((e, i) => e === actual[i]);
console.log("\n结果：" + (allPass ? "全部符合预期 ✅" : "存在偏差，请检查"));
process.exit(allPass ? 0 : 1);
