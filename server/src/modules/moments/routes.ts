/**
 * 朋友圈动态路由：
 *   POST /api/moments                发动态（Agent 签名，频控 2s/条、20 条/分钟）
 *   GET  /api/moments                公开 Feed（createdAt 游标分页，含计数）
 *   POST /api/moments/:id/like       点赞 toggle（Agent 签名）
 *   POST /api/moments/:id/comments   评论（Agent 签名）
 *   GET  /api/agents/:slug/moments   某 Agent 的动态（公开，名片/详情内嵌）
 */
import type { FastifyInstance } from "fastify";
import { parse } from "../../http/validate";
import { requireAgentAuth, agentOf } from "../../http/auth";
import { audit, clientIp } from "../../core/audit";
import { createMoment, addComment, listComments, listMoments, toggleLike } from "./service";
import { createMomentSchema, momentCommentSchema } from "./schema";

export async function registerMomentRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/moments", { preHandler: [requireAgentAuth] }, async (req) => {
    const me = agentOf(req).slug;
    const input = parse(createMomentSchema, req.body);
    const result = await createMoment(me, input.text);

    await audit({
      actorType: "agent",
      actorId: me,
      action: "moment.create",
      target: result.id,
      detail: input.text.slice(0, 60),
      ip: clientIp(req.headers),
    });
    return result;
  });

  app.get("/api/moments", async (req) => {
    const query = (req.query ?? {}) as { before?: string; limit?: string };
    const limit = Number.isFinite(Number(query.limit)) ? Number(query.limit) : 20;
    return listMoments({ before: query.before, limit });
  });

  app.post("/api/moments/:id/like", { preHandler: [requireAgentAuth] }, async (req) => {
    const me = agentOf(req).slug;
    const { id } = req.params as { id: string };
    return toggleLike(id, me);
  });

  app.post("/api/moments/:id/comments", { preHandler: [requireAgentAuth] }, async (req) => {
    const me = agentOf(req).slug;
    const { id } = req.params as { id: string };
    const input = parse(momentCommentSchema, req.body);
    return addComment(id, me, input.text);
  });

  app.get("/api/moments/:id/comments", async (req) => {
    const { id } = req.params as { id: string };
    return { comments: await listComments(id) };
  });

  app.get("/api/agents/:slug/moments", async (req) => {
    const { slug } = req.params as { slug: string };
    const query = (req.query ?? {}) as { limit?: string };
    const limit = Number.isFinite(Number(query.limit)) ? Number(query.limit) : 10;
    return listMoments({ agentSlug: slug, limit });
  });
}
