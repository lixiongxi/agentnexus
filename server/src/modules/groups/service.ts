/**
 * 群组服务：多 Agent 协作空间（企业 Agent 微信 · 群聊）。
 *
 * 规则（v1 简化且符合微信直觉）：
 *   - 创建者 = 群主，也是首个成员；群主不可退出（可整群弃用），v1 不做解散/转让
 *   - 添加成员仅群主可操作，且每个成员必须「与群主已建立对接」（isConnected）——
 *     群是关系链的延伸，不允许陌生人混入
 *   - 全体成员可发消息、可读全部历史
 *   - 消息文本中 @slug 且该 slug 存在助理配置（AssistantProfile）时，
 *     由 generateAutoReply 生成 type="bot" 回复（循环防护：bot 与助理自身消息不再触发）
 */
import crypto from "node:crypto";
import { prisma } from "../../db/client";
import { AppError, ErrorCode } from "../../core/errors";
import { publish } from "../../core/bus";
import { isConnected } from "../connections/service";
import { generateAutoReply } from "../../lib/autoreply";
import { GROUP_MAX_MEMBERS } from "./schema";
export { GROUP_MAX_MEMBERS };

export interface GroupBrief {
  id: string;
  name: string;
  creatorSlug: string;
  createdAt: string;
  memberCount: number;
  lastMessage: { fromAgent: string; text: string; createdAt: string } | null;
}

export interface GroupMessageView {
  id: string;
  groupId: string;
  fromAgent: string;
  text: string;
  type: string;
  createdAt: string;
}

export interface GroupMemberView {
  agentSlug: string;
  isCreator: boolean;
  name: string | null;
  emoji: string | null;
  online: boolean | null;
}

async function assertMembership(groupId: string, agentSlug: string): Promise<void> {
  const member = await prisma.groupMember.findUnique({
    where: { groupId_agentSlug: { groupId, agentSlug } },
  });
  if (!member) throw new AppError(ErrorCode.FORBIDDEN, `非群成员，无法访问群 ${groupId}`);
}

async function assertActiveAgent(agentSlug: string): Promise<void> {
  const agent = await prisma.agent.findUnique({ where: { slug: agentSlug }, select: { status: true } });
  if (!agent) throw new AppError(ErrorCode.NOT_FOUND, `Agent ${agentSlug} 不存在`);
  if (agent.status !== "active") throw new AppError(ErrorCode.AGENT_SUSPENDED, `Agent ${agentSlug} 已被停用`);
}

/* ---------------- 建群 ---------------- */

export async function createGroup(
  creatorSlug: string,
  name: string,
  memberSlugs: string[],
): Promise<{ id: string; name: string; memberSlugs: string[] }> {
  await assertActiveAgent(creatorSlug);

  const unique = [...new Set(memberSlugs.filter((s) => s !== creatorSlug))];
  for (const slug of unique) {
    await assertActiveAgent(slug);
    if (!(await isConnected(creatorSlug, slug))) {
      throw new AppError(ErrorCode.FORBIDDEN, `无法添加 ${slug}：需先与群主建立对接关系`);
    }
  }

  const group = await prisma.agentGroup.create({
    data: {
      name,
      creatorSlug,
      members: {
        create: [{ agentSlug: creatorSlug }, ...unique.map((agentSlug) => ({ agentSlug }))],
      },
    },
    include: { members: true },
  });

  return { id: group.id, name: group.name, memberSlugs: group.members.map((m) => m.agentSlug) };
}

/* ---------------- 我的群列表 ---------------- */

export async function listGroups(me: string): Promise<GroupBrief[]> {
  const memberships = await prisma.groupMember.findMany({ where: { agentSlug: me } });
  const groupIds = memberships.map((m) => m.groupId);
  if (groupIds.length === 0) return [];

  const groups = await prisma.agentGroup.findMany({
    where: { id: { in: groupIds } },
    include: { members: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "desc" },
  });

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    creatorSlug: g.creatorSlug,
    createdAt: g.createdAt.toISOString(),
    memberCount: g.members.length,
    lastMessage: g.messages[0]
      ? { fromAgent: g.messages[0].fromAgent, text: g.messages[0].text, createdAt: g.messages[0].createdAt.toISOString() }
      : null,
  }));
}

/* ---------------- 群详情 ---------------- */

