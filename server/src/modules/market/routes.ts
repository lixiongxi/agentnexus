import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parse } from "../../http/validate";
import { agentOf, requireAgentAuth } from "../../http/auth";
import { audit, clientIp } from "../../core/audit";
import { createDemandSchema, createOrderSchema, createReviewSchema, updateOrderSchema } from "./schema";
import {
  createDemand,
  createOrder,
  createReview,
  getDemand,
  getOrderDetail,
  listDemands,
  listMyOrders,
  matchDemand,
  updateOrderStatus,
} from "./service";

const matchQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export async function registerMarketRoutes(app: FastifyInstance): Promise<void> {
  /* ---------- 发布需求（签名） ---------- */
  app.post("/api/demands", { preHandler: [requireAgentAuth] }, async (req) => {
    const ctx = agentOf(req);
    const input = parse(createDemandSchema, req.body);
    const demand = await createDemand(ctx.slug, input);
    await audit({
      actorType: "agent",
      actorId: ctx.slug,
      action: "demand.create",
      target: demand.id,
      detail: demand.title,
      ip: clientIp(req.headers),
    });
    return demand;
  });

  /* ---------- 需求大厅（公开） ---------- */
  app.get("/api/demands", async (req) => {
    const q = req.query as { status?: string; tag?: string; ownerSlug?: string; limit?: string };
    const items = await listDemands({
      status: q.status,
      tag: q.tag,
      ownerSlug: q.ownerSlug,
      limit: q.limit ? Number(q.limit) : undefined,
    });
    return { items, total: items.length };
  });

  /* ---------- 需求详情（公开） ---------- */
  app.get("/api/demands/:id", async (req) => {
    const { id } = req.params as { id: string };
    return getDemand(id);
  });

  /* ---------- 匹配候选（公开）：按案例与能力排序 ---------- */
  app.get("/api/demands/:id/matches", async (req) => {
    const { id } = req.params as { id: string };
    const { limit } = parse(matchQuerySchema, req.query);
    return matchDemand(id, limit ?? 20);
  });

  /* ---------- 下单（邀请 / 应征：需求方签名） ---------- */
  app.post("/api/orders", { preHandler: [requireAgentAuth] }, async (req) => {
    const ctx = agentOf(req);
    const input = parse(createOrderSchema, req.body);
    const order = await createOrder(ctx.slug, input);
    await audit({
      actorType: "agent",
      actorId: ctx.slug,
      action: "order.create",
      target: order.orderCode,
      detail: `provider=${order.providerSlug}`,
      ip: clientIp(req.headers),
    });
    return order;
  });

  /* ---------- 我的订单（签名，双视角） ---------- */
  app.get("/api/me/orders", { preHandler: [requireAgentAuth] }, async (req) => {
    const ctx = agentOf(req);
    const q = req.query as { role?: "demander" | "provider" };
    return { items: await listMyOrders(ctx.slug, q.role) };
  });

  /* ---------- 订单详情（参与方） ---------- */
  app.get("/api/orders/:id", { preHandler: [requireAgentAuth] }, async (req) => {
    const ctx = agentOf(req);
    const { id } = req.params as { id: string };
    return getOrderDetail(id, ctx.slug);
  });

  /* ---------- 订单状态流转（参与方） ---------- */
  app.patch("/api/orders/:id", { preHandler: [requireAgentAuth] }, async (req) => {
    const ctx = agentOf(req);
    const { id } = req.params as { id: string };
    const { status } = parse(updateOrderSchema, req.body);
    const order = await updateOrderStatus(id, ctx.slug, status);
    await audit({
      actorType: "agent",
      actorId: ctx.slug,
      action: `order.${status}`,
      target: order.orderCode,
      ip: clientIp(req.headers),
    });
    return order;
  });

  /* ---------- 评价（参与方，订单完成后） ---------- */
  app.post("/api/orders/:id/reviews", { preHandler: [requireAgentAuth] }, async (req) => {
    const ctx = agentOf(req);
    const { id } = req.params as { id: string };
    const input = parse(createReviewSchema, req.body);
    return createReview(id, ctx.slug, input);
  });
}
