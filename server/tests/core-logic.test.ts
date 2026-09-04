import { describe, expect, it } from "vitest";
import { conversationIdOf, normalizePair } from "../src/modules/connections/service";
import { scoreMatch } from "../src/modules/autopilot/service";
import { parseJsonArray, toJsonArray } from "../src/lib/json";

describe("对接关系规范化", () => {
  it("normalizePair 按字典序排序，消除方向性", () => {
    expect(normalizePair("beta", "alpha")).toEqual({ aSlug: "alpha", bSlug: "beta" });
    expect(normalizePair("alpha", "beta")).toEqual({ aSlug: "alpha", bSlug: "beta" });
  });

  it("conversationIdOf 双向对称", () => {
    expect(conversationIdOf("a", "b")).toBe(conversationIdOf("b", "a"));
    expect(conversationIdOf("a", "b")).toBe("a:b");
  });
});

describe("巡航匹配度评分", () => {
  const me = { industry: "企业服务", tags: [{ tagName: "拓客" }, { tagName: "CRM" }] };

  it("全标签重合 + 同行业 + 在线 + 自动接受 = 满分", () => {
    const peer = {
      industry: "企业服务",
      online: true,
      autoAccept: true,
      tags: [{ tagName: "拓客" }, { tagName: "CRM" }],
    };
    const { score, reason } = scoreMatch(me, peer);
    expect(score).toBe(100);
    expect(reason).toContain("共同标签:拓客、CRM");
  });

  it("无标签重合 + 跨行业 + 离线 + 需确认时分数显著偏低", () => {
    const peer = {
      industry: "农业",
      online: false,
      autoAccept: false,
      tags: [{ tagName: "种植" }],
    };
    const { score } = scoreMatch(me, peer);
    // 标签 0% × 45 + 行业 0.35 × 25 = 约 9 分
    expect(score).toBeLessThan(15);
  });

  it("半数标签重合时标签项得分减半", () => {
    const peer = {
      industry: "制造业",
      online: true,
      autoAccept: true,
      tags: [{ tagName: "拓客" }, { tagName: "供应链" }],
    };
    const { score } = scoreMatch(me, peer);
    // 标签 0.5×45=22.5 + 行业 0.35×25=8.75 + 在线 20 + 自动接受 10 ≈ 61
    expect(score).toBeGreaterThanOrEqual(55);
    expect(score).toBeLessThanOrEqual(65);
  });

  it("自身无标签时不产生除零错误", () => {
    const { score } = scoreMatch({ industry: "企业服务", tags: [] }, {
      industry: "企业服务",
      online: true,
      autoAccept: true,
      tags: [{ tagName: "拓客" }],
    });
    expect(Number.isFinite(score)).toBe(true);
  });
});

describe("JSON 数组安全解析", () => {
  it("合法 JSON 数组正常解析", () => {
    expect(parseJsonArray('["a","b"]')).toEqual(["a", "b"]);
  });

  it("非法输入回退默认值，不抛错", () => {
    expect(parseJsonArray("not-json")).toEqual([]);
    expect(parseJsonArray(null, ["x"])).toEqual(["x"]);
    expect(parseJsonArray('{"a":1}')).toEqual([]);
    expect(parseJsonArray("[1,2,3]")).toEqual([]);
  });

  it("toJsonArray 与 parseJsonArray 往返一致", () => {
    const values = ["拓客", "CRM", "线索"];
    expect(parseJsonArray(toJsonArray(values))).toEqual(values);
  });
});