export async function getGroupDetail(me: string, groupId: string) {
  await assertMembership(groupId, me);
  const group = await prisma.agentGroup.findUnique({
    where: { id: groupId },
    include: {
      members: { orderBy: { joinedAt: "asc" } },
      messages: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!group) throw new AppError(ErrorCode.NOT_FOUND, `群 ${groupId} 不存在`);

  const slugs = group.members.map((m) => m.agentSlug);
  const agents = await prisma.agent.findMany({
    where: { slug: { in: slugs } },
    select: { slug: true, name: true, emoji: true, online: true },
  });
  const brief = new Map(agents.map((a) => [a.slug, a]));

  return {
    id: group.id,
    name: group.name,
    creatorSlug: group.creatorSlug,
    createdAt: group.createdAt.toISOString(),
    members: group.members.map((m): GroupMemberView => {
      const a = brief.get(m.agentSlug);
      return {
        agentSlug: m.agentSlug,
        isCreator: m.agentSlug === group.creatorSlug,
        name: a?.name ?? null,
        emoji: a?.emoji ?? null,
        online: a?.online ?? null,
      };
    }),
    messages: group.messages.reverse().map(toMessageView),
  };
}

/* ---------------- 添加成员（仅群主） ---------------- */

export async function addMembers(me: string, groupId: string, agents: string[]): Promise<{ added: string[] }> {
  const group = await prisma.agentGroup.findUnique({ where: { id: groupId } });
  if (!group) throw new AppError(ErrorCode.NOT_FOUND, `群 ${groupId} 不存在`);
  if (group.creatorSlug !== me) {
    throw new AppError(ErrorCode.FORBIDDEN, "仅群主可以添加成员");
  }

  const existing = await prisma.groupMember.findMany({ where: { groupId }, select: { agentSlug: true } });
  const memberSet = new Set(existing.map((m) => m.agentSlug));

  const added: string[] = [];
  for (const slug of [...new Set(agents)]) {
    if (memberSet.has(slug)) continue;
    if (memberSet.size + added.length >= GROUP_MAX_MEMBERS) {
      throw new AppError(ErrorCode.CONFLICT, `群成员已达上限（${GROUP_MAX_MEMBERS}）`);
    }
    await assertActiveAgent(slug);
    if (!(await isConnected(me, slug))) {
      throw new AppError(ErrorCode.FORBIDDEN, `无法添加 ${slug}：需先与群主建立对接关系`);
    }
    await prisma.groupMember.create({ data: { groupId, agentSlug: slug } });
    memberSet.add(slug);
    added.push(slug);
  }
  return { added };
}

/* ---------------- 群消息 ---------------- */

function toMessageView(m: {
  id: string;
  groupId: string;
  fromAgent: string;
  text: string;
  type: string;
  createdAt: Date;
}): GroupMessageView {
  return {
    id: m.id,
    groupId: m.groupId,
    fromAgent: m.fromAgent,
    text: m.text,
    type: m.type,
    createdAt: m.createdAt.toISOString(),
  };
}

/** 提取消息中的 @slug（精确匹配，最多取 3 个） */
export function extractMentions(text: string): string[] {
  const found = [...text.matchAll(/(?:^|\s)@([a-z0-9][a-z0-9-]{1,39})/g)].map((m) => m[1] ?? "");
  return [...new Set(found)].slice(0, 3);
}

export async function sendGroupMessage(me: string, groupId: string, text: string): Promise<GroupMessageView> {
  await assertMembership(groupId, me);
  await assertActiveAgent(me);

  const created = await prisma.groupMessage.create({ data: { groupId, fromAgent: me, text } });
  const view = toMessageView(created);
  publish({ type: "group-message", payload: view });

  // 任务分派（优先级高于 @助理）：命中即建任务，不再触发助理引擎
  const taskCmd = parseTaskCommand(text);
  if (taskCmd) {
    try {
      const task = await createTask(me, groupId, taskCmd.assignee, taskCmd.title);
      const card = await prisma.groupMessage.create({
        data: {
          groupId,
          fromAgent: me,
          text: `📋 任务 ${task.taskCode} 已创建：${task.title}\n指派给 @${task.assigneeSlug}（状态：待处理）`,
          type: "bot",
        },
      });
      publish({ type: "group-message", payload: toMessageView(card) });
    } catch (err: unknown) {
      const reason = err instanceof AppError ? err.message : "创建失败";
      const errMsg = await prisma.groupMessage.create({
        data: { groupId, fromAgent: me, text: `⚠️ 任务创建失败：${reason}`, type: "bot" },
      });
      publish({ type: "group-message", payload: toMessageView(errMsg) });
    }
    return view;
  }

  // @助理应答：显式 @ 才触发；bot 回复直接落库，不再二次触发引擎（防循环）
  const mentions = extractMentions(text).filter((slug) => slug !== me);
  for (const slug of mentions) {
    const profile = await prisma.assistantProfile.findUnique({ where: { agentSlug: slug }, select: { agentSlug: true } });
    if (!profile) continue;
    const reply = await generateAutoReply(slug, me, text);
    if (!reply) continue;
    const botMsg = await prisma.groupMessage.create({
      data: { groupId, fromAgent: slug, text: reply, type: "bot" },
    });
    publish({ type: "group-message", payload: toMessageView(botMsg) });
  }

  return view;
}

export async function listGroupMessages(
  me: string,
  groupId: string,
  limit = 50,
): Promise<GroupMessageView[]> {
  await assertMembership(groupId, me);
  const rows = await prisma.groupMessage.findMany({
    where: { groupId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 200),
  });
  return rows.reverse().map(toMessageView);
}

/* ---------------- 群任务分派（二期） ---------------- */

/** 任务状态机：open→working→done|failed；working→done|failed；其余流转非法 */
export const TASK_TRANSITIONS: Record<string, string[]> = {
  open: ["working", "done", "failed"],
  working: ["done", "failed"],
  done: [],
  failed: [],
};

/**
 * 解析群消息中的任务指令（优先级高于 @助理，命中即不触发引擎）。
 * 支持两种写法：`@成员slug 任务[:：]描述` 或 `任务[:：]@成员slug 描述`。
 */
export function parseTaskCommand(text: string): { assignee: string; title: string } | null {
  const m1 = text.match(/(?:^|\s)@([a-z0-9][a-z0-9-]{1,39})\s*任务\s*[:：]\s*(.+)/);
  if (m1?.[1] && m1[2]) return { assignee: m1[1], title: m1[2].trim().slice(0, 200) };
  const m2 = text.match(/任务\s*[:：]\s*@([a-z0-9][a-z0-9-]{1,39})\s+(.+)/);
  if (m2?.[1] && m2[2]) return { assignee: m2[1], title: m2[2].trim().slice(0, 200) };
  return null;
}

function newTaskCode(): string {
  return `TSK-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

async function assertTaskMember(groupId: string, agentSlug: string): Promise<void> {
  await assertMembership(groupId, agentSlug);
  await assertActiveAgent(agentSlug);
}

/** 创建群任务（创建者与被指派人都必须是群成员） */
export async function createTask(
  me: string,
  groupId: string,
  assigneeSlug: string,
  title: string,
): Promise<{ id: string; taskCode: string; title: string; assigneeSlug: string; status: string }> {
  if (!title.trim()) throw new AppError(ErrorCode.VALIDATION_ERROR, "任务标题不能为空");
  if (assigneeSlug === me) throw new AppError(ErrorCode.VALIDATION_ERROR, "不能把任务指派给自己");
  await assertMembership(groupId, me);
  await assertTaskMember(groupId, assigneeSlug);

  return prisma.groupTask.create({
    data: { groupId, taskCode: newTaskCode(), title: title.trim(), assigneeSlug, creatorSlug: me },
  });
}

/** 群任务列表（可按状态筛选） */
export async function listTasks(
  me: string,
  groupId: string,
  status?: string,
): Promise<
  Array<{ id: string; taskCode: string; title: string; assigneeSlug: string; creatorSlug: string; status: string; createdAt: string; updatedAt: string }>
> {
  await assertMembership(groupId, me);
  const rows = await prisma.groupTask.findMany({
    where: { groupId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((t) => ({
    id: t.id,
    taskCode: t.taskCode,
    title: t.title,
    assigneeSlug: t.assigneeSlug,
    creatorSlug: t.creatorSlug,
    status: t.status,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));
}

/** 任务状态流转：仅创建者/被指派人可调，非法流转 400 */
export async function updateTaskStatus(me: string, groupId: string, taskId: string, nextStatus: string) {
  await assertMembership(groupId, me);
  const task = await prisma.groupTask.findUnique({ where: { id: taskId } });
  if (!task || task.groupId !== groupId) throw new AppError(ErrorCode.NOT_FOUND, "任务不存在");
  if (task.creatorSlug !== me && task.assigneeSlug !== me) {
    throw new AppError(ErrorCode.FORBIDDEN, "仅任务创建者或被指派人可以更新状态");
  }
  const allowed = TASK_TRANSITIONS[task.status] ?? [];
  if (!allowed.includes(nextStatus)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `不允许的状态流转：${task.status} → ${nextStatus}`);
  }
  const updated = await prisma.groupTask.update({ where: { id: taskId }, data: { status: nextStatus } });
  return {
    id: updated.id,
    taskCode: updated.taskCode,
    title: updated.title,
    assigneeSlug: updated.assigneeSlug,
    creatorSlug: updated.creatorSlug,
    status: updated.status,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  };
}
