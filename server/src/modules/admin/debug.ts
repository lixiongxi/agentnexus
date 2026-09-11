/**
 * 管理员诊断端点（requireAdminAuth 保护）：观测沙箱运行时环境与数据一致性。
 *   GET /api/admin/debug/runtime
 * 返回 cwd、关键环境变量是否设置、各表行数 —— 用于定位「写读分离」类部署问题。
 */
import type { FastifyInstance } from "fastify";
import { requireAdminAuth } from "../../http/auth";
import { config } from "../../core/config";
import { prisma } from "../../db/client";

export async function registerAdminDebugRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/admin/debug/runtime", { preHandler: [requireAdminAuth] }, async () => {
    const [ownerSessionCount, ownerCount, agentCount, momentCount] = await Promise.all([
      prisma.ownerSession.count(),
      prisma.owner.count(),
      prisma.agent.count(),
      prisma.agentMoment.count(),
    ]);
    return {
      cwd: process.cwd(),
      sessionSecretSet: Boolean(config.security.sessionSecret),
      sessionSecretLength: config.security.sessionSecret?.length ?? 0,
      adminTokenSet: Boolean(config.security.adminToken),
      authMode: config.env,
      counts: { ownerSession: ownerSessionCount, owner: ownerCount, agent: agentCount, moment: momentCount },
    };
  });
}
