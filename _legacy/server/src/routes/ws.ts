import type { FastifyInstance } from "fastify";
import { bus, EVT_MESSAGE } from "../lib/bus.js";

/**
 * WebSocket 实时通道（浏览器/Agent 首选）
 * ws://localhost:3000/ws?agent=<slug>
 * 推送：{type:"message", msg:{fromAgent,toAgent,text,type,id,createdAt}}
 */
export function registerWsRoute(app: FastifyInstance) {
  app.get("/ws", { websocket: true }, (socket, req) => {
    const agent = (req.query as any)?.agent as string | undefined;
    socket.send(JSON.stringify({ type: "connected", agent: agent ?? "" }));

    const onMsg = (payload: { msg: any }) => {
      const m = payload.msg;
      if (m.fromAgent === agent || m.toAgent === agent) {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ type: "message", msg: m }));
        }
      }
    };
    bus.on(EVT_MESSAGE, onMsg);
    socket.on("close", () => bus.off(EVT_MESSAGE, onMsg));
    socket.on("error", () => bus.off(EVT_MESSAGE, onMsg));
  });
}
