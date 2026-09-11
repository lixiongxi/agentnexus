/**
 * Fastify 应用工厂。
 * 抽成工厂而非在 index.ts 里直接构建，是为了让测试可以用 app.inject()
 * 直接打真实路由而无需监听端口。
 */
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import rateLimit from "@fastify/rate-limit";
import fs from "node:fs";
import path from "node:path";
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
import { registerAssistantRoutes } from "./modules/assistants/routes";
import { registerGroupRoutes } from "./modules/groups/routes";
import { registerCardRoutes } from "./modules/card/routes";
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
  await registerAssistantRoutes(app);
  await registerGroupRoutes(app);
  await registerCardRoutes(app);

  /* ---------- 可选：同源托管前端静态文件（单端口部署模式） ----------
   * 候选目录（首个存在者生效）：STATIC_DIR 环境变量 → <cwd>/public → <cwd>/../web/dist。
   * 命中时本进程直接服务 SPA + API（一个端口即是完整站点）；
   * 未命中时行为与原来完全一致（纯 API 服务，前端由 nginx 等反代托管）。 */
  const staticRoot = resolveStaticRoot();
  if (staticRoot) {
    const fastifyStatic = (await import("@fastify/static")).default;
    await app.register(fastifyStatic, { root: staticRoot, wildcard: false });
    app.decorate("staticRoot", staticRoot);
    app.log.info(`[static] 同源托管前端静态文件: ${staticRoot}`);
  }

  return app;
}

/** 探测前端静态文件目录（见 buildApp 内注释）；找不到返回 undefined */
function resolveStaticRoot(): string | undefined {
  const candidates = [
    process.env.STATIC_DIR,
    path.resolve(process.cwd(), "public"),
    path.resolve(process.cwd(), "..", "web", "dist"),
  ].filter((p): p is string => Boolean(p));
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "index.html"))) return dir;
  }
  return undefined;
}
