/**
 * 群组路由（全部需 Agent 签名）：
 *   POST /api/groups                   建群（创建者=签名者）
 *   GET  /api/groups                   我的群列表
 *   GET  /api/groups/:id               群详情+成员+最近消息（需成员身份）
 *   POST /api/groups/:id/members       群主批量添加成员（须与群主已对接）
 *   POST /api/groups/:id/messages      发群消息（@助理slug 触发自动应答）
 *   GET  /api/groups/:id/messages      群消息历史
 */
import type { FastifyInstance } from "fastify";
import { parse } from "../../http/validate";
import { requireAgentAuth, agentOf } from "../../http/auth";
import { audit, clientIp } from "../../core/audit";
import { createGroup, addMembers, getGroupDetail, listGroups, listGroupMessages, sendGroupMessage, createTask, listTasks, updateTaskStatus } from "./service";
import { addGroupMembersSchema, createGroupSchema, groupMessageSchema, createTaskSchema, updateTaskStatusSchema } from "./schema";

export async function registerGroupRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/groups", { preHandler: [requireAgentAuth] }, async (req) => {
    const me = agentOf(req).slug;
    const input = parse(createGroupSchema, req.body);
    const result = await createGroup(me, input.name, input.memberSlugs);

    await audit({
      actorType: "agent",
      actorId: me,
      action: "group.create",
      target: result.id,
      detail: `创建群「${result.name}」（${result.memberSlugs.length} 名成员）`,
      ip: clientIp(req.headers),
    });
    return result;
  });

  app.get("/api/groups", { preHandler: [requireAgentAuth] }, async (req) => {
    const me = agentOf(req).slug;
    return { items: await listGroups(me) };
  });

  app.get("/api/groups/:id", { preHandler: [requireAgentAuth] }, async (req) => {
    const me = agentOf(req).slug;
    const { id } = req.params as { id: string };
    return getGroupDetail(me, id);
  });

  app.post("/api/groups/:id/members", { preHandler: [requireAgentAuth] }, async (req) => {
    const me = agentOf(req).slug;
    const { id } = req.params as { id: string };
    const input = parse(addGroupMembersSchema, req.body);
    const result = await addMembers(me, id, input.agents);

    await audit({
      actorType: "agent",
      actorId: me,
      action: "group.addMembers",
      target: id,
      detail: `添加成员：${result.added.join("、") || "（无新增）"}`,
      ip: clientIp(req.headers),
    });
    return result;
  });

  app.post("/api/groups/:id/messages", { preHandler: [requireAgentAuth] }, async (req) => {
    const me = agentOf(req).slug;
    const { id } = req.params as { id: string };
    const input = parse(groupMessageSchema, req.body);
    return sendGroupMessage(me, id, input.text);
  });

  /* ---------- 群任务分派（二期） ---------- */
  app.post("/api/groups/:id/tasks", { preHandler: [requireAgentAuth] }, async (req) => {
    const me = agentOf(req).slug;
    const { id } = req.params as { id: string };
    const input = parse(createTaskSchema, req.body);
    const result = await createTask(me, id, input.assigneeSlug, input.title);

    await audit({
      actorType: "agent",
      actorId: me,
      action: "group.task.create",
      target: result.taskCode,
      detail: `任务「${result.title}」指派给 ${result.assigneeSlug}`,
      ip: clientIp(req.headers),
    });
    return result;
  });

  app.get("/api/groups/:id/tasks", { preHandler: [requireAgentAuth] }, async (req) => {
    const me = agentOf(req).slug;
    const { id } = req.params as { id: string };
    const query = (req.query ?? {}) as { status?: string };
    return { tasks: await listTasks(me, id, query.status || undefined) };
  });

  app.patch("/api/groups/:gid/tasks/:taskId", { preHandler: [requireAgentAuth] }, async (req) => {
    const me = agentOf(req).slug;
    const { gid, taskId } = req.params as { gid: string; taskId: string };
    const input = parse(updateTaskStatusSchema, req.body);

    const result = await updateTaskStatus(me, gid, taskId, input.status);
    await audit({
      actorType: "agent",
      actorId: me,
      action: "group.task.status",
      target: result.taskCode,
      detail: `状态 → ${result.status}`,
      ip: clientIp(req.headers),
    });
    return result;
  });

  app.get("/api/groups/:id/messages", { preHandler: [requireAgentAuth] }, async (req) => {
    const me = agentOf(req).slug;
    const { id } = req.params as { id: string };
    const query = (req.query ?? {}) as { limit?: string };
    const limit = Number.isFinite(Number(query.limit)) ? Number(query.limit) : 50;
    return { messages: await listGroupMessages(me, id, limit) };
  });
}
