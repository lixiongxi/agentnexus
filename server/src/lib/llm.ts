/**
 * LLM 配置与调用（OpenAI 兼容协议）。
 *
 * 相对 v1 的关键修正：配置**入库**而非运行时写回 .env。
 * v1 的 /api/llm/config 会以服务端进程权限覆写 .env 文件，且接口零鉴权——
 * 任何人都能把 baseUrl 指向自己的服务器，从而截获全平台对话内容与 API Key。
 * 本版改为写入 LlmConfig 表，并对 baseUrl 做协议与内网地址校验（防 SSRF）。
 */
import { prisma } from "../db/client";
import { AppError, ErrorCode } from "../core/errors";

export interface LlmConfigView {
  baseUrl: string;
  model: string;
  hasKey: boolean;
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

/** 从环境变量初始化一次（随后以库为准） */
async function ensureRow(): Promise<{ apiKey: string; baseUrl: string; model: string }> {
  const row = await prisma.llmConfig.findUnique({ where: { id: 1 } });
  if (row) return { apiKey: row.apiKey, baseUrl: row.baseUrl, model: row.model };

  const seeded = {
    apiKey: process.env.LLM_API_KEY ?? "",
    baseUrl: process.env.LLM_BASE_URL ?? DEFAULT_BASE_URL,
    model: process.env.LLM_MODEL ?? DEFAULT_MODEL,
  };
  await prisma.llmConfig.upsert({ where: { id: 1 }, create: { id: 1, ...seeded }, update: seeded });
  return seeded;
}

/**
 * 校验 LLM 端点安全性：
 *  - 仅允许 http/https，杜绝 file://、gopher:// 等协议造成的 SSRF
 *  - 生产环境拒绝内网地址，避免把请求打到本机/内网服务
 */
export function assertSafeEndpoint(rawUrl: string): URL {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new AppError(ErrorCode.VALIDATION_ERROR, "baseUrl 不是合法 URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new AppError(ErrorCode.VALIDATION_ERROR, "baseUrl 仅支持 http/https 协议");
  }
  if (process.env.NODE_ENV === "production") {
    const host = u.hostname.toLowerCase();
    const blocked =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.endsWith(".internal") ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    if (blocked) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "生产环境不允许将 LLM 端点指向内网地址");
    }
  }
  return u;
}

export async function getLlmConfig(): Promise<LlmConfigView> {
  const cfg = await ensureRow();
  return { baseUrl: cfg.baseUrl, model: cfg.model, hasKey: cfg.apiKey.length > 0 };
}

export async function setLlmConfig(input: {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}): Promise<LlmConfigView> {
  const current = await ensureRow();

  const baseUrl = input.baseUrl ?? current.baseUrl;
  assertSafeEndpoint(baseUrl);

  const next = {
    apiKey: input.apiKey ?? current.apiKey,
    baseUrl,
    model: input.model ?? current.model,
  };

  await prisma.llmConfig.upsert({ where: { id: 1 }, create: { id: 1, ...next }, update: next });
  return { baseUrl: next.baseUrl, model: next.model, hasKey: next.apiKey.length > 0 };
}

export interface ChatTurn {
  role: "user" | "assistant" | "system";
  content: string;
}

/** 调用大模型；失败返回 null，由调用方回退本地引擎（不因 LLM 故障而中断对话） */
export async function llmChat(turns: ChatTurn[], timeoutMs = 15_000): Promise<string | null> {
  const cfg = await ensureRow();
  if (!cfg.apiKey) return null;

  try {
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, messages: turns, max_tokens: 500, temperature: 0.7 }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      console.warn(`[llm] 上游返回 ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch (err: unknown) {
    console.warn("[llm] 调用失败:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function testLlmConnection(): Promise<{ ok: boolean; message: string; model: string }> {
  const cfg = await ensureRow();
  if (!cfg.apiKey) return { ok: false, message: "尚未配置 API Key", model: cfg.model };

  const reply = await llmChat([{ role: "user", content: "回复两个字：正常" }], 12_000);
  return reply
    ? { ok: true, message: `连接成功，模型回复：${reply.slice(0, 60)}`, model: cfg.model }
    : { ok: false, message: "连接失败，请检查 API Key、baseUrl 与模型名", model: cfg.model };
}
