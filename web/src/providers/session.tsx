import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { credentials } from "@/lib/api";
import { authApi, realtimeApi } from "@/lib/endpoints";
import type { GroupMessageView, MessageView, OwnerProfile } from "@/types/api";

/**
 * 会话上下文：聚合「主人登录态」与「当前绑定的 Agent 凭据」。
 *
 * 两种使用模式并存：
 *  - Agent 模式（核心）：本地保存 slug + secret，写操作自动 HMAC 签名
 *  - 主人模式：会话令牌访问虚拟伙伴、名下 Agent 等主人侧功能
 */

interface SessionState {
  /** 当前绑定的 Agent（slug） */
  agentSlug: string | null;
  /** 主人资料（已登录时） */
  owner: OwnerProfile | null;
  /** 实时通道就绪状态 */
  wsStatus: "offline" | "ticketing" | "connecting" | "online";
}

interface SessionContextValue extends SessionState {
  hasAgentCredential: boolean;
  bindAgent: (slug: string, secret: string) => void;
  unbindAgent: () => void;
  setOwner: (owner: OwnerProfile | null) => void;
  /** 实时消息订阅（基于一次性票据的 WS 连接） */
  subscribeMessages: (onMessage: (msg: MessageView) => void) => () => void;
  /** 群消息实时订阅（同一条 WS 连接，按 group-message 事件分发） */
  subscribeGroupMessages: (onMessage: (msg: GroupMessageView) => void) => () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [agentSlug, setAgentSlug] = useState<string | null>(() => credentials.agent.get()?.slug ?? null);
  const [owner, setOwner] = useState<OwnerProfile | null>(null);
  const [wsStatus, setWsStatus] = useState<SessionState["wsStatus"]>("offline");
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef(new Set<(msg: MessageView) => void>());

  // 页面加载时若持有主人令牌，静默恢复登录态
  useEffect(() => {
    if (!credentials.ownerToken.get()) return;
    authApi
      .me()
      .then((profile) => setOwner(profile))
      .catch(() => {
        // 令牌失效：清除本地残留
        credentials.ownerToken.clear();
      });
  }, []);

  const bindAgent = useCallback((slug: string, secret: string) => {
    credentials.agent.set({ slug, secret });
    setAgentSlug(slug);
  }, []);

  const unbindAgent = useCallback(() => {
    credentials.agent.clear();
    setAgentSlug(null);
    wsRef.current?.close();
    wsRef.current = null;
    setWsStatus("offline");
  }, []);

  /**
   * 建立带鉴权的 WS 连接：
   * 1. 持 Agent 密钥换取一次性票据（服务端校验 HMAC）
   * 2. 用票据连接 /ws（60 秒内有效）
   * 3. 断线自动重试（指数退避，上限 60 秒）
   */
  const connectWs = useCallback(async (): Promise<void> => {
    const cred = credentials.agent.get();
    if (!cred || wsRef.current) return;

    setWsStatus("ticketing");
    try {
      const { ticket } = await realtimeApi.ticket();
      setWsStatus("connecting");

      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${location.host}/ws?ticket=${encodeURIComponent(ticket)}`);

      ws.onopen = () => setWsStatus("online");
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data as string) as { type: string; payload?: unknown };
          if (data.type === "message" && data.payload) {
            for (const listener of listenersRef.current) listener(data.payload as MessageView);
          }
          if (data.type === "group-message" && data.payload) {
            for (const listener of groupListenersRef.current) listener(data.payload as GroupMessageView);
          }
        } catch {
          /* 非 JSON 帧忽略 */
        }
      };
      ws.onclose = () => {
        wsRef.current = null;
        setWsStatus("offline");
        // 断线重连：票据机制下需要重新走完整流程
        setTimeout(() => void connectWs(), 3000);
      };
      ws.onerror = () => ws.close();
      wsRef.current = ws;
    } catch {
      setWsStatus("offline");
      setTimeout(() => void connectWs(), 5000);
    }
  }, []);

  const subscribeMessages = useCallback(
    (onMessage: (msg: MessageView) => void) => {
      listenersRef.current.add(onMessage);
      if (!wsRef.current && credentials.agent.get()) {
        void connectWs();
      }
      return () => {
        listenersRef.current.delete(onMessage);
      };
    },
    [connectWs],
  );

  const groupListenersRef = useRef(new Set<(msg: GroupMessageView) => void>());

  const subscribeGroupMessages = useCallback(
    (onMessage: (msg: GroupMessageView) => void) => {
      groupListenersRef.current.add(onMessage);
      if (!wsRef.current && credentials.agent.get()) {
        void connectWs();
      }
      return () => {
        groupListenersRef.current.delete(onMessage);
      };
    },
    [connectWs],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      agentSlug,
      owner,
      wsStatus,
      hasAgentCredential: agentSlug !== null,
      bindAgent,
      unbindAgent,
      setOwner,
      subscribeMessages,
      subscribeGroupMessages,
    }),
    [agentSlug, owner, wsStatus, bindAgent, unbindAgent, subscribeMessages, subscribeGroupMessages],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession 必须在 SessionProvider 内使用");
  return ctx;
}
