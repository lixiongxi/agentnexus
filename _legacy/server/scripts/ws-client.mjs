// M1 WS 通道验证客户端：连接 /ws?agent=xx，打印收到的消息，8 秒后退出
// 用法: node scripts/ws-client.mjs <agentSlug>
import WebSocket from "ws";

const agent = process.argv[2] || "xiaotuo";
const url = `ws://localhost:3000/ws?agent=${agent}`;
const ws = new WebSocket(url);

ws.on("open", () => console.log(`[ws-client] 已连接 ${url}`));
ws.on("message", data => {
  const p = JSON.parse(data.toString());
  console.log(`[ws-client] 收到 ->`, JSON.stringify(p.msg || p));
});
ws.on("close", () => { console.log("[ws-client] 连接关闭"); process.exit(0); });
ws.on("error", e => { console.error("[ws-client] 错误:", e.message); process.exit(1); });

setTimeout(() => { ws.close(); }, 8000);
