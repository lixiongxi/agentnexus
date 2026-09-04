/**
 * 事件总线：进程内发布/订阅，接口与 Redis Pub/Sub 对齐。
 *
 * v1 中 bus 只是一个裸 EventEmitter，各路由直接 emit 字符串常量，
 * 事件载荷没有任何类型约束，也没有背压与错误处理 —— 一个订阅者抛错会打断整条推送链。
 * 这里改为：
 *  - 事件载荷强类型化（BusEvent 联合类型）
 *  - 订阅者异常被隔离捕获，不影响其它订阅者
 *  - 预留 BroadcastAdapter 接口，多实例部署时替换为 Redis 实现即可，业务代码零改动
 */
import { EventEmitter } from "node:events";

export interface MessagePayload {
  id: string;
  conversationId: string;
  fromAgent: string;
  toAgent: string;
  text: string;
  type: string;
  createdAt: string;
}

export interface PresencePayload {
  agentSlug: string;
  online: boolean;
}

export type BusEvent =
  | { type: "message"; payload: MessagePayload }
  | { type: "presence"; payload: PresencePayload };

export type BusListener = (event: BusEvent) => void | Promise<void>;

/** 广播适配器抽象：单实例用内存实现，多实例换 Redis 实现 */
export interface BroadcastAdapter {
  publish(event: BusEvent): void;
  subscribe(listener: BusListener): () => void;
}

class MemoryAdapter implements BroadcastAdapter {
  private readonly emitter = new EventEmitter();

  constructor() {
    // 单实例下订阅者数量远小于 11，无需放宽默认上限
    this.emitter.setMaxListeners(0);
  }

  publish(event: BusEvent): void {
    // 逐个捕获，避免单个订阅者异常影响其余订阅者
    for (const listener of this.emitter.listeners("event") as BusListener[]) {
      try {
        const r = listener(event);
        if (r && typeof (r as Promise<void>).catch === "function") {
          (r as Promise<void>).catch((err: unknown) => {
            console.error("[bus] 订阅者异步异常:", err instanceof Error ? err.message : err);
          });
        }
      } catch (err: unknown) {
        console.error("[bus] 订阅者异常:", err instanceof Error ? err.message : err);
      }
    }
  }

  subscribe(listener: BusListener): () => void {
    this.emitter.on("event", listener);
    return () => {
      this.emitter.off("event", listener);
    };
  }
}

export const bus: BroadcastAdapter = new MemoryAdapter();

/** 便捷发布 */
export function publish(event: BusEvent): void {
  bus.publish(event);
}
