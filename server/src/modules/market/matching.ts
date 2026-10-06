/**
 * 撮合匹配引擎（个人端核心）
 *
 * 排序哲学：**案例优先** —— 「做过同类且口碑好的人」排在「标签相似但没做过」的人前面。
 *
 *   Score = 100 × [ 0.40·CaseScore（案例质量）
 *                 + 0.30·SkillScore（能力匹配）
 *                 + 0.20·TrustScore（信誉信任）
 *                 + 0.10·ActivityScore（活跃度） ]
 *
 * 冷启动保护：无案例时 CaseScore 取中性 0.45，避免新用户永远无曝光；
 * Top-N 保留探索位（案例 < 2 的新 Agent 占 2 席）。
 */
import { prisma } from "../../db/client";

export interface MatchFactors {
  /** 案例质量明细 */
  caseScore: number;
  caseCount: number;
  avgCaseRating: number;
  sameTagCases: number;
  /** 能力匹配明细 */
  skillScore: number;
  skillCoverage: number;
  skillPrecision: number;
  hitService: boolean;
  /** 信誉与活跃 */
  trustScore: number;
  reputation: number;
  activityScore: number;
}

export interface MatchCandidate {
  slug: string;
  name: string;
  emoji: string;
  role: string;
  serviceIntro: string;
  city: string | null;
  tags: string[];
  completedCases: number;
  avgCaseRating: number;
  reputation: number;
  score: number;
  factors: MatchFactors;
  reasons: string[];
}

export interface MatchInput {
  demandTags: string[];
  demanderSlug: string;
  limit?: number;
}

const W = { caseScore: 0.4, skillScore: 0.3, trustScore: 0.2, activityScore: 0.1 } as const;
const NEW_USER_NEUTRAL_CASE = 0.45; // 无案例中性分
const EXPLORE_SEATS = 2; // 探索位：给案例不足的新 Agent

function parseTags(raw: string): string[] {
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}

/** 同类别折算：不同标签但互为子串（如「AI视频」与「AI短视频」）按 0.6 计入 */
function fuzzyHit(needTags: string[], haveTags: string[]): { exact: number; partial: number } {
  let exact = 0;
  let partial = 0;
  for (const need of needTags) {
    const hitExact = haveTags.some((h) => h === need);
    if (hitExact) {
      exact += 1;
      continue;
    }
    const hitPartial = haveTags.some((h) => h.includes(need) || need.includes(h));
    if (hitPartial) partial += 1;
  }
  return { exact, partial };
}

/** ① 案例质量 CaseScore（权重 0.40） */
function computeCaseScore(params: {
  caseCount: number;
  avgRating: number;
  sameTagCases: number;
  demandTagCount: number;
}): { score: number; sameTagCases: number } {
  if (params.caseCount === 0) return { score: NEW_USER_NEUTRAL_CASE, sameTagCases: 0 };

  const volume = Math.min(params.caseCount / 10, 1); // 10 单封顶
  const quality = params.avgRating > 0 ? params.avgRating / 5 : 0.6;
  const relevance =
    params.demandTagCount > 0 ? Math.min(params.sameTagCases / params.demandTagCount, 1) : 0;

  const score = 0.45 * volume + 0.35 * quality + 0.2 * relevance;
  return { score: Math.min(score, 1), sameTagCases: params.sameTagCases };
}

/** ② 能力匹配 SkillScore（权重 0.30） */
function computeSkillScore(params: {
  demandTags: string[];
  agentTags: string[];
  hitService: boolean;
}): { score: number; coverage: number; precision: number } {
  if (params.demandTags.length === 0) return { score: 0.5, coverage: 0, precision: 0 };

  const { exact, partial } = fuzzyHit(params.demandTags, params.agentTags);
  const matched = exact + partial * 0.6;

  const coverage = Math.min(matched / params.demandTags.length, 1);
  const precision = params.agentTags.length > 0 ? Math.min(matched / params.agentTags.length, 1) : 0;

  let score = 0.7 * coverage + 0.3 * precision;
  if (params.hitService) score = Math.min(score * 1.1, 1); // 命中具体服务项加权重
  return { score, coverage, precision };
}

/** ③ 信誉信任 TrustScore（权重 0.20） */
function computeTrustScore(reputation: number, done: number, cancelled: number): number {
  const total = done + cancelled;
  const cancelRate = total > 0 ? cancelled / total : 0;
  return 0.6 * (reputation / 100) + 0.4 * (1 - cancelRate);
}

/** ④ 活跃度 ActivityScore（权重 0.10，14 天半衰期） */
function computeActivityScore(lastActiveAt: Date): number {
  const days = Math.max((Date.now() - lastActiveAt.getTime()) / 86400000, 0);
  return Math.exp(-days / 14);
}

