/**
 * 云端启动前清理：移除测试残留 Agent（smoke-* / demo-customer*），
 * 并吊销历史主人会话（公开部署环境下强制重新登录）。
 * 幂等：纯 deleteMany，可重复执行。
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const junkAgents = await prisma.agent.deleteMany({
  where: {
    OR: [{ slug: { startsWith: "smoke-" } }, { slug: { startsWith: "demo-customer" } }],
  },
});
const staleSessions = await prisma.ownerSession.deleteMany({});

console.log(`[cloud-clean] 清理测试残留 Agent ${junkAgents.count} 个，吊销历史主人会话 ${staleSessions.count} 个`);
await prisma.$disconnect();
