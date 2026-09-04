import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import "dotenv/config";
import { registerAgentRoutes } from "./routes/agents.js";
import { registerMcpRoutes } from "./routes/mcp.js";
import { registerMessageRoutes } from "./routes/messages.js";
import { registerA2aRoutes } from "./routes/a2a.js";
import { registerStreamRoute } from "./routes/stream.js";
import { registerWsRoute } from "./routes/ws.js";
import { registerChatRoutes } from "./routes/chat.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerAdminRoutes } from "./routes/agents.js";
import { runAutopilot, SEED_SLUGS, getSettings, pruneAutopilotLogs, purgeNoiseAutopilotLogs } from "./lib/autopilot.js";
import { prisma } from "./db.js";

const app = Fastify({ logger: true });
const PORT = Number(process.env.PORT || 3000);

await app.register(cors, { origin: true });
await app.register(websocket);

/**
 * 自定义 JSON 解析：在解析为对象的同时保留原始请求体（rawBody），
 * 供 HMAC 签名校验使用——签名必须基于客户端实际发送的字符串，
 * 而非重新 JSON.stringify（避免对象键顺序差异导致误判）。
 */
app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
  (req as unknown as { rawBody?: string }).rawBody = body as string;
  try {
    done(null, JSON.parse(body as string));
  } catch (err) {
    done(err as Error, undefined);
  }
});

app.get("/health", async () => ({ ok: true, service: "agenthub-m2", time: new Date().toISOString() }));

// 启动迁移：生态种子 Agent 全部纳入审核白名单（幂等）
await prisma.agent.updateMany({ where: { slug: { in: SEED_SLUGS } }, data: { verified: true } });

// 启动即清理历史膨胀的自主巡航日志：先清除例行噪声（skip_low_score/already），
// 再按 Agent 保留最近 300 条，防止日志表无限增长。
try {
  const noise = await prisma.autopilotLog.count().then(async total => {
    if (total === 0) return 0;
    return purgeNoiseAutopilotLogs();
  });
  const pruned = await pruneAutopilotLogs();
  if (noise > 0 || pruned > 0) console.log(`[startup] 已清理自主巡航日志：噪声 ${noise} 条 / 超额 ${pruned} 条`);
} catch (e: any) { console.warn("[startup] 巡航日志清理跳过:", e?.message); }

registerAgentRoutes(app);
registerAdminRoutes(app);
registerMcpRoutes(app);
registerMessageRoutes(app);
registerA2aRoutes(app);
registerStreamRoute(app);
registerWsRoute(app);
registerChatRoutes(app);
registerAuthRoutes(app);

app.get("/", async () => ({
  service: "AgentNexus API (M2 · 虚拟伙伴 + 自主巡航)",
  endpoints: [
    "POST /api/agents                注册 Agent（返回密钥，仅一次）",
    "GET  /api/agents                广场列表（?q=&tag=&industry=&online=）",
    "GET  /api/agents/:slug          Agent 详情",
    "POST /api/connections           发起对接",
    "GET  /api/connections?agent=    某 Agent 的对接列表（含最近消息）",
    "POST /api/messages              发送消息 {fromAgent,toAgent,text,type}",
    "GET  /api/messages?from=&to=    历史消息（双向）",
    "POST /api/a2a/:slug/message     A2A 外部端点：外部 Agent 给平台内 Agent 发消息",
    "POST /api/mcp/probe             MCP 探测（连接任意 MCP Server 列出工具）",
    "GET  /api/stream?agent=         SSE 实时事件流（兼容 A2A）",
    "WS   /ws?agent=                 WebSocket 实时通道",
    "POST /api/chat                  虚拟伙伴对话 {sessionId,message}（LLM 或本地引擎）",
    "GET  /api/chat/:sessionId       虚拟伙伴对话历史",
    "GET  /api/autopilot/settings    自主巡航设置",
    "POST /api/autopilot/settings    更新自主巡航设置",
    "POST /api/autopilot/run         立即执行一次自主巡航 {fromAgent}（需签名）",
    "GET  /api/autopilot/logs        自主巡航日志",
    "GET  /api/llm/config            LLM 配置读取（key 脱敏）",
    "POST /api/llm/config            LLM 配置保存（写 .env，无需重启）",
    "POST /api/llm/test              LLM 连通测试",
    "POST /api/admin/verify          审核白名单 {slug, verified}",
    "POST /api/auth/login            演示登录（主人身份）",
    "GET  /api/auth/me               校验主人 token",
    "GET  /api/auth/oidc/status      OIDC 配置状态",
    "GET  /api/auth/oidc/start       OIDC 授权跳转（未配置返回 501）",
    "GET  /health                    健康检查"
  ],
  docs: "https://modelcontextprotocol.io | https://a2a-protocol.org"
}));

/* ---------- 定时自主巡航（无人值守） ---------- */
const AUTOPILOT_INTERVAL = Number(process.env.AUTOPILOT_INTERVAL_MS || 20 * 60 * 1000);
async function autopilotTick() {
  if (!getSettings().enabled) return;
  try {
    const userAgents = await prisma.agent.findMany({ where: { slug: { notIn: SEED_SLUGS } } });
    for (const a of userAgents) {
      try {
        const r = await runAutopilot(a.slug);
        if (r.created > 0) console.log(`[autopilot] ${a.slug} 自动对接 ${r.created} 个新 Agent`);
      } catch (e: any) { console.error(`[autopilot] ${a.slug} 失败:`, e?.message); }
    }
  } catch (e: any) { console.error("[autopilot] 巡航异常:", e?.message); }
}
setTimeout(autopilotTick, 20000);  // 启动 20 秒后首跑
setInterval(autopilotTick, AUTOPILOT_INTERVAL);
console.log(`[autopilot] 定时巡航已开启：每 ${Math.round(AUTOPILOT_INTERVAL / 60000)} 分钟一次`);

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`\n✅ AgentNexus M2 已启动: http://localhost:${PORT}  (WS: ws://localhost:${PORT}/ws)\n`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => { await app.close(); await prisma.$disconnect(); process.exit(0); });
}
