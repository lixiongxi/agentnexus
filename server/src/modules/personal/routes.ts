import type { FastifyInstance } from "fastify";
import { parse } from "../../http/validate";
import { agentOf, requireAgentAuth } from "../../http/auth";
import { audit, clientIp } from "../../core/audit";
import { AppError, ErrorCode } from "../../core/errors";
import {
  addCaseSchema,
  personalRegisterSchema,
  publishAgentSchema,
  toggleOrderAcceptSchema,
} from "./schema";
import { addCase, getAbilityProfile, publishAgent, registerPersonal, setAcceptingOrders } from "./service";

export async function registerPersonalRoutes(app: FastifyInstance): Promise<void> {
  /* ---------- 注册登记（公开）：个人向字段 → 账号 + 草稿 Agent ---------- */
  app.post("/api/personal/register", async (req) => {
    const input = parse(personalRegisterSchema, req.body);
    const result = await registerPersonal(input);
    await audit({
      actorType: "owner",
      actorId: result.agent.slug,
      action: "personal.register",
      target: result.profile.email ?? "",
      ip: clientIp(req.headers),
    });
    return result;
  });

  /* ---------- 发布 / 编辑个人 Agent 能力声明（Agent 签名，仅本人） ---------- */
  app.patch("/api/agents/:slug/ability", { preHandler: [requireAgentAuth] }, async (req) => {
    const { slug } = req.params as { slug: string };
    const ctx = agentOf(req);
    if (ctx.slug !== slug) {
      throw new AppError(ErrorCode.FORBIDDEN, "只能发布/编辑自己的 Agent");
    }
    const input = parse(publishAgentSchema, req.body);
    const view = await publishAgent(slug, input);
    await audit({
      actorType: "agent",
      actorId: slug,
      action: input.publish ? "agent.publish" : "agent.save-draft",
      target: slug,
      detail: `services=${input.services.length} cases=${input.cases.length}`,
      ip: clientIp(req.headers),
    });
    return view;
  });

  /* ---------- 能力名片（公开）：服务清单 + 案例墙 + 统计 ---------- */
  app.get("/api/agents/:slug/ability", async (req) => {
    const { slug } = req.params as { slug: string };
    return getAbilityProfile(slug);
  });

  /* ---------- 补充历史案例（签名，仅本人） ---------- */
  app.post("/api/agents/:slug/cases", { preHandler: [requireAgentAuth] }, async (req) => {
    const { slug } = req.params as { slug: string };
    const ctx = agentOf(req);
    if (ctx.slug !== slug) throw new AppError(ErrorCode.FORBIDDEN, "只能补充自己的案例");
    const input = parse(addCaseSchema, req.body);
    return addCase(slug, input);
  });

  /* ---------- 接单开关（签名，仅本人） ---------- */
  app.patch("/api/agents/:slug/accepting", { preHandler: [requireAgentAuth] }, async (req) => {
    const { slug } = req.params as { slug: string };
    const ctx = agentOf(req);
    if (ctx.slug !== slug) throw new AppError(ErrorCode.FORBIDDEN, "只能修改自己的接单状态");
    const { acceptingOrders } = parse(toggleOrderAcceptSchema, req.body);
    return setAcceptingOrders(slug, acceptingOrders);
  });
}
