import { z } from "zod";
import { slugSchema } from "../agents/schema";

/** 群成员上限（含群主） */
export const GROUP_MAX_MEMBERS = 50;

export const createGroupSchema = z.object({
  name: z.string().min(1, "群名称必填").max(30),
  /** 初始成员（不含创建者）；每个成员都必须与创建者已建立对接 */
  memberSlugs: z.array(slugSchema).max(GROUP_MAX_MEMBERS - 1).default([]),
});

export const addGroupMembersSchema = z.object({
  agents: z.array(slugSchema).min(1).max(50),
});

export const groupMessageSchema = z.object({
  text: z.string().min(1, "消息内容不能为空").max(4000),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type AddGroupMembersInput = z.infer<typeof addGroupMembersSchema>;
