/**
 * MCP Server 探测适配器（TECH-PLAN 决策 D1 的第一层接入能力）。
 *
 * 平台作为 MCP Client 连接任意标准 MCP Server，拉取其工具与资源清单，
 * 用于「Agent 能力发现」与「接入前连通性自检」。
 *
 * 安全：探测会让服务端主动向外发起请求，属于典型 SSRF 面，
 * 因此强制校验协议白名单，并在生产环境拒绝内网地址。
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { AppError, ErrorCode } from "../../core/errors";
import type { McpProbeInput, McpProbeResult } from "./schema";

/** SSRF 防护：仅允许 http/https，生产环境拒绝内网目标 */
export function assertSafeProbeUrl(rawUrl: string): URL {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new AppError(ErrorCode.VALIDATION_ERROR, "url 不是合法地址");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new AppError(ErrorCode.VALIDATION_ERROR, "仅支持探测 http/https 协议的 MCP Server");
  }
  if (process.env.NODE_ENV === "production") {
    const host = u.hostname.toLowerCase();
    const blocked =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    if (blocked) throw new AppError(ErrorCode.VALIDATION_ERROR, "生产环境不允许探测内网地址");
  }
  return u;
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

export async function probeMcpServer(input: McpProbeInput, timeoutMs = 12_000): Promise<McpProbeResult> {
  const url = assertSafeProbeUrl(input.url);

  const client = new Client({ name: "agenthub-probe", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: input.headers ?? {} },
  });

  try {
    await withTimeout(client.connect(transport), timeoutMs, "连接 MCP Server 超时");
    const [toolsRes, resourcesRes] = await Promise.all([
      withTimeout(client.listTools(), timeoutMs, "拉取工具清单超时"),
      withTimeout(client.listResources(), timeoutMs, "拉取资源清单超时").catch(() => null),
    ]);

    return {
      ok: true,
      tools: (toolsRes?.tools ?? []).map((t) => ({ name: t.name, description: t.description ?? "" })),
      resources: (resourcesRes?.resources ?? []).map((r) => r.uri ?? r.name ?? ""),
    };
  } catch (err: unknown) {
    return {
      ok: false,
      tools: [],
      resources: [],
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    try {
      await client.close();
    } catch {
      /* 关闭失败无需处理：探测结果已确定 */
    }
  }
}
