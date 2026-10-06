/**
 * 个人端市场服务层：需求发布 → 匹配 → 订单 → 交付 → 评价 → 案例沉淀
 */
import { prisma } from "../../db/client";
import { AppError, ErrorCode } from "../../core/errors";
import { matchAgentsForDemand, type MatchCandidate } from "./matching";
import { createPlatformCase, generateOrderCode, parseTags, recalcAgentStats } from "./stats";
import type { CreateDemandInput, CreateOrderInput } from "./schema";

/* ---------------- 需求 ---------------- */

export async function createDemand(ownerSlug: string, input: CreateDemandInput) {
  const demand = await prisma.demand.create({
    data: {
      ownerSlug,
      title: input.title,
      content: input.content,
      tags: JSON.stringify(input.tags ?? []),
      budget: input.budget ?? "",
      deadline: input.deadline ? new Date(input.deadline) : null,
    },
  });
  return toDemandView(demand);
}

export async function listDemands(query: { status?: string; tag?: string; ownerSlug?: string; limit?: number }) {
  const rows = await prisma.demand.findMany({
    where: {
      status: query.status ?? "open",
      ...(query.ownerSlug ? { ownerSlug: query.ownerSlug } : {}),
      ...(query.tag ? { tags: { contains: query.tag } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: query.limit ?? 50,
  });
  return rows.map(toDemandView);
}

export async function getDemand(id: string) {
  const demand = await prisma.demand.findUnique({ where: { id } });
  if (!demand) throw new AppError(ErrorCode.NOT_FOUND, "需求不存在");
  return toDemandView(demand);
}

/**
 * 匹配：为需求计算候选 Agent（案例优先排序）。
 * 结果即时计算返回（个人端规模下无需落库），并记录 matchCount 供统计。
 */
export async function matchDemand(demandId: string, limit = 20) {
  const demand = await prisma.demand.findUnique({ where: { id: demandId } });
  if (!demand) throw new AppError(ErrorCode.NOT_FOUND, "需求不存在");

  const candidates: MatchCandidate[] = await matchAgentsForDemand({
    demandTags: parseTags(demand.tags),
    demanderSlug: demand.ownerSlug,
    limit,
  });

  await prisma.demand.update({
    where: { id: demandId },
    data: { matchCount: candidates.length },
  });

  return { demand: toDemandView(demand), candidates };
}

function toDemandView(d: {
  id: string;
  ownerSlug: string;
  title: string;
  content: string;
  tags: string;
  budget: string;
  deadline: Date | null;
  status: string;
  createdAt: Date;
}) {
  return {
    id: d.id,
    ownerSlug: d.ownerSlug,
    title: d.title,
    content: d.content,
    tags: parseTags(d.tags),
    budget: d.budget,
    deadline: d.deadline,
    status: d.status,
    createdAt: d.createdAt,
  };
}

/* ---------------- 订单 ---------------- */

export async function createOrder(demanderSlug: string, input: CreateOrderInput) {
  if (input.providerSlug === demanderSlug) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, "不能给自己下单");
  }
  const provider = await prisma.agent.findUnique({
    where: { slug: input.providerSlug },
    select: { slug: true, name: true, publishStatus: true, acceptingOrders: true },
  });
  if (!provider) throw new AppError(ErrorCode.NOT_FOUND, "对方 Agent 不存在");
  if (provider.publishStatus !== "published") {
    throw new AppError(ErrorCode.CONFLICT, "对方尚未发布能力，暂不可接单");
  }
  if (!provider.acceptingOrders) {
    throw new AppError(ErrorCode.CONFLICT, "对方当前暂停接单");
  }

  let title = input.title ?? "";
  if (input.demandId) {
    const demand = await prisma.demand.findUnique({ where: { id: input.demandId } });
    if (!demand) throw new AppError(ErrorCode.NOT_FOUND, "需求不存在");
    if (demand.ownerSlug !== demanderSlug) {
      throw new AppError(ErrorCode.FORBIDDEN, "只能基于自己发布的需求下单");
    }
    title = title || demand.title;
  }
  if (!title) throw new AppError(ErrorCode.VALIDATION_ERROR, "缺少订单标题");

  const order = await prisma.order.create({
    data: {
      orderCode: generateOrderCode(),
      demandId: input.demandId ?? null,
      demanderSlug,
      providerSlug: input.providerSlug,
      title,
      amount: input.amount ?? "",
    },
  });

  if (input.demandId) {
    await prisma.demand.update({ where: { id: input.demandId }, data: { status: "matched" } });
  }

  return toOrderView(order);
}

/** 订单状态机：active → delivered（供给方）→ done（需求方）/ cancelled（双方） */
export async function updateOrderStatus(orderId: string, actorSlug: string, status: "delivered" | "done" | "cancelled") {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError(ErrorCode.NOT_FOUND, "订单不存在");

  const isProvider = actorSlug === order.providerSlug;
  const isDemander = actorSlug === order.demanderSlug;
  if (!isProvider && !isDemander) throw new AppError(ErrorCode.FORBIDDEN, "无权操作该订单");

  const transitions: Record<string, { from: string[]; by: "provider" | "demander" | "both" }> = {
    delivered: { from: ["active"], by: "provider" },
    done: { from: ["delivered", "active"], by: "demander" },
    cancelled: { from: ["active", "delivered"], by: "both" },
  };
  const rule = transitions[status];
  if (!rule) throw new AppError(ErrorCode.VALIDATION_ERROR, "未知状态");
  if (!rule.from.includes(order.status)) {
    throw new AppError(ErrorCode.CONFLICT, `当前状态（${order.status}）不能流转为 ${status}`);
  }
  if (rule.by === "provider" && !isProvider) throw new AppError(ErrorCode.FORBIDDEN, "仅供给方可提交交付");
  if (rule.by === "demander" && !isDemander) throw new AppError(ErrorCode.FORBIDDEN, "仅需求方可确认完成");

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      status,
      deliveredAt: status === "delivered" ? new Date() : order.deliveredAt,
      completedAt: status === "done" ? new Date() : order.completedAt,
    },
  });

  if (status === "done") {
    // 需求未评分前先沉淀案例（rating 待评价时回填）
    const demand = order.demandId ? await prisma.demand.findUnique({ where: { id: order.demandId } }) : null;
    await createPlatformCase({
      agentSlug: order.providerSlug,
      orderId: order.id,
      title: order.title,
      summary: demand?.content?.slice(0, 200) ?? "",
      tags: demand ? parseTags(demand.tags) : [],
      rating: 0,
    });
    await recalcAgentStats(order.providerSlug);
  }
  if (status === "cancelled") {
    await recalcAgentStats(order.providerSlug);
    if (order.demandId) {
      await prisma.demand.update({ where: { id: order.demandId }, data: { status: "open" } });
    }
  }

  return toOrderView(updated);
}

