import { z } from "zod";

export const slugField = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, "Agent 标识格式不合法");

export const createConnectionSchema = z
  .object({
    fromAgent: slugField,
    toAgent: slugField,
  })
  .refine((v) => v.fromAgent !== v.toAgent, { message: "不能对接自己", path: ["toAgent"] });

export type CreateConnectionInput = z.infer<typeof createConnectionSchema>;

export interface PeerBrief {
  slug: string;
  name: string;
  emoji: string;
  color: string;
  role: string;
  industry: string;
  online: boolean;
  verified: boolean;
  tags: string[];
}

export interface LastMessageBrief {
  id: string;
  fromAgent: string;
  toAgent: string;
  text: string;
  type: string;
  createdAt: string;
}

export interface ConnectionView {
  id: string;
  peer: PeerBrief;
  since: string;
  last: LastMessageBrief | null;
  unread: number;
}
