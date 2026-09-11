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

    // 会话探针：服务端内直接验签，区分「验签失败」vs「请求头未到达/被改写」
    const query = (req.query ?? {}) as { probeToken?: string };
    let probe: { tokenHashPrefix: string; found: boolean; revoked: boolean | null; expiresAt: string | null; hmacVerify: boolean | null } | null = null;
    if (query.probeToken) {
      const { hashToken, verifySessionToken } = await import("../../lib/crypto");
      const tokenHash = hashToken(query.probeToken);
      const row = await prisma.ownerSession.findUnique({ where: { tokenHash } });
      const hmacOk = config.security.sessionSecret
        ? Boolean(verifySessionToken(query.probeToken, config.security.sessionSecret))
        : null;
      probe = {
        tokenHashPrefix: tokenHash.slice(0, 12),
        found: Boolean(row),
        revoked: row?.revokedAt ? true : row ? false : null,
        expiresAt: row?.expiresAt.toISOString() ?? null,
        hmacVerify: hmacOk,
      };
    }

    // 请求头回显：观测反代是否剥离/改写鉴权头
    const hdr = req.headers as Record<string, unknown>;
    const headerEcho = {
      authorizationLen: typeof hdr.authorization === "string" ? hdr.authorization.length : 0,
      authorizationPrefix: typeof hdr.authorization === "string" ? hdr.authorization.slice(0, 14) : "",
      xOwnerTokenLen: typeof hdr["x-owner-token"] === "string" ? (hdr["x-owner-token"] as string).length : 0,
      xAdminTokenLen: typeof hdr["x-admin-token"] === "string" ? (hdr["x-admin-token"] as string).length : 0,
    };

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
      headerEcho,
      selfTest: (() => {
        try {
          const { signSessionToken, verifySessionToken } = require("../../lib/crypto") as typeof import("../../lib/crypto");
          const tok = signSessionToken({ ownerId: "self", name: "t", org: "t", role: "owner", exp: Date.now() + 60_000 }, config.security.sessionSecret ?? "");
          return { signed: true, verified: Boolean(verifySessionToken(tok, config.security.sessionSecret ?? "")), tokenLen: tok.length };
        } catch (err: unknown) {
          return { signed: false, verified: false, error: err instanceof Error ? err.message : String(err) };
        }
      })(),
      nodeVersion: process.version,
      startedAtIso: new Date(process.uptime() ? Date.now() - process.uptime() * 1000 : Date.now()).toISOString(),
      uptimeSec: Math.round(process.uptime()),
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
