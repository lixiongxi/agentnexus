import type { FastifyInstance } from "fastify";
import { parse } from "../../http/validate";
import { ownerOf, requireOwnerAuth } from "../../http/auth";
import { audit, clientIp } from "../../core/audit";
import { getOwnerById, login, logout, registerOwner } from "./service";
import { loginSchema, registerOwnerSchema } from "./schema";

function extractToken(req: { headers: Record<string, unknown> }): string {
  const authz = req.headers.authorization;
  const bearer = typeof authz === "string" && authz.startsWith("Bearer ") ? authz.slice(7).trim() : undefined;
  const raw = req.headers["x-owner-token"];
  return bearer || (typeof raw === "string" ? raw.trim() : "");
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  /* ---------- 主人注册 ---------- */
  app.post("/api/auth/register", async (req) => {
    const input = parse(registerOwnerSchema, req.body);
    const result = await registerOwner(input);

    await audit({
      actorType: "owner",
      actorId: result.owner.id,
      action: "auth.register",
      target: result.owner.email ?? "",
      ip: clientIp(req.headers),
    });

    return result;
  });

  /* ---------- 主人登录 ---------- */
  app.post("/api/auth/login", async (req) => {
    const input = parse(loginSchema, req.body);
    const result = await login(input);

    await audit({
      actorType: "owner",
      actorId: result.owner.id,
      action: "auth.login",
      target: result.owner.email ?? "",
      ip: clientIp(req.headers),
    });

    return result;
  });

  /* ---------- 登出（吊销当前会话） ---------- */
  app.post("/api/auth/logout", { preHandler: [requireOwnerAuth] }, async (req) => {
    const owner = ownerOf(req);
    const token = extractToken(req);
    if (token) await logout(token);

    await audit({
      actorType: "owner",
      actorId: owner.ownerId,
      action: "auth.logout",
      ip: clientIp(req.headers),
    });

    return { ok: true };
  });

  /* ---------- 当前登录主人信息 ---------- */
  app.get("/api/auth/me", { preHandler: [requireOwnerAuth] }, async (req) => {
    const owner = ownerOf(req);
    return getOwnerById(owner.ownerId);
  });
}
