/**
 * 服务入口：启动自检 → 构建应用 → 挂载定时任务 → 监听 → 优雅退出。
 */
import { assertSafeStartup, config } from "./core/config";
import { SEED_AGENT_SLUGS } from "./core/constants";
import { buildApp } from "./app";
import { disconnectDb } from "./db/client";
import { purgeExpiredSessions } from "./modules/auth/service";
import { listCruiseTargets, pruneLogs, runAutopilot } from "./modules/autopilot/service";

/** ---------------- 启动自检 ---------------- */
assertSafeStartup();

const app = await buildApp();

/* ---------------- 定时任务 ---------------- */

/**
 * 自主巡航：按配置周期扫描广场并自动对接。
 * 只针对用户注册的 Agent，跳过平台示范 Agent。
 */
async function autopilotTick(): Promise<void> {
  if (!config.autopilot.enabled) return;
  try {
    const targets = await listCruiseTargets([...SEED_AGENT_SLUGS]);
    for (const slug of targets) {
      try {
        const result = await runAutopilot(slug);
        if (result.created > 0) {
          app.log.info(`[autopilot] ${slug} 自动对接 ${result.created} 个 Agent`);
        }
      } catch (err: unknown) {
        app.log.warn(`[autopilot] ${slug} 巡航失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err: unknown) {
    app.log.error(`[autopilot] 巡航异常: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** 清理任务：过期会话 + 超额巡航日志 */
async function maintenanceTick(): Promise<void> {
  try {
    const sessions = await purgeExpiredSessions();
    const logs = await pruneLogs();
    if (sessions > 0 || logs > 0) {
      app.log.info(`[maintenance] 清理过期会话 ${sessions} 条 / 超额巡航日志 ${logs} 条`);
    }
  } catch (err: unknown) {
    app.log.warn(`[maintenance] 清理失败: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const autopilotTimer = setInterval(autopilotTick, config.autopilot.intervalMs);
const maintenanceTimer = setInterval(maintenanceTick, 60 * 60 * 1000); // 每小时

// 启动后延迟首跑，避免与初始化/迁移争抢资源
const firstRunTimer = setTimeout(() => {
  void autopilotTick();
  void maintenanceTick();
}, config.autopilot.firstRunDelayMs);

/* ---------------- 监听 ---------------- */

try {
  await app.listen({ port: config.server.port, host: config.server.host });
  app.log.info(
    `\n✅ AgentNexus 服务端已启动: http://localhost:${config.server.port}` +
      `\n   WS: ws://localhost:${config.server.port}/ws` +
      `\n   鉴权模式: ${config.security.authMode}\n`,
  );
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

/* ---------------- 优雅退出 ---------------- */

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info(`收到 ${signal}，正在优雅退出...`);

  clearInterval(autopilotTimer);
  clearInterval(maintenanceTimer);
  clearTimeout(firstRunTimer);

  try {
    await app.close();
    await disconnectDb();
    app.log.info("已安全退出");
    process.exit(0);
  } catch (err: unknown) {
    app.log.error(`退出异常: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => void shutdown(sig));
}

// 兜底：未捕获异常记录后退出，避免进程处于不确定状态继续服务
process.on("unhandledRejection", (reason: unknown) => {
  app.log.error(`未处理的 Promise 拒绝: ${reason instanceof Error ? reason.message : String(reason)}`);
});
