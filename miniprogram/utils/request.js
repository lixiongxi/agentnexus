/**
 * 请求层：wx.request Promise 封装
 *  - 响应信封解包 { ok, data } / { ok:false, error:{code,message} }
 *  - Agent 请求级 HMAC 签名（body 字符串先签名后发送，保证字节一致）
 *  - 主人令牌走 X-Owner-Token 头（不使用 Authorization —— 部分网关会注入覆盖）
 */
const store = require("./store");
const { hmacSha256Hex } = require("./sha256");

function request(method, path, { body, auth, extraHeaders } = {}) {
  const baseUrl = store.getBaseUrl();
  const raw = body === undefined || body === null ? "" : JSON.stringify(body);
  const headers = Object.assign({ "Content-Type": "application/json" }, extraHeaders || {});

  if (auth === "agent") {
    const cred = store.getAgent();
    if (!cred) return Promise.reject(new Error("未绑定 Agent 凭据"));
    const ts = Date.now().toString();
    headers["X-Agent"] = cred.slug;
    headers["X-Timestamp"] = ts;
    headers["X-Signature"] = hmacSha256Hex(cred.secret, ts + "." + raw);
  } else if (auth === "owner") {
    const token = store.getOwnerToken();
    if (!token) return Promise.reject(new Error("未登录主人账号"));
    headers["X-Owner-Token"] = token;
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: baseUrl + path,
      method,
      header: headers,
      data: raw === "" ? undefined : raw,
      timeout: 20000,
      success(res) {
        const j = res.data;
        if (!j || typeof j !== "object") return reject(new Error("响应格式异常"));
        if (j.ok !== true) {
          const err = j.error || {};
          const e = new Error(err.message || "请求失败（" + res.statusCode + "）");
          e.code = err.code;
          e.status = res.statusCode;
          return reject(e);
        }
        resolve(j.data === undefined ? {} : j.data);
      },
      fail(err) {
        reject(new Error(err.errMsg ? err.errMsg.replace("request:fail ", "网络异常：") : "网络异常"));
      },
    });
  });
}

const get = (path, query, opts) => request("GET", withQuery(path, query), opts || {});
const post = (path, body, auth, extraHeaders) => request("POST", path, { body, auth, extraHeaders });
const patch = (path, body, auth) => request("PATCH", path, { body, auth });
const del = (path, auth) => request("DELETE", path, { auth });

function withQuery(path, query) {
  if (!query) return path;
  const parts = Object.keys(query)
    .filter((k) => query[k] !== undefined && query[k] !== null && query[k] !== "")
    .map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(query[k]));
  return parts.length ? path + "?" + parts.join("&") : path;
}

/** 实时通道地址（WebSocket 票据） */
function realtimeWsUrl(ticket) {
  const base = store.getBaseUrl();
  const ws = base.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://");
  return ws + "/ws?ticket=" + encodeURIComponent(ticket);
}

module.exports = { request, get, post, patch, del, realtimeWsUrl };
