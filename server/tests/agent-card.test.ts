import { describe, expect, it } from "vitest";
import { buildAgentCard, slugifySkill } from "../src/lib/agent-card";

const baseInput = {
  slug: "tianxuan-sales",
  name: "天璇销售云",
  role: "企业销售助理：拓客、线索清洗与 CRM 同步",
  description: "",
  industry: "企业服务",
  tags: ["智能外呼", "CRM", "线索清洗"],
  online: true,
  verified: true,
  autoAccept: false,
  ownerName: "张伟",
  ownerOrg: "示例科技",
  a2aEndpoint: null,
  mcpEndpoint: null,
  baseUrl: "https://hub.example.com",
};

describe("Agent Card（A2A 适配版）", () => {
  it("description 为空时回退到 role，标签推导出 skills", () => {
    const card = buildAgentCard(baseInput) as Record<string, any>;
    expect(card.description).toBe(baseInput.role);
    expect((card.skills as any[]).length).toBe(3);
    expect(card.skills[0]).toMatchObject({ name: "智能外呼", tags: ["智能外呼", "企业服务"] });
    expect(String(card.skills[0].id)).toMatch(/^tianxuan-sales-/);
  });

  it("如实声明 HMAC 签名鉴权与时间窗", () => {
    const card = buildAgentCard(baseInput) as Record<string, any>;
    const scheme = card.securitySchemes.agentSignature;
    expect(scheme.scheme).toBe("hmac-sha256");
    expect(scheme.headers).toEqual(["X-Agent", "X-Timestamp", "X-Signature"]);
    expect(scheme.windowMs).toBe(5 * 60 * 1000);
    expect(card.security[0].agentSignature).toContain("X-Signature");
  });

  it("endpoints 覆盖互操作路径，a2aEndpoint 存在时优先作为 url", () => {
    const without = buildAgentCard(baseInput) as Record<string, any>;
    expect(without.url).toBe("https://hub.example.com");
    expect(without.endpoints.receiveA2a).toBe("https://hub.example.com/api/a2a/tianxuan-sales/message");

    const withA2a = buildAgentCard({ ...baseInput, a2aEndpoint: "https://agent.example.com/a2a" }) as Record<string, any>;
    expect(withA2a.url).toBe("https://agent.example.com/a2a");
    expect(withA2a.endpoints.receiveA2a).toContain("/api/a2a/tianxuan-sales/message");
  });

  it("mcpEndpoint 存在时暴露到 endpoints.mcp；对接策略进入扩展段", () => {
    const card = buildAgentCard({ ...baseInput, mcpEndpoint: "https://hub.example.com/mcp/sales" }) as Record<string, any>;
    expect(card.endpoints.mcp).toBe("https://hub.example.com/mcp/sales");
    expect((card as any)["x-agentnexus"].connectionPolicy).toBe("manual-approval");
    expect((card as any)["x-agentnexus"].verified).toBe(true);
  });

  it("slugifySkill：大小写归一、去特殊字符、空值兜底", () => {
    expect(slugifySkill(" CRM 同步 ")).toBe("crm-同步");
    expect(slugifySkill("A/B 测试!")).toBe("ab-测试");
    expect(slugifySkill("///")).toBe("skill");
  });
});
