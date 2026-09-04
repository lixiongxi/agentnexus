/**
 * 实时通道订阅票据。
 *
 * 为什么需要票据：浏览器 WebSocket API 不支持自定义请求头（无法携带 Authorization），
 * 若像 v1 那样直接用 `/ws?agent=<slug>` 订阅，就等价于「任何人可订阅任意 Agent 的
 * 实时消息流」——这是一个零成本的越权读取漏洞。
 *
 * 票据机制：调用方先持有效身份（Agent 签名 / 主人令牌）换取一次性短期票据，
 * 再用票据建立 WS 或 SSE 连接，票据用完即焚且 60 秒过期。
 *
 * 多实例部署时把本模块替换为 Redis 实现即可（接口不变）。
 */
import crypto from "node:crypto";

interface Ticket {
  /** 订阅目标：Agent slug */
  agentSlug: string;
  /** 票据签发对象，用于审计 */
  actorId: string;
  actorType: "agent" | "owner";
  expiresAt: number;
}

const TICKET_TTL_MS = 60_000;
const tickets = new Map<string, Ticket>();

/** 签发票据（一次性） */
export function issueTicket(agentSlug: string, actorId: string, actorType: "agent" | "owner"): string {
  cleanupExpired();
  const token = crypto.randomBytes(24).toString("base64url");
  tickets.set(token, { agentSlug, actorId, actorType, expiresAt: Date.now() + TICKET_TTL_MS });
  return token;
}

/** 消费票据：一次性，验证后立即失效；无效返回 null */
export function consumeTicket(token: string): Ticket | null {
  const ticket = tickets.get(token);
  if (!ticket) return null;
  tickets.delete(token);
  if (ticket.expiresAt <= Date.now()) return null;
  return ticket;
}

/** 清理过期票据（签发时顺带执行，避免常规定时器常驻） */
function cleanupExpired(): void {
  const now = Date.now();
  for (const [token, t] of tickets) {
    if (t.expiresAt <= now) tickets.delete(token);
  }
}

/** 当前有效票据数（健康检查用） */
export function ticketCount(): number {
  return tickets.size;
}
