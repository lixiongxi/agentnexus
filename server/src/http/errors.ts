/**
 * 统一错误/响应处理。
 *
 * 业务代码只需 throw AppError，此处统一转换为响应体；
 * 未预期异常一律降级为 500 且**不回显内部堆栈**（v1 会把异常原文直接返回给客户端）。
 */
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fs from "node:fs";
import path from "node:path";
import { config } from "../core/config";
import { ErrorCode, isAppError } from "../core/errors";
import { fail, ok } from "../core/response";

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, req: FastifyRequest, reply: FastifyReply) => {
    // 1) 业务异常：按错误码映射状态码
    if (isAppError(error)) {
      return reply.code(error.status).send(fail(error.code, error.message, error.details));
    }

    // 2) 请求体解析失败
    if (error.statusCode === 400 && /body|json|parse/i.test(error.message)) {
      return reply.code(400).send(fail(ErrorCode.BAD_REQUEST, "请求体不是合法的 JSON"));
    }

    // 3) 限流
    if (error.statusCode === 429) {
      return reply.code(429).send(fail(ErrorCode.RATE_LIMITED, "请求过于频繁，请稍后再试"));
    }

    // 4) 校验失败（Fastify 自身的 schema 校验，业务参数校验走 zod）
    if (error.statusCode === 400 && error.validation) {
      return reply.code(400).send(fail(ErrorCode.VALIDATION_ERROR, "请求参数校验失败", error.validation));
    }

    // 5) 未预期异常：记录完整堆栈，只回显摘要
    const errId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    req.log.error({ err: error, errId }, "未处理异常");
    return reply.code(500).send(
      fail(
        ErrorCode.INTERNAL,
        config.isProd ? "服务内部错误" : `服务内部错误（${error.message}）`,
        config.isProd ? { errId } : { errId, stack: error.stack },
      ),
    );
  });

  app.setNotFoundHandler((req: FastifyRequest, reply: FastifyReply) => {
    // SPA 回退：同源托管前端时，非 API 路径的 GET 一律回 index.html（React Router 前端路由）
    const staticRoot = (app as unknown as { staticRoot?: string }).staticRoot;
    const url = req.raw.url ?? "";
    const isReserved =
      url.startsWith("/api") ||
      url.startsWith("/health") ||
      url.startsWith("/ws") ||
      url.startsWith("/.well-known");
    if (staticRoot && req.method === "GET" && !isReserved) {
      const indexHtml = path.join(staticRoot, "index.html");
      if (fs.existsSync(indexHtml)) {
        return (reply as FastifyReply & { sendFile: (name: string) => unknown }).sendFile("index.html");
      }
    }
    return reply.code(404).send(fail(ErrorCode.NOT_FOUND, `接口不存在：${req.method} ${req.url}`));
  });
}

/**
 * 统一成功包装：把路由返回值包成 { ok: true, data }。
 * 路由直接 return 业务数据即可，无需手动 ok(...)。
 */
export function registerSuccessSerializer(app: FastifyInstance): void {
  app.addHook("onSend", async (_req, reply, payload) => {
    const contentType = reply.getHeader("content-type");
    if (typeof contentType !== "string" || !contentType.includes("application/json")) {
      return payload;
    }
    if (typeof payload !== "string") return payload;

    try {
      const parsed: unknown = JSON.parse(payload);
      // 已经是统一格式则不重复包装（如错误处理器产出的 { ok: false }）
      if (parsed && typeof parsed === "object" && "ok" in parsed) return payload;
      return JSON.stringify(ok(parsed));
    } catch {
      return payload;
    }
  });
}
