/**
 * PG 集成测试（v3 数据持久化）：
 *   - 仅当 DATABASE_URL 为 postgres:// 时执行（本地/CI 连真实库验证）
 *   - 覆盖用户关切：① 注册邮箱唯一性（重复注册 → 409）② FAQ 逐条结构化持久化
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/db/client";
import { registerOwner } from "../src/modules/auth/service";
import { updateAssistant, getAssistant } from "../src/modules/assistants/service";
import { registerAgent } from "../src/modules/agents/service";

const isPg = (process.env.DATABASE_URL ?? "").startsWith("postgres");
const d = isPg ? describe : describe.skip;

const unique = () => Math.random().toString(36).slice(2, 8);

d("PG 集成：注册唯一性与知识库结构化", () => {
  // 云库（Neon 美东）往返延迟高，用例超时放宽到 90s
  const T = { timeout: 90_000 };
  const email = `pgtest-${unique()}@test.com`;

  beforeAll(async () => {
    // 清理同名邮箱残留（幂等）
    await prisma.owner.deleteMany({ where: { email } });
  });

  afterAll(async () => {
    await prisma.owner.deleteMany({ where: { email } });
  });

  it("同邮箱重复注册 → 409 该邮箱已注册（数据库级唯一约束兜底）", T, async () => {
    const base = {
      name: "唯一性验证",
      org: "AgentNexus",
      title: "",
      email,
      password: "password123",
    };
    const first = await registerOwner(base);
    expect(first.token).toBeTruthy();

    let conflictMessage = "";
    try {
      await registerOwner(base);
    } catch (err) {
      conflictMessage = err instanceof Error ? err.message : String(err);
    }
    expect(conflictMessage).toContain("该邮箱已注册");

    // 清理：删除首个 owner（级联会话）
    await prisma.owner.delete({ where: { id: first.owner.id } });
  });

  it("FAQ/产品逐条结构化持久化（独立表，逐条回读核对）", T, async () => {
    const slug = `pg-kb-${unique()}`;
    const registered = await registerAgent({
      name: "知识库结构化验证",
      slug,
      emoji: "🗂️",
      color: "#4F6BFF",
      role: "验证知识库独立表",
      description: "",
      industry: "测试",
      tags: [],
      autoAccept: true,
      online: true,
      owner: { name: "tester", org: "AgentNexus", title: "" },
    });
    expect(registered.secret).toBeTruthy();

    const faq = [
      { keywords: ["退货", "退款"], answer: "7 天无理由退货。" },
      { keywords: ["发货"], answer: "48 小时内发货。" },
      { keywords: ["保修"], answer: "整机保修一年。" },
    ];
    const products = [
      { name: "工业机床 X1", keywords: ["机床", "x1"], pitch: "高精度", priceRange: "10-20 万", followup: "需要参数手册吗？" },
      { name: "售后套餐", keywords: ["售后", "维保"], pitch: "快速响应", priceRange: "按年订阅", followup: "留下联系方式？" },
    ];
    await updateAssistant(slug, {
      capabilities: { secretary: true, sales: true, ticket: true },
      faq,
      products,
      secretary: { bookable: ["演示会议"], workHours: { start: "09:00", end: "18:00" } },
      ticket: {},
      escalate: {},
      fallback: "已转人工。",
      integrations: {},
    });

    // 逐条回读核对（数据库独立表）
    const faqRows = await prisma.faqEntry.findMany({ where: { agentSlug: slug }, orderBy: { sortOrder: "asc" } });
    const productRows = await prisma.productEntry.findMany({ where: { agentSlug: slug }, orderBy: { sortOrder: "asc" } });
    expect(faqRows.length).toBe(3);
    expect(faqRows[0]?.answer).toBe("7 天无理由退货。");
    expect(faqRows[2]?.keywords).toContain("保修");
    expect(productRows.length).toBe(2);
    expect(productRows[1]?.name).toBe("售后套餐");

    // 公开视图形状不变（前端兼容）
    const view = await getAssistant(slug);
    expect(view.profile.faq.length).toBe(3);
    expect(view.profile.products[0]?.name).toBe("工业机床 X1");

    // 清理
    await prisma.agent.delete({ where: { slug } });
  });
});
