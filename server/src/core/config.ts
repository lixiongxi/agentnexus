/**
 * 集中式配置：所有环境变量在此统一读取、解析、校验。
 * 业务代码禁止直接读 process.env（避免散落各处、类型不安全、缺默认值）。
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env") });

function str(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const v = (process.env[name] ?? "").toLowerCase();
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return fallback;
}

export type AuthMode = "strict" | "demo";

export const config = {
  env: str("NODE_ENV", "development"),
  isProd: str("NODE_ENV", "development") === "production",
  server: {
    port: num("PORT", 3000),
    host: str("HOST", "0.0.0.0"),
    logLevel: str("LOG_LEVEL", "info"),
  },
  db: {
    url: str("DATABASE_URL", "file:./dev.db"),
  },
  security: {
    /** strict = Agent 写操作强制 HMAC 签名；demo = 无签名放行（仅本地演示） */
    authMode: str("AUTH_MODE", "strict").toLowerCase() as AuthMode,
    adminToken: str("ADMIN_TOKEN", ""),
    sessionSecret: str("SESSION_SECRET", ""),
    corsOrigin: str("CORS_ORIGIN", "*"),
    trustProxy: num("TRUST_PROXY", 0),
    /** HMAC 时间戳容差窗口 */
    signatureWindowMs: num("SIGNATURE_WINDOW_MS", 5 * 60 * 1000),
  },
  rateLimit: {
    max: num("RATE_LIMIT_MAX", 300),
    windowMs: num("RATE_LIMIT_WINDOW_MS", 60_000),
  },
  autopilot: {
    enabled: bool("AUTOPILOT_ENABLED", true),
    intervalMs: num("AUTOPILOT_INTERVAL_MS", 20 * 60 * 1000),
    /** 每个 Agent 保留的日志条数上限 */
    logKeep: num("AUTOPILOT_LOG_KEEP", 300),
    firstRunDelayMs: num("AUTOPILOT_FIRST_RUN_DELAY_MS", 20_000),
  },
  cors: {
    origin: str("CORS_ORIGIN", "*"),
  },
} as const;

/**
 * 启动安全自检：宁可拒绝启动，也不带着危险配置上线。
 * 这是「secure by default」的落地——v1 就是因为缺少这层校验，
 * 才让 /api/admin/verify 与 /api/llm/config 在零鉴权状态下暴露到公网。
 */
export function assertSafeStartup(): void {
  const problems: string[] = [];

  if (config.isProd) {
    if (config.security.authMode !== "strict") {
      problems.push("生产环境 AUTH_MODE 必须为 strict（当前：" + config.security.authMode + "）");
    }
    if (!config.security.adminToken || config.security.adminToken.startsWith("dev-admin-token")) {
      problems.push("生产环境 ADMIN_TOKEN 必须设置为高强度随机值（禁止使用默认开发值）");
    }
    if (!config.security.sessionSecret || config.security.sessionSecret.startsWith("dev-session-secret")) {
      problems.push("生产环境 SESSION_SECRET 必须设置为高强度随机值（禁止使用默认开发值）");
    }
    if (config.cors.origin === "*") {
      problems.push("生产环境 CORS_ORIGIN 不得为 *，需显式指定允许的前端来源");
    }
  }

  if (!config.security.adminToken) {
    problems.push("ADMIN_TOKEN 未配置，管理端点将全部拒绝访问（开发环境请复制 .env.example 为 .env）");
  }

  if (problems.length > 0) {
    const msg = "启动安全自检未通过：\n  - " + problems.join("\n  - ");
    if (config.isProd) throw new Error(msg);
    console.warn("[config] " + msg);
  }
}
