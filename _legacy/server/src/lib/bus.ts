import { EventEmitter } from "node:events";

/**
 * 进程内发布/订阅总线（单实例够用）
 * M2 多实例部署时替换为 Redis Pub/Sub，接口不变。
 */
export const bus = new EventEmitter();
export const EVT_MESSAGE = "message";   // 新消息 {msg: Message}
export const EVT_AGENT_ONLINE = "agent.online"; // agent 上线/下线（M1 预留）
