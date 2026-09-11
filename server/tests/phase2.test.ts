import { describe, expect, it } from "vitest";
import { parseTaskCommand, TASK_TRANSITIONS } from "../src/modules/groups/service";
import { checkMomentRateLimit, resetMomentRateLimit } from "../src/modules/moments/service";
import { AppError } from "../src/core/errors";
import { registerWithAgentSchema } from "../src/modules/auth/schema";

describe("群任务分派（二期）", () => {
  it("parseTaskCommand：@成员 任务：描述 与 任务：@成员 描述 两种写法等价", () => {
    expect(parseTaskCommand("@xiaohu 任务：整理本周报表")).toEqual({
      assignee: "xiaohu",
      title: "整理本周报表",
    });
    expect(parseTaskCommand("任务：@xiaohu 整理本周报表")).toEqual({
      assignee: "xiaohu",
      title: "整理本周报表",
    });
    // 普通消息与 @助理 查询不触发任务
    expect(parseTaskCommand("@assistant-298c 你们有什么机床？")).toBeNull();
    expect(parseTaskCommand("大家好，周五对齐计划")).toBeNull();
  });

  it("任务状态机：合法流转开放，done/failed 为终态", () => {
    expect(TASK_TRANSITIONS.open).toContain("working");
    expect(TASK_TRANSITIONS.open).toContain("done");
    expect(TASK_TRANSITIONS.working).toContain("done");
    expect(TASK_TRANSITIONS.done).toEqual([]);
    expect(TASK_TRANSITIONS.failed).toEqual([]);
    // open → working → open 不允许（working 无 open 出边）
    expect(TASK_TRANSITIONS.working).not.toContain("open");
  });
});

describe("动态频控（二期）", () => {
  it("2 秒内连发被拒，超过窗口或重置后恢复", () => {
    resetMomentRateLimit();
    const now = Date.now();
    checkMomentRateLimit("agent-a", now);
    expect(() => checkMomentRateLimit("agent-a", now + 500)).toThrow(AppError);
    checkMomentRateLimit("agent-a", now + 2100); // 超过 2 秒间隔，放行
    resetMomentRateLimit();
  });

  it("每分钟 20 条上限：第 21 条抛 429", () => {
    resetMomentRateLimit();
    const base = Date.now();
    // 以 2.1 秒间隔发 20 条（不触发间隔限制）
    for (let i = 0; i < 20; i++) {
      checkMomentRateLimit("agent-b", base + i * 2100);
    }
    expect(() => checkMomentRateLimit("agent-b", base + 20 * 2100)).toThrow(AppError);
    resetMomentRateLimit();
  });

  it("不同 Agent 频控互不影响", () => {
    resetMomentRateLimit();
    const now = Date.now();
    checkMomentRateLimit("agent-c", now);
    checkMomentRateLimit("agent-d", now);
    resetMomentRateLimit();
  });
});

describe("注册一体化 schema（二期）", () => {
  it("agent 块可选：纯账号注册合法；带 agent 时 name/role 必填", () => {
    const plain = registerWithAgentSchema.safeParse({
      name: "张伟", org: "示例科技", email: "a@b.com", password: "12345678",
    });
    expect(plain.success).toBe(true);

    const withAgent = registerWithAgentSchema.safeParse({
      name: "张伟", org: "示例科技", email: "a@b.com", password: "12345678",
      agent: { name: "小帆助理", role: "示例科技全能助理" },
    });
    expect(withAgent.success).toBe(true);

    const badAgent = registerWithAgentSchema.safeParse({
      name: "张伟", org: "示例科技", email: "a@b.com", password: "12345678",
      agent: { name: "" },
    });
    expect(badAgent.success).toBe(false);
  });
});
