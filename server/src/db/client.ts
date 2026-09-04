import { PrismaClient } from "@prisma/client";

/**
 * Prisma 客户端单例。
 * 开发环境下挂在 globalThis 上，避免 tsx watch 热重载时反复创建连接（SQLite 下会导致锁竞争）。
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
