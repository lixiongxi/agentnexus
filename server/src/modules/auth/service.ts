/**
 * 主人认证服务。
 *
 * v1 的 /api/auth/login 是「演示登录」——任意邮箱即可换取令牌，无任何凭据校验，
 * 且令牌是客户端自报的 base64，服务端不存储、无法吊销。本版改为：
 *  - 口令经 scrypt 加盐摘要存储，永不明文落库
 *  - 会话令牌为 256 位随机值，库里只存 SHA-256 摘要
 *  - 支持主动登出（服务端吊销）与过期自动失效
 */
import { prisma } from "../../db/client";
import { AppError, ErrorCode } from "../../core/errors";
import { generateSessionToken, hashPassword, hashToken, verifyPassword } from "../../lib/crypto";
import type { AuthResult, OwnerView } from "./schema";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

function toView(owner: {
  id: string;
  name: string;
  org: string;
  title: string | null;
  email: string | null;
  role: string;
}): OwnerView {
  return {
    id: owner.id,
    name: owner.name,
    org: owner.org,
    title: owner.title,
    email: owner.email,
    role: owner.role,
  };
}

export async function registerOwner(input: {
  name: string;
  org: string;
  title: string;
  email: string;
  password: string;
}): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.owner.findFirst({ where: { email } });
  if (existing) throw new AppError(ErrorCode.CONFLICT, "该邮箱已注册");

  const owner = await prisma.owner.create({
    data: {
      name: input.name,
      org: input.org,
      title: input.title || null,
      email,
      passwordHash: hashPassword(input.password),
    },
  });

  return issueSession(owner.id);
}

export async function login(input: { email: string; password: string }): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  const owner = await prisma.owner.findFirst({ where: { email } });

  // 恒定耗时路径：无论用户是否存在都执行一次口令校验，避免通过响应时间枚举账号
  const stored = owner?.passwordHash ?? "00".repeat(16) + ".00".repeat(64);
  const okPassword = verifyPassword(input.password, stored);

  // 无论邮箱是否存在都返回同一句提示，避免账号枚举
  if (!owner || !okPassword) {
    throw new AppError(ErrorCode.OWNER_TOKEN_INVALID, "邮箱或口令不正确");
  }

  return issueSession(owner.id);
}

async function issueSession(ownerId: string): Promise<AuthResult> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.ownerSession.create({
    data: { ownerId, tokenHash: hashToken(token), expiresAt },
  });

  const owner = await prisma.owner.findUniqueOrThrow({ where: { id: ownerId } });
  return { token, expiresAt: expiresAt.toISOString(), owner: toView(owner) };
}

/** 登出：吊销当前会话 */
export async function logout(token: string): Promise<void> {
  await prisma.ownerSession.updateMany({
    where: { tokenHash: hashToken(token) },
    data: { revokedAt: new Date() },
  });
}

/** 清理过期会话（启动时与定期任务调用） */
export async function purgeExpiredSessions(): Promise<number> {
  const res = await prisma.ownerSession.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - SESSION_TTL_MS) } },
  });
  return res.count;
}

export async function getOwnerById(id: string): Promise<OwnerView> {
  const owner = await prisma.owner.findUnique({ where: { id } });
  if (!owner) throw new AppError(ErrorCode.NOT_FOUND, "主人不存在");
  return toView(owner);
}
