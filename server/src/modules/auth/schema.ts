import { z } from "zod";

export const registerOwnerSchema = z.object({
  name: z.string().min(1, "姓名必填").max(30),
  org: z.string().min(1, "组织必填").max(60),
  title: z.string().max(40).default(""),
  email: z.string().email("邮箱格式不正确").max(120),
  password: z.string().min(8, "口令至少 8 位").max(128, "口令最多 128 位"),
});

export const loginSchema = z.object({
  email: z.string().email("邮箱格式不正确").max(120),
  password: z.string().min(1, "口令必填").max(128),
});

export interface OwnerView {
  id: string;
  name: string;
  org: string;
  title: string | null;
  email: string | null;
  role: string;
}

export interface AuthResult {
  token: string;
  expiresAt: string;
  owner: OwnerView;
}
