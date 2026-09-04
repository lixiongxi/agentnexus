/**
 * 审计日志：所有敏感写操作留痕，支持事后追溯。
 * v1 完全没有审计能力——谁在什么时候改了认证状态、改了 LLM 配置，无从查证。
 *
 * 审计失败绝不能阻断主流程，因此全部异常在此吞掉并告警。
 */
import { prisma } from "../db/client";

export type ActorType = "owner" | "agent" | "admin" | "system" | "anonymous";

export interface AuditInput {
  actorType: ActorType;
  actorId?: string;
  action: string;
  target?: string;
  detail?: string;
  ip?: string;
}

export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorType: input.actorType,
        actorId: input.actorId ?? "",
        action: input.action,
        target: input.target ?? "",
        detail: input.detail ?? "",
        ip: input.ip ?? "",
      },
    });
  } catch (err: unknown) {
    console.warn("[audit] 写入失败:", err instanceof Error ? err.message : err);
  }
}

/** 从请求中取客户端 IP（尊重 TRUST_PROXY 配置下的 X-Forwarded-For） */
export function clientIp(headers: Record<string, unknown>): string {
  const xff = headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0]?.trim() ?? "";
  }
  return typeof headers["x-real-ip"] === "string" ? headers["x-real-ip"] : "";
}
