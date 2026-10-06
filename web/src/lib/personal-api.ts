/**
 * 个人端 API 封装（v4）：注册登记 / 能力发布 / 需求 / 撮合 / 订单
 * 与 server/src/modules/personal|market 路由一一对应。
 */
import { api, withQuery } from "./api";

/* ---------------- 类型 ---------------- */

export interface PersonalProfile {
  id: string;
  name: string;
  email: string | null;
  city: string;
  bio: string;
  domains: string[];
}

export interface PersonalAgentRef {
  slug: string;
  secret: string;
  name: string;
  publishStatus: "draft" | "published";
}

export interface RegisterPersonalResult {
  token: string;
  profile: PersonalProfile;
  agent: PersonalAgentRef;
  next: "publish-agent";
}

export interface ServiceItem {
  title: string;
  tags: string[];
  deliverable: string;
  priceRange: string;
  cycleDays: number;
  intro: string;
}

export interface CaseItem {
  title: string;
  summary: string;
  tags: string[];
  rating: number;
  completedAt?: string;
  source?: string;
}

export interface AbilityProfile {
  agent: {
    slug: string;
    name: string;
    emoji: string;
    role: string;
    serviceIntro: string;
    publishStatus: string;
    acceptingOrders: boolean;
    online: boolean;
    tags: string[];
    completedCases: number;
    avgCaseRating: number;
    reputation: number;
    ownerName: string | null;
    ownerCity: string | null;
  };
  services: ServiceItem[];
  cases: CaseItem[];
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
  reasons: string[];
  factors: {
    caseScore: number;
    caseCount: number;
    sameTagCases: number;
    skillCoverage: number;
    hitService: boolean;
    reputation: number;
  };
}

export interface DemandView {
  id: string;
  ownerSlug: string;
  title: string;
  content: string;
  tags: string[];
  budget: string;
  deadline: string | null;
  status: string;
  createdAt: string;
}

export interface OrderView {
  id: string;
  orderCode: string;
  demandId: string | null;
  demanderSlug: string;
  providerSlug: string;
  title: string;
  amount: string;
  status: "active" | "delivered" | "done" | "cancelled";
  createdAt: string;
  myRole?: "demander" | "provider";
  reviews?: Array<{ fromSlug: string; score: number; comment: string }>;
}

/* ---------------- API ---------------- */

export const personalApi = {
  /** 注册登记（公开）：个人向字段 → 账号 + 草稿 Agent */
  register(input: {
    name: string;
    email: string;
    password: string;
    city?: string;
    bio?: string;
    domains?: string[];
  }) {
    return api.post<RegisterPersonalResult>("/api/personal/register", input);
  },

  /** 能力名片（公开） */
  ability(slug: string) {
    return api.get<AbilityProfile>(`/api/agents/${slug}/ability`);
  },

  /** 发布 / 编辑个人 Agent（Agent 签名，仅本人） */
  publishAbility(
    slug: string,
    input: {
      name: string;
      emoji?: string;
      role: string;
      serviceIntro: string;
      domains?: string[];
      acceptingOrders?: boolean;
      services?: ServiceItem[];
      cases?: Array<{ title: string; summary?: string; tags?: string[]; rating?: number }>;
      publish?: boolean;
    },
  ) {
    return api.patch<AbilityProfile>(`/api/agents/${slug}/ability`, input, { sign: true });
  },

  /** 补充历史案例（Agent 签名） */
  addCase(slug: string, input: { title: string; summary?: string; tags?: string[]; rating?: number }) {
    return api.post<{ added: boolean; completedCases: number }>(`/api/agents/${slug}/cases`, input, {
      sign: true,
    });
  },

  /** 接单开关（Agent 签名） */
  setAccepting(slug: string, acceptingOrders: boolean) {
    return api.patch<{ acceptingOrders: boolean }>(
      `/api/agents/${slug}/accepting`,
      { acceptingOrders },
      { sign: true },
    );
  },
};

export const marketApi = {
  /** 发布需求（Agent 签名） */
  createDemand(input: { title: string; content: string; tags?: string[]; budget?: string; deadline?: string }) {
    return api.post<DemandView>("/api/demands", input, { sign: true });
  },
  listDemands(query?: { status?: string; tag?: string; ownerSlug?: string }) {
    return api.get<{ items: DemandView[]; total: number }>(
      query ? withQuery("/api/demands", query as Record<string, string>) : "/api/demands",
    );
  },
  demand(id: string) {
    return api.get<DemandView>(`/api/demands/${id}`);
  },
  /** 匹配候选（案例优先排序） */
  matches(id: string, limit = 20) {
    return api.get<{ demand: DemandView; candidates: MatchCandidate[] }>(
      withQuery(`/api/demands/${id}/matches`, { limit }),
    );
  },
  /** 下单（邀请 / 应征） */
  createOrder(input: { demandId?: string; providerSlug: string; title?: string; amount?: string }) {
    return api.post<OrderView>("/api/orders", input, { sign: true });
  },
  myOrders(role?: "demander" | "provider") {
    return api.get<{ items: OrderView[] }>(
      role ? withQuery("/api/me/orders", { role }) : "/api/me/orders",
      { sign: true },
    );
  },
  order(id: string) {
    return api.get<OrderView>(`/api/orders/${id}`, { sign: true });
  },
  updateOrder(id: string, status: "delivered" | "done" | "cancelled") {
    return api.patch<OrderView>(`/api/orders/${id}`, { status }, { sign: true });
  },
  review(id: string, score: number, comment = "") {
    return api.post<{ created: boolean }>(`/api/orders/${id}/reviews`, { score, comment }, { sign: true });
  },
};
