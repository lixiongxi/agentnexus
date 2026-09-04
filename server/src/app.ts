/**
 * Fastify 应用工厂。
 * 抽成工厂而非在 index.ts 里直接构建，是为了让测试可以用 app.inject()
 * 直接打真实路由而无需监听端口。
 */
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import rateLimit from "@fastify/rate-limit";
import { config } from "./core/config";
import { registerErrorHandlers, registerSuccessSerializer } from "./http/errors";
import { registerAgentRoutes } from "./modules/agents/routes";
import { registerConnectionRoutes } from "./modules/connections/routes";
import { registerMessageRoutes } from "./modules/messages/routes";
import { registerChatRoutes } from "./modules/chat/routes";
import { registerAutopilotRoutes } from "./modules/autopilot/routes";
import { registerAuthRoutes } from "./modules/auth/routes";
import { registerAdminRoutes } from "./modules/admin/routes";
import { registerRealtimeRoutes } from "./modules/realtime/routes";
import { registerSystemRoutes } from "./modules/system/routes";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.server.logLevel,
      // 生产环境结构化 JSON 便于采集；开发环境用 pino-pretty 风格的可读输出
      transport:
        config.env === "development"
          ? { target: "pino/file", options: { destination: 1 } }
          : undefined,
    },
    // 记录真实客户端 IP（配合 TRUST_PROXY 使用）
    trustProxy: config.security.trustProxy > 0,
    bodyLimit: 1_048_576, // 1MB
  });

  /**
   * 保留原始请求体：HMAC 签名必须基于客户端实际发送的字节序列，
   * 重新 JSON.stringify 会因键顺序差异导致签名误判。
   */
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    (req as unknown as { rawBody?: string }).rawBody = body as string;
    try {
      done(null, body === "" ? {} : JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  /* ---------- 插件 ---------- */
  const allowAllOrigins = config.cors.origin === "*";
  await app.register(cors, {
    origin: allowAllOrigins ? true : config.cors.origin.split(",").map((s) => s.trim()),
    credentials: !allowAllOrigins,
  });

  await app.register(websocket);

  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.windowMs,
    // 按客户端 IP 计数；同一 NAT 后的用户会共享配额，属于可接受的粗粒度防护
    keyGenerator: (req) => {
      const xff = req.headers["x-forwarded-for"];
      if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0]!.trim();
      return req.ip;
    },
  });

  /* ---------- 响应/错误统一处理 ---------- */
  registerSuccessSerializer(app);
  registerErrorHandlers(app);

  /* ---------- 业务路由 ---------- */
  await registerSystemRoutes(app);
  await registerAuthRoutes(app);
  await registerAgentRoutes(app);
  await registerConnectionRoutes(app);
  await registerMessageRoutes(app);
  await registerChatRoutes(app);
  await registerAutopilotRoutes(app);
  await registerAdminRoutes(app);
  await registerRealtimeRoutes(app);

  return app;
}
