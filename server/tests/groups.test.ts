import { describe, expect, it } from "vitest";
import { extractMentions, GROUP_MAX_MEMBERS } from "../src/modules/groups/service";
import { addGroupMembersSchema, createGroupSchema } from "../src/modules/groups/schema";

describe("群组服务（纯逻辑部分）", () => {
  it("extractMentions：行首/空格分隔的 @slug，去重且最多 3 个", () => {
    expect(extractMentions("请 @xiaotuo 和 @xiaocai 看一下")).toEqual(["xiaotuo", "xiaocai"]);
    expect(extractMentions("@assistant-abc 帮我查")).toEqual(["assistant-abc"]);
    expect(extractMentions("@aa @aa @bb")).toEqual(["aa", "bb"]);
    expect(extractMentions("邮箱里含@test不算 mention：a@test.com")).toEqual([]);
    expect(extractMentions("没有提及")).toEqual([]);
    expect(extractMentions("@aa @bb @cc @dd").length).toBe(3);
  });

  it("群成员上限常量 = 50", () => {
    expect(GROUP_MAX_MEMBERS).toBe(50);
  });

  it("建群 schema：名称必填、初始成员为 slug 数组", () => {
    const ok = createGroupSchema.safeParse({ name: "项目协作群", memberSlugs: ["xiaotuo", "xiaocai"] });
    expect(ok.success).toBe(true);

    const bad = createGroupSchema.safeParse({ memberSlugs: [] });
    expect(bad.success).toBe(false);
  });

  it("加成员 schema：agents 非空且为合法 slug", () => {
    expect(addGroupMembersSchema.safeParse({ agents: ["xiaotuo"] }).success).toBe(true);
    expect(addGroupMembersSchema.safeParse({ agents: [] }).success).toBe(false);
    expect(addGroupMembersSchema.safeParse({ agents: ["Bad Slug!"] }).success).toBe(false);
  });
});
