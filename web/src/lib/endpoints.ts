/**
 * 前端 API 模块：与后端路由一一对应的类型化封装。
 */
import { api, withQuery } from "./api";
import type {
  AgentOwnerView,
  AgentView,
  AuditLogView,
  AuthResult,
  AutopilotLogView,
  AutopilotRunResult,
  AutopilotSettingView,
  ChatMessageView,
  ChatSessionView,
  ConnectionView,
  LlmConfigView,
  LlmTestResult,
  McpProbeResult,
  MessageView,
  OwnerProfile,
  Paged,
  PlatformStats,
  SystemInfo,
} from "@/types/api";

/* ---------------- Agent ---------------- */

export interface RegisterAgentPayload {
  name: string;
  slug: string;
  emoji?: string;
  color?: string;
  role: string;
  description?: string;
  industry?: string;
  tags?: string[];
  autoAccept?: boolean;
  online?: boolean;
  owner: { name: string; org: string; title?: string; email?: string };
}

export const agentsApi = {
  register: (payload: RegisterAgentPayload) =>
    api.post<AgentView & { secret: string }>("/api/agents", payload),

  list: (params: {
    q?: string;
    tag?: string;
    industry?: string;
    online?: boolean;
    verified?: boolean;
    sort?: string;
    page?: number;
    pageSize?: number;
  }) => api.get<Paged<AgentView>>(withQuery("/api/agents", params)),

  detail: (slug: string) => api.get<AgentView>(`/api/agents/${slug}`),

  topTags: (limit?: number) => api.get<{ name: string; count: number }[]>(withQuery("/api/agents/tags", { limit })),

  industries: () => api.get<{ name: string; count: number }[]>("/api/agents/industries"),
};

/* ---------------- 对接与消息 ---------------- */

export const connectionsApi = {
  create: (fromAgent: string, toAgent: string) =>
    api.post<{ created: boolean; message: string }>("/api/connections", { fromAgent, toAgent }, { sign: true }),

  list: () => api.get<{ items: ConnectionView[] }>("/api/connections", { sign: true }),

  pending: () => api.get<{ items: { from: { slug: string; name: string }; since: string }[] }>("/api/connections/pending", { sign: true }),

  respond: (peer: string, accept: boolean) =>
    api.post<{ status: string }>("/api/connections/respond", { peer, accept }, { sign: true }),
};

export const messagesApi = {
  send: (fromAgent: string, toAgent: string, text: string, type: "chat" | "task" | "event" = "chat") =>
    api.post<{ message: MessageView; bot: MessageView | null }>(
      "/api/messages",
      { fromAgent, toAgent, text, type },
      { sign: true },
    ),

  history: (peer: string, limit = 50) =>
    api.get<{ messages: MessageView[]; unreadCleared: number }>(withQuery("/api/messages", { peer, limit }), { sign: true }),

  markRead: (peer: string) =>
    api.post<{ cleared: number }>("/api/messages/read", { peer }, { sign: true }),

  unread: () => api.get<{ unread: number }>("/api/messages/unread", { sign: true }),

  a2aSend: (slug: string, text: string, type: "chat" | "task" | "event" = "chat") =>
    api.post<{ message: MessageView; bot: MessageView | null }>(`/api/a2a/${slug}/message`, { text, type }, { sign: true }),
};

/* ---------------- 实时通道 ---------------- */

export const realtimeApi = {
  ticket: (agentSlug?: string) =>
    api.post<{ ticket: string; agentSlug: string; expiresInMs: number }>("/api/realtime/ticket", agentSlug ? { agentSlug } : {}, { sign: true }),
};

/* ---------------- 虚拟伙伴 ---------------- */

export const chatApi = {
  createSession: (title?: string) =>
    api.post<ChatSessionView>("/api/chat/sessions", title ? { title } : {}),

  listSessions: () => api.get<{ items: ChatSessionView[] }>("/api/chat/sessions"),

  getSession: (id: string) =>
    api.get<{ session: ChatSessionView; messages: ChatMessageView[] }>(`/api/chat/sessions/${id}`),

  send: (id: string, text: string) =>
    api.post<{ reply: ChatMessageView; engine: "llm" | "local" }>(`/api/chat/sessions/${id}/messages`, { text }),

  remove: (id: string) => api.del<{ deleted: boolean }>(`/api/chat/sessions/${id}`),
};

/* ---------------- 自主巡航 ---------------- */

export const autopilotApi = {
  settings: () => api.get<AutopilotSettingView>("/api/autopilot/settings", { sign: true }),

  update: (input: Partial<Pick<AutopilotSettingView, "enabled" | "minScore" | "autoGreet" | "industries" | "tags">>) =>
    api.patch<AutopilotSettingView>("/api/autopilot/settings", input, { sign: true }),

  run: () => api.post<AutopilotRunResult>("/api/autopilot/run", {}, { sign: true }),

  logs: (limit = 30) => api.get<{ items: AutopilotLogView[] }>(withQuery("/api/autopilot/logs", { limit }), { sign: true }),
};

/* ---------------- 认证 ---------------- */

export const authApi = {
  register: (payload: { name: string; org: string; title?: string; email: string; password: string }) =>
    api.post<AuthResult>("/api/auth/register", payload),

  login: (email: string, password: string) =>
    api.post<AuthResult>("/api/auth/login", { email, password }),

  logout: () => api.post<{ ok: boolean }>("/api/auth/logout"),

  me: () => api.get<OwnerProfile>("/api/auth/me"),

  myAgents: () => api.get<{ items: AgentOwnerView[] }>("/api/me/agents"),
};

/* ---------------- 系统 ---------------- */

export const systemApi = {
  info: () => api.get<SystemInfo>("/api/system/info"),
  health: () => api.get<{ ok: boolean; service: string }>("/health", { timeoutMs: 4000 }),
};

/* ---------------- MCP 探测 ---------------- */

export const mcpApi = {
  probe: (url: string, headers?: Record<string, string>) =>
    api.post<McpProbeResult>("/api/mcp/probe", { url, headers }, { sign: true }),
};

/* ---------------- 管理端（X-Admin-Token 自动注入） ---------------- */

export const adminApi = {
  llmConfig: () => api.get<LlmConfigView>("/api/admin/llm/config"),

  updateLlmConfig: (input: { baseUrl?: string; model?: string; apiKey?: string }) =>
    api.post<LlmConfigView>("/api/admin/llm/config", input),

  testLlm: () => api.post<LlmTestResult>("/api/admin/llm/test", {}),

  stats: () => api.get<PlatformStats>("/api/admin/stats"),

  audit: (params: { action?: string; page?: number; limit?: number } = {}) =>
    api.get<Paged<AuditLogView>>(withQuery("/api/admin/audit", params)),
};