/** 评价（双方各一次；需求方评分回填到该订单沉淀的案例上） */
export async function createReview(orderId: string, fromSlug: string, input: { score: number; comment?: string }) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError(ErrorCode.NOT_FOUND, "订单不存在");

  const isProvider = fromSlug === order.providerSlug;
  const isDemander = fromSlug === order.demanderSlug;
  if (!isProvider && !isDemander) throw new AppError(ErrorCode.FORBIDDEN, "无权评价该订单");
  if (order.status !== "done" && order.status !== "cancelled") {
    throw new AppError(ErrorCode.CONFLICT, "订单完成或取消后才能评价");
  }

  const toSlug = isProvider ? order.demanderSlug : order.providerSlug;

  try {
    await prisma.review.create({
      data: { orderId, fromSlug, toSlug, score: input.score, comment: input.comment ?? "" },
    });
  } catch (err) {
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
      throw new AppError(ErrorCode.CONFLICT, "你已评价过该订单");
    }
    throw err;
  }

  // 需求方评分回填案例（供给方口碑）
  if (isDemander) {
    const c = await prisma.serviceCase.findFirst({ where: { orderId }, select: { id: true } });
    if (c) {
      await prisma.serviceCase.update({ where: { id: c.id }, data: { rating: input.score } });
    }
    await recalcAgentStats(order.providerSlug);
  }

  // 评价对方（信誉分按被评价者重算）
  if (isProvider) await recalcAgentStats(order.demanderSlug);

  return { created: true, toSlug };
}

/** 我的订单（双视角） */
export async function listMyOrders(slug: string, role?: "demander" | "provider") {
  const where =
    role === "provider" ? { providerSlug: slug } : role === "demander" ? { demanderSlug: slug } : null;
  const rows = await prisma.order.findMany({
    where: where ?? { OR: [{ providerSlug: slug }, { demanderSlug: slug }] },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { reviews: true },
  });
  return rows.map((o) => ({
    ...toOrderView(o),
    myRole: o.providerSlug === slug ? "provider" : "demander",
    reviews: o.reviews.map((r) => ({ fromSlug: r.fromSlug, score: r.score, comment: r.comment })),
  }));
}

export async function getOrderDetail(orderId: string, viewerSlug: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { reviews: true, demand: true },
  });
  if (!order) throw new AppError(ErrorCode.NOT_FOUND, "订单不存在");
  if (viewerSlug !== order.demanderSlug && viewerSlug !== order.providerSlug) {
    throw new AppError(ErrorCode.FORBIDDEN, "无权查看该订单");
  }
  return {
    ...toOrderView(order),
    myRole: order.providerSlug === viewerSlug ? "provider" : "demander",
    demand: order.demand
      ? { id: order.demand.id, title: order.demand.title, content: order.demand.content }
      : null,
    reviews: order.reviews.map((r) => ({
      fromSlug: r.fromSlug,
      toSlug: r.toSlug,
      score: r.score,
      comment: r.comment,
    })),
  };
}

function toOrderView(o: {
  id: string;
  orderCode: string;
  demandId: string | null;
  demanderSlug: string;
  providerSlug: string;
  title: string;
  amount: string;
  status: string;
  createdAt: Date;
  deliveredAt: Date | null;
  completedAt: Date | null;
}) {
  return {
    id: o.id,
    orderCode: o.orderCode,
    demandId: o.demandId,
    demanderSlug: o.demanderSlug,
    providerSlug: o.providerSlug,
    title: o.title,
    amount: o.amount,
    status: o.status,
    createdAt: o.createdAt,
    deliveredAt: o.deliveredAt,
    completedAt: o.completedAt,
  };
}
