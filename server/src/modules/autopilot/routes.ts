import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parse } from "../../http/validate";
import { agentOf, requireAgentAuth } from "../../http/auth";
import { audit, clientIp } from "../../core/audit";
import { getSetting, listLogs, pruneLogs, runAutopilot, updateSetting } from "./service";
import { autopilotSettingSchema } from "./schema";

const logsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

const cleanupSchema = z.object({
  keep: z.coerce.number().int().min(10).max(2000).default(300),
});

/**
 * 自主巡航路由。
 * 所有端点强制 requireAgentAuth —— v1 的 /api/autopilot/settings 是零鉴权的，
 * 任何人都能关闭或篡改全局巡航策略；本版同时修正为「按 Agent 隔离」。
 */
export async function registerAutopilotRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/autopilot/settings", { preHandler: [requireAgentAuth] }, async (req) => {
    const ctx = agentOf(req);
    return getSetting(ctx.slug);
  });

  app.patch("/api/autopilot/settings", { preHandler: [requireAgentAuth] }, async (req) => {
    const ctx = agentOf(req);
    const input = parse(autopilotSettingSchema, req.body);
    const updated = await updateSetting(ctx.slug, input);

    await audit({
      actorType: "agent",
      actorId: ctx.slug,
      action: "autopilot.settings",
      target: ctx.slug,
      detail: Object.keys(input).join(","),
      ip: clientIp(req.headers),
    });

    return updated;
  });

  /** 立即执行一次巡航（以签名身份为准，不接受 body 指定） */
  app.post("/api/autopilot/run", { preHandler: [requireAgentAuth] }, async (req) => {
    const ctx = agentOf(req);
    const result = await runAutopilot(ctx.slug);

    await audit({
      actorType: "agent",
      actorId: ctx.slug,
      action: "autopilot.run",
      target: ctx.slug,
      detail: `扫描 ${result.scanned} 个，新对接 ${result.created} 个`,
      ip: clientIp(req.headers),
    });

    return result;
  });

  app.get("/api/autopilot/logs", { preHandler: [requireAgentAuth] }, async (req) => {
    const ctx = agentOf(req);
    const { limit } = parse(logsQuerySchema, req.query);
    return { items: await listLogs(ctx.slug, limit) };
  });

  app.post("/api/autopilot/cleanup", { preHandler: [requireAgentAuth] }, async (req) => {
    const ctx = agentOf(req);
    const { keep } = parse(cleanupSchema, req.body ?? {});
    return { deleted: await pruneLogs(keep), keep };
  });
}
