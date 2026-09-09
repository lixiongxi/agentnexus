import type { FastifyInstance } from "fastify";
import { parse } from "../../http/validate";
import { agentOf, requireAgentAuth } from "../../http/auth";
import { audit, clientIp } from "../../core/audit";
import { config } from "../../core/config";
import { prisma } from "../../db/client";
import { getLlmConfig } from "../../lib/llm";
import { probeMcpServer } from "./service";
import { mcpProbeSchema } from "./schema";
import { jwksDocument } from "../../lib/card-signing";

export async function registerSystemRoutes(app: FastifyInstance): Promise<void> {
  /* ---------- 健康检查（公开，供容器探针与负载均衡使用） ---------- */
  app.get("/health", async () => ({
    ok: true,
    service: "agenthub-server",
    version: "2.0.0",
    env: config.env,
    authMode: config.security.authMode,
    time: new Date().toISOString(),
  }));

  /* ---------- 就绪检查：确认数据库可用 ---------- */
  app.get("/health/ready", async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { ok: true, db: "up" };
    } catch {
      return { ok: false, db: "down" };
    }
  });

  /* ---------- 平台公钥 JWKS（公开；供第三方验证 Agent Card 签名） ---------- */
  app.get("/.well-known/jwks.json", async () => jwksDocument());

  /* ---------- 系统信息（公开；仅暴露非敏感开关状态） ---------- */
  app.get("/api/system/info", async () => {
    const llm = await getLlmConfig();
    return {
      service: "AgentNexus",
      version: "2.0.0",
      authMode: config.security.authMode,
      features: {
        llmEnabled: llm.hasKey,
        llmModel: llm.model,
        autopilotEnabled: config.autopilot.enabled,
        rateLimitEnabled: config.rateLimit.max > 0,
      },
    };
  });

  /* ---------- MCP Server 探测（需 Agent 签名，防 SSRF 滥用） ---------- */
  app.post("/api/mcp/probe", { preHandler: [requireAgentAuth] }, async (req) => {
    const ctx = agentOf(req);
    const input = parse(mcpProbeSchema, req.body);
    const result = await probeMcpServer(input);

    await audit({
      actorType: "agent",
      actorId: ctx.slug,
      action: "mcp.probe",
      target: input.url.slice(0, 120),
      detail: result.ok ? `tools=${result.tools.length}` : (result.error ?? "").slice(0, 120),
      ip: clientIp(req.headers),
    });

    return result;
  });
}
