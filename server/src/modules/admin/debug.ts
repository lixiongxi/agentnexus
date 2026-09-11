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
  app.get("/api/admin/debug/runtime", { preHandler: [requireAdminAuth] }, async (req) => {
    const [ownerSessionCount, ownerCount, agentCount, momentCount] = await Promise.all([
      prisma.ownerSession.count(),
      prisma.owner.count(),
      prisma.agent.count(),
      prisma.agentMoment.count(),
    ]);

    // 会话探针：在服务端内直接计算 tokenHash 并查库，区分「hash 不匹配」vs「行不存在」
    const query = (req.query ?? {}) as { probeToken?: string };
    let probe: { tokenHashPrefix: string; found: boolean; revoked: boolean | null; expiresAt: string | null } | null = null;
    if (query.probeToken) {
      const { hashToken } = await import("../../lib/crypto");
      const tokenHash = hashToken(query.probeToken);
      const row = await prisma.ownerSession.findUnique({ where: { tokenHash } });
      probe = {
        tokenHashPrefix: tokenHash.slice(0, 12),
        found: Boolean(row),
        revoked: row?.revokedAt ? true : row ? false : null,
        expiresAt: row?.expiresAt.toISOString() ?? null,
      };
    }

    // 最近 3 条会话的指纹（脱敏）
    const recent = await prisma.ownerSession.findMany({
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { tokenHash: true, createdAt: true, expiresAt: true, revokedAt: true },
    });

    return {
      cwd: process.cwd(),
      sessionSecretSet: Boolean(config.security.sessionSecret),
      sessionSecretLength: config.security.sessionSecret?.length ?? 0,
      adminTokenSet: Boolean(config.security.adminToken),
      authMode: config.env,
      counts: { ownerSession: ownerSessionCount, owner: ownerCount, agent: agentCount, moment: momentCount },
      probe,
      recentSessions: recent.map((s) => ({
        tokenHashPrefix: s.tokenHash.slice(0, 12),
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        revoked: Boolean(s.revokedAt),
      })),
      now: new Date().toISOString(),
    };
  });
}
