/**
 * API 客户端。
 *
 * 统一处理：响应解包（{ ok, data }）、错误转换、Agent 请求签名、主人/管理员令牌注入。
 * 业务组件不再直接接触 fetch。
 */

/* ---------------- 类型 ---------------- */

export interface ApiFailureBody {
  ok: false;
  error: { code: string; message: string; details?: unknown };
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/* ---------------- 凭据存储 ---------------- */

export interface AgentCredential {
  slug: string;
  secret: string;
}

const LS = {
  agent: "agenthub.credential",
  ownerToken: "agenthub.ownerToken",
  adminToken: "agenthub.adminToken",
  theme: "agenthub.theme",
} as const;

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export const credentials = {
  agent: {
    get(): AgentCredential | null {
      return readJson<AgentCredential>(LS.agent);
    },
    set(c: AgentCredential): void {
      localStorage.setItem(LS.agent, JSON.stringify(c));
    },
    clear(): void {
      localStorage.removeItem(LS.agent);
    },
  },
  ownerToken: {
    get(): string | null {
      return localStorage.getItem(LS.ownerToken);
    },
    set(t: string): void {
      localStorage.setItem(LS.ownerToken, t);
    },
    clear(): void {
      localStorage.removeItem(LS.ownerToken);
    },
  },
  adminToken: {
    get(): string | null {
      return localStorage.getItem(LS.adminToken);
    },
    set(t: string): void {
      localStorage.setItem(LS.adminToken, t);
    },
    clear(): void {
      localStorage.removeItem(LS.adminToken);
    },
  },
};

/* ---------------- 请求核心 ---------------- */

const BASE_URL = "";
const DEFAULT_TIMEOUT_MS = 15_000;

interface RequestOptions {
  /** 是否使用 Agent 密钥进行 HMAC 签名（写接口必须开启） */
  sign?: boolean;
  /** 自定义超时 */
  timeoutMs?: number;
  /** 额外的请求头 */
  headers?: Record<string, string>;
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers ?? {}),
  };

  // 主人令牌（读接口用于身份识别）
  const ownerToken = credentials.ownerToken.get();
  if (ownerToken) headers["Authorization"] = `Bearer ${ownerToken}`;

  // 管理员令牌
  const adminToken = credentials.adminToken.get();
  if (adminToken) headers["X-Admin-Token"] = adminToken;

  let payload: string | undefined;
  if (body !== undefined) {
    payload = JSON.stringify(body);
  }

  // Agent 签名：签名对象必须与最终发送的 body 字符串完全一致
  if (options.sign) {
    const cred = credentials.agent.get();
    if (!cred) {
      throw new ApiError("NO_CREDENTIAL", "缺少 Agent 凭据，请先注册或绑定 Agent", 401);
    }
    const { signRequest } = await import("./signature");
    const timestamp = Date.now();
    const rawBody = payload ?? "";
    const signature = await signRequest(cred.secret, timestamp, rawBody);
    headers["X-Agent"] = cred.slug;
    headers["X-Timestamp"] = String(timestamp);
    headers["X-Signature"] = signature;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: payload,
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    const isAbort = err instanceof Error && err.name === "AbortError";
    throw new ApiError("NETWORK", isAbort ? "请求超时，请稍后重试" : "网络异常，请检查后端服务是否启动", 0);
  }
  clearTimeout(timer);

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new ApiError("BAD_RESPONSE", "服务端返回了非 JSON 内容", response.status);
  }

  const envelope = parsed as { ok?: boolean; data?: T } & ApiFailureBody;
  if (!response.ok || envelope.ok === false) {
    const errBody = envelope.error;
    throw new ApiError(
      errBody?.code ?? "UNKNOWN",
      errBody?.message ?? `请求失败（HTTP ${response.status}）`,
      response.status,
      errBody?.details,
    );
  }

  return envelope.data as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>("GET", path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("POST", path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("PATCH", path, body, options),
  del: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("DELETE", path, body, options),
};

/** 构造带查询串的路径（自动跳过空值） */
export function withQuery(path: string, params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    search.append(k, String(v));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}