/** 排序理由（可解释性，前端直接展示） */
function buildReasons(c: {
  factors: MatchFactors;
  avgCaseRating: number;
  completedCases: number;
}): string[] {
  const reasons: string[] = [];
  const f = c.factors;
  if (f.caseCount > 0) {
    let r = `已交付 ${f.caseCount} 单案例`;
    if (f.sameTagCases > 0) r += `（其中 ${f.sameTagCases} 单同类）`;
    reasons.push(r);
    if (c.avgCaseRating > 0) reasons.push(`案例平均 ${c.avgCaseRating.toFixed(1)} 星`);
  } else {
    reasons.push("新入驻（无历史案例，享探索推荐位）");
  }
  reasons.push(`能力匹配 ${Math.round(f.skillCoverage * 100)}%`);
  if (f.hitService) reasons.push("命中具体服务项");
  reasons.push(`信誉分 ${Math.round(f.reputation)}`);
  return reasons;
}

/**
 * 为一条需求匹配候选 Agent。
 * 召回：已发布 + 接受订单 + 非需求方本人；标签命中（精确或模糊）或服务项命中。
 */
export async function matchAgentsForDemand(input: MatchInput): Promise<MatchCandidate[]> {
  const limit = input.limit ?? 20;

  // ---------- 召回 ----------
  const agents = await prisma.agent.findMany({
    where: {
      publishStatus: "published",
      acceptingOrders: true,
      slug: { not: input.demanderSlug },
      status: "active",
    },
    include: {
      tags: true,
      services: true,
      owner: { select: { city: true } },
    },
    take: 500, // 个人端规模下一次性召回，避免复杂 SQL；超规模再引入倒排/向量
  });

  const demandTags = input.demandTags.filter(Boolean);

  // ---------- 打分 ----------
  const scored: MatchCandidate[] = [];

  for (const agent of agents) {
    const agentTags = agent.tags.map((t) => t.tagName);
    const serviceTagList = agent.services.flatMap((s) => parseTags(s.tags));

    // 召回过滤：无标签需求则全量参与；有标签则需有任一标签交集（含服务项标签）
    const pool = Array.from(new Set([...agentTags, ...serviceTagList]));
    const hasOverlap =
      demandTags.length === 0 ||
      demandTags.some((d) => pool.some((p) => p === d || p.includes(d) || d.includes(p)));
    if (!hasOverlap) continue;

    const hitService = serviceTagList.some((t) =>
      demandTags.some((d) => t === d || t.includes(d) || d.includes(t)),
    );

    // 同类案例：案例标签与需求标签有交集
    const cases = await prisma.serviceCase.findMany({
      where: { agentSlug: agent.slug },
      select: { tags: true, rating: true },
    });
    const sameTagCases = cases.filter((c) => {
      const ct = parseTags(c.tags);
      return ct.some((t) => demandTags.some((d) => t === d || t.includes(d) || d.includes(t)));
    }).length;

    const { score: caseScore } = computeCaseScore({
      caseCount: agent.completedCases,
      avgRating: agent.avgCaseRating,
      sameTagCases,
      demandTagCount: demandTags.length,
    });
    const skill = computeSkillScore({ demandTags, agentTags: pool, hitService });

    const [done, cancelled] = await Promise.all([
      prisma.order.count({ where: { providerSlug: agent.slug, status: "done" } }),
      prisma.order.count({ where: { providerSlug: agent.slug, status: "cancelled" } }),
    ]);
    const trustScore = computeTrustScore(agent.reputation, done, cancelled);
    const activityScore = computeActivityScore(agent.updatedAt);

    const factors: MatchFactors = {
      caseScore,
      caseCount: agent.completedCases,
      avgCaseRating: agent.avgCaseRating,
      sameTagCases,
      skillScore: skill.score,
      skillCoverage: skill.coverage,
      skillPrecision: skill.precision,
      hitService,
      trustScore,
      reputation: agent.reputation,
      activityScore,
    };

    const score =
      100 *
      (W.caseScore * caseScore +
        W.skillScore * skill.score +
        W.trustScore * trustScore +
        W.activityScore * activityScore);

    scored.push({
      slug: agent.slug,
      name: agent.name,
      emoji: agent.emoji,
      role: agent.role,
      serviceIntro: agent.serviceIntro,
      city: agent.owner?.city || null,
      tags: agentTags,
      completedCases: agent.completedCases,
      avgCaseRating: agent.avgCaseRating,
      reputation: agent.reputation,
      score: Math.round(score * 10) / 10,
      factors,
      reasons: [],
    });
  }

  // ---------- 排序（案例优先 → 评分 → 活跃度） ----------
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.avgCaseRating !== a.avgCaseRating) return b.avgCaseRating - a.avgCaseRating;
    return b.factors.activityScore - a.factors.activityScore;
  });

  const top = scored.slice(0, Math.max(limit - EXPLORE_SEATS, 1));

  // ---------- 探索位：给案例不足的新 Agent 机会 ----------
  const newcomers = scored
    .filter((c) => c.factors.caseCount < 2 && !top.some((t) => t.slug === c.slug))
    .slice(0, EXPLORE_SEATS);

  const result = [...top, ...newcomers]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  for (const c of result) {
    c.reasons = buildReasons({ factors: c.factors, avgCaseRating: c.avgCaseRating, completedCases: c.completedCases });
  }
  return result;
}
