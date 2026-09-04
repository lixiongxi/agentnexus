/** 前端领域类型（与后端视图字段一一对应） */

export interface OwnerBrief {
  name: string;
  org: string;
  title: string | null;
}

export interface AgentView {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  color: string;
  role: string;
  description: string;
  industry: string;
  tags: string[];
  online: boolean;
  autoAccept: boolean;
  verified: boolean;
  status: string;
  createdAt: string;
  owner: OwnerBrief | null;
}

export interface AgentOwnerView extends AgentView {
  mcpEndpoint: string | null;
  a2aEndpoint: string | null;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

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

export interface MessageView {
  id: string;
  conversationId: string;
  fromAgent: string;
  toAgent: string;
  text: string;
  type: string;
  readAt: string | null;
  createdAt: string;
}

export interface ConnectionView {
  id: string;
  peer: PeerBrief;
  since: string;
  last: Pick<MessageView, "id" | "fromAgent" | "toAgent" | "text" | "type" | "createdAt"> | null;
  unread: number;
}

export interface ChatMessageView {
  id: string;
  role: string;
  text: string;
  createdAt: string;
}

export interface ChatSessionView {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface AutopilotSettingView {
  enabled: boolean;
  minScore: number;
  autoGreet: boolean;
  industries: string[];
  tags: string[];
  updatedAt: string;
}

export interface AutopilotRunResult {
  scanned: number;
  created: number;
  greeted: number;
  details: { toAgent: string; score: number; reason: string; result: string }[];
}

export interface AutopilotLogView {
  id: string;
  toAgent: string;
  score: number;
  reason: string;
  result: string;
  detail: string;
  createdAt: string;
}

export interface OwnerProfile {
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
  owner: OwnerProfile;
}

export interface SystemInfo {
  service: string;
  version: string;
  authMode: string;
  features: {
    llmEnabled: boolean;
    llmModel: string;
    autopilotEnabled: boolean;
    rateLimitEnabled: boolean;
  };
}

export interface LlmConfigView {
  baseUrl: string;
  model: string;
  hasKey: boolean;
}

export interface LlmTestResult {
  ok: boolean;
  message: string;
  model: string;
}

export interface PlatformStats {
  agents: number;
  verified: number;
  connections: number;
  messages: number;
  owners: number;
  pendingConnections: number;
}

export interface AuditLogView {
  id: string;
  actorType: string;
  actorId: string;
  action: string;
  target: string;
  detail: string;
  createdAt: string;
}

export interface McpProbeResult {
  ok: boolean;
  tools: { name: string; description: string }[];
  resources: string[];
  error?: string;
}
