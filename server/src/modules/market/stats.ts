/**
 * Agent 能力统计与案例沉淀（撮合排序的数据源）
 *
 * completedCases / avgCaseRating / reputation 三个汇总字段在此统一维护，
 * 任何影响它们的动作（订单完成、评价、手动补案例）都必须调用 recalcAgentStats。
 */
import crypto from "node:crypto";
import { prisma } from "../../db/client";
import type { CaseItemInput } from "../personal/schema";

export function parseTags(raw: string): string[] {
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * 手动补充一条历史案例（source=manual）。
 * 去重：同一 Agent 下同标题且同为 manual 的案例不重复写入。
 */
export async function addManualCase(slug: string, input: CaseItemInput): Promise<boolean> {
  const exists = await prisma.serviceCase.findFirst({
    where: { agentSlug: slug, source: "manual", title: input.title },
    select: { id: true },
  });
  if (exists) return false;

  await prisma.serviceCase.create({
    data: {
      agentSlug: slug,
      title: input.title,
      summary: input.summary ?? "",
      tags: JSON.stringify(input.tags ?? []),
      rating: input.rating ?? 0,
      source: "manual",
    },
  });
  return true;
}

/** 订单完成 → 自动沉淀平台案例（含需求方评分） */
export async function createPlatformCase(params: {
  agentSlug: string;
  orderId: string;
  title: string;
  summary?: string;
  tags: string[];
  rating: number;
}): Promise<void> {
  const exists = await prisma.serviceCase.findFirst({ where: { orderId: params.orderId }, select: { id: true } });
  if (exists) {
    await prisma.serviceCase.update({
      where: { id: exists.id },
      data: { rating: params.rating },
    });
    return;
  }
  await prisma.serviceCase.create({
    data: {
      agentSlug: params.agentSlug,
      orderId: params.orderId,
      title: params.title,
      summary: params.summary ?? "",
      tags: JSON.stringify(params.tags),
      rating: params.rating,
      source: "platform",
    },
  });
}

/**
 * 信誉分（0-100）：
 *   60% 案例评分（有评分案例的均值 / 5）
 *   30% 履约率（done / (done + cancelled)；无订单时取 0.8 中性）
 *   10% 案例量（min(案例数 / 20, 1)）
 */
export function computeReputation(params: { avgRating: number; caseCount: number; done: number; cancelled: number }): number {
  const ratingPart = params.avgRating > 0 ? params.avgRating / 5 : 0.6;
  const total = params.done + params.cancelled;
  const fulfilment = total > 0 ? params.done / total : 0.8;
  const volume = Math.min(params.caseCount / 20, 1);
  const score = 0.6 * ratingPart + 0.3 * fulfilment + 0.1 * volume;
  return Math.round(Math.min(Math.max(score, 0), 1) * 1000) / 10;
}

/** 重算 Agent 的案例统计（案例数 / 平均评分 / 信誉分） */
export async function recalcAgentStats(slug: string): Promise<void> {
  const [cases, done, cancelled] = await Promise.all([
    prisma.serviceCase.findMany({ where: { agentSlug: slug }, select: { rating: true } }),
    prisma.order.count({ where: { providerSlug: slug, status: "done" } }),
    prisma.order.count({ where: { providerSlug: slug, status: "cancelled" } }),
  ]);

  const rated = cases.filter((c) => c.rating > 0);
  const avgRating = rated.length > 0 ? rated.reduce((s, c) => s + c.rating, 0) / rated.length : 0;
  const reputation = computeReputation({ avgRating, caseCount: cases.length, done, cancelled });

  await prisma.agent.update({
    where: { slug },
    data: {
      completedCases: cases.length,
      avgCaseRating: Math.round(avgRating * 100) / 100,
      reputation,
    },
  });
}

/** 生成订单号 ODR-XXXXXX */
export function generateOrderCode(): string {
  return `ODR-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}
