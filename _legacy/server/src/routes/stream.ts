import type { FastifyInstance } from "fastify";
import { bus, EVT_MESSAGE } from "../lib/bus.js";

/**
 * SSE 实时通道（兼容 A2A 事件流规范）
 * GET /api/stream?agent=<slug>
 * 事件：
 *   connected   {agent}
 *   message     {msg}   涉及该 agent 的新消息（发出或接收）
 * 心跳：每 25s 发送注释行保持连接
 */
export function registerStreamRoute(app: FastifyInstance) {
  app.get("/api/stream", async (req, reply) => {
    const { agent } = req.query as { agent?: string };
    if (!agent) return reply.code(400).send({ ok: false, error: "agent 参数必填" });

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ agent, ts: Date.now() })}\n\n`);

    const onMsg = (payload: { msg: any }) => {
      const m = payload.msg;
      if (m.fromAgent === agent || m.toAgent === agent) {
        reply.raw.write(`event: message\ndata: ${JSON.stringify(m)}\n\n`);
      }
    };
    bus.on(EVT_MESSAGE, onMsg);

    const heartbeat = setInterval(() => { reply.raw.write(": hb\n\n"); }, 25000);
    req.raw.on("close", () => {
      clearInterval(heartbeat);
      bus.off(EVT_MESSAGE, onMsg);
    });
  });
}
