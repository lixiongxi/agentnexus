/**
 * A2A 零依赖签名客户端（Node 18+ 原生 fetch / crypto）。
 *
 * 签名规范（与平台 server/src/lib/crypto.ts 完全一致）：
 *   X-Agent:     <slug>
 *   X-Timestamp: <unix 毫秒>
 *   X-Signature: HMAC-SHA256(secret, `${timestamp}.${rawBody}`) 小写 hex
 *   无请求体（GET 或空 body）时以空串参与签名。
 */
import crypto from "node:crypto";

/** 计算签名。rawBody 必须是实际发送的原始字符串。 */
export function signPayload(secret, rawBody, timestamp = Date.now().toString()) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
}

/** 标准化 hub 地址（去掉尾部斜杠） */
export function hubBase(hubUrl) {
  return (hubUrl || "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * 发起带签名的平台请求。
 * @returns 解析后的 JSON 响应；非 2xx 抛出 Error（err.status / err.data 可用）
 */
export async function api(hubUrl, { secret, slug }, method, path, body) {
  const raw = body === undefined ? "" : JSON.stringify(body);
  const timestamp = Date.now().toString();
  const headers = {
    "X-Agent": slug,
    "X-Timestamp": timestamp,
    "X-Signature": signPayload(secret, raw, timestamp),
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(hubBase(hubUrl) + path, {
    method,
    headers,
    body: body === undefined ? undefined : raw,
  });

  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  // 平台统一信封：成功 {ok:true, data}，失败 {ok:false, error:{code,message}}
  const payload =
    parsed && typeof parsed === "object" && "ok" in parsed ? (parsed.ok ? parsed.data : parsed) : parsed;
  if (!res.ok) {
    const err = new Error(parsed?.error?.message || `HTTP ${res.status} ${path}`);
    err.status = res.status;
    err.data = parsed;
    err.code = parsed?.error?.code;
    throw err;
  }
  return payload;
}

const get = (hub, auth, path) => api(hub, auth, "GET", path);
const post = (hub, auth, path, body) => api(hub, auth, "POST", path, body);

/** 便捷封装：常用平台端点（均需 Agent 签名） */
export const endpoints = {
  unread: (hub, auth) => get(hub, auth, "/api/messages/unread"),
  connections: (hub, auth) => get(hub, auth, "/api/connections"),
  history: (hub, auth, peer, limit = 50) => get(hub, auth, `/api/messages?peer=${encodeURIComponent(peer)}&limit=${limit}`),
  sendMessage: (hub, auth, fromAgent, toAgent, text, type = "chat") =>
    post(hub, auth, "/api/messages", { fromAgent, toAgent, text, type }),
  a2aSend: (hub, auth, targetSlug, fromAgent, text, type = "chat") =>
    post(hub, auth, `/api/a2a/${encodeURIComponent(targetSlug)}/message`, { fromAgent, text, type }),
  connect: (hub, auth, fromAgent, toAgent) => post(hub, auth, "/api/connections", { fromAgent, toAgent }),
};
