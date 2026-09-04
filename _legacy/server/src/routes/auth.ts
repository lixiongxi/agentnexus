import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { z } from "zod";

/**
 * 主人身份（D6）
 * - 演示登录：POST /api/auth/login {ownerName, org} → 签发临时 token（内存）
 * - OIDC：配置 OIDC_ISSUER / OIDC_CLIENT_ID / OIDC_CLIENT_SECRET 后，
 *   GET /api/auth/oidc/start 跳转授权，/api/auth/oidc/callback 完成换 token
 *   未配置时返回 501，前端仍可用演示登录
 */

const loginSchema = z.object({
  ownerName: z.string().min(1, "主人姓名必填").max(50),
  org: z.string().max(50).optional().default(""),
  title: z.string().max(50).optional().default("")
});

const sessions = new Map<string, { ownerName: string; org: string; title: string; exp: number }>();

const OIDC = {
  issuer: process.env.OIDC_ISSUER || "",
  clientId: process.env.OIDC_CLIENT_ID || "",
  clientSecret: process.env.OIDC_CLIENT_SECRET || "",
  redirectUri: process.env.OIDC_REDIRECT_URI || "http://localhost:3000/api/auth/oidc/callback"
};

export function registerAuthRoutes(app: FastifyInstance) {
  /* ---------- 演示登录（本地主人身份） ---------- */
  app.post("/api/auth/login", async (req, reply) => {
    const p = loginSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ ok: false, error: p.error.issues[0]?.message });
    const token = randomBytes(24).toString("base64url");
    sessions.set(token, { ...p.data, exp: Date.now() + 7 * 24 * 3600 * 1000 });
    return reply.send({ ok: true, token, owner: p.data, expiresIn: 7 * 24 * 3600 });
  });

  /* ---------- 校验主人 token ---------- */
  app.get("/api/auth/me", async (req, reply) => {
    const token = (req.headers["x-owner-token"] as string) || "";
    const s = sessions.get(token);
    if (!s || s.exp < Date.now()) return reply.code(401).send({ ok: false, error: "未登录或会话过期" });
    return reply.send({ ok: true, owner: { name: s.ownerName, org: s.org, title: s.title } });
  });

  /* ---------- OIDC 状态 ---------- */
  app.get("/api/auth/oidc/status", async () => ({
    ok: true,
    configured: !!(OIDC.issuer && OIDC.clientId),
    provider: OIDC.issuer ? new URL(OIDC.issuer).host : null
  }));

  /* ---------- OIDC 授权跳转 ---------- */
  app.get("/api/auth/oidc/start", async (_req, reply) => {
    if (!OIDC.issuer || !OIDC.clientId) {
      return reply.code(501).send({ ok: false, error: "OIDC 未配置（配置 OIDC_ISSUER/CLIENT_ID/CLIENT_SECRET 后可用），当前请使用演示登录" });
    }
    const state = randomBytes(16).toString("hex");
    const nonce = randomBytes(16).toString("hex");
    const url = `${OIDC.issuer.replace(/\/$/, "")}/authorize?` + new URLSearchParams({
      client_id: OIDC.clientId,
      redirect_uri: OIDC.redirectUri,
      response_type: "code",
      scope: "openid profile email",
      state,
      nonce
    }).toString();
    return reply.redirect(url);
  });

  /* ---------- OIDC 回调（authorization code → token 换主人信息） ---------- */
  app.get("/api/auth/oidc/callback", async (req, reply) => {
    if (!OIDC.issuer || !OIDC.clientId || !OIDC.clientSecret) {
      return reply.code(501).send({ ok: false, error: "OIDC 未配置" });
    }
    const { code } = req.query as { code?: string };
    if (!code) return reply.code(400).send({ ok: false, error: "缺少 code" });
    try {
      const tokenRes = await fetch(`${OIDC.issuer.replace(/\/$/, "")}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: OIDC.redirectUri,
          client_id: OIDC.clientId,
          client_secret: OIDC.clientSecret
        }).toString()
      });
      const tokens = await tokenRes.json();
      const userinfoRes = await fetch(`${OIDC.issuer.replace(/\/$/, "")}/userinfo`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      });
      const info = await userinfoRes.json();
      const token = randomBytes(24).toString("base64url");
      sessions.set(token, {
        ownerName: info.name || info.preferred_username || "OIDC 用户",
        org: "", title: "",
        exp: Date.now() + 7 * 24 * 3600 * 1000
      });
      return reply.send({ ok: true, token, owner: { name: info.name || "OIDC 用户", org: "", title: "" } });
    } catch (e: any) {
      return reply.code(502).send({ ok: false, error: "OIDC 换取令牌失败: " + (e?.message || e) });
    }
  });
}
