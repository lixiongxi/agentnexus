import { useCallback, useEffect, useRef, useState } from "react";
import { connectionsApi, messagesApi } from "@/lib/endpoints";
import { fmtTime } from "@/lib/format";
import { useSession } from "@/providers/session";
import { useToast } from "@/providers/toast";
import type { ConnectionView, MessageView } from "@/types/api";

/** 会话：对接列表 + 实时聊天（WS 收 / POST 发） */

export function ChatsPage() {
  const toast = useToast();
  const { agentSlug, hasAgentCredential, subscribeMessages } = useSession();

  const [connections, setConnections] = useState<ConnectionView[]>([]);
  const [activePeer, setActivePeer] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConnections = useCallback(async () => {
    if (!hasAgentCredential) return;
    try {
      const { items } = await connectionsApi.list();
      setConnections(items);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "加载对接列表失败", "error");
    }
  }, [hasAgentCredential, toast]);

  const loadHistory = useCallback(
    async (peer: string) => {
      setLoading(true);
      try {
        const { messages: msgs } = await messagesApi.history(peer, 100);
        setMessages(msgs);
      } catch (err: unknown) {
        toast(err instanceof Error ? err.message : "加载历史失败", "error");
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  useEffect(() => {
    if (activePeer) void loadHistory(activePeer);
  }, [activePeer, loadHistory]);

  // 实时订阅：新消息进来时，活跃会话直接追加，其它会话刷新角标
  useEffect(() => {
    if (!hasAgentCredential) return;
    return subscribeMessages((msg) => {
      if (!activePeer) {
        void loadConnections();
        return;
      }
      if (msg.fromAgent === activePeer || msg.toAgent === activePeer) {
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        if (msg.toAgent === agentSlug) void messagesApi.markRead(activePeer).catch(() => undefined);
      } else {
        void loadConnections();
      }
    });
  }, [subscribeMessages, activePeer, agentSlug, hasAgentCredential, loadConnections]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !activePeer || !agentSlug || sending) return;
    setSending(true);
    setDraft("");
    try {
      const { message } = await messagesApi.send(agentSlug, activePeer, text);
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "发送失败", "error");
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  if (!hasAgentCredential) {
    return (
      <div className="empty card">
        <div className="empty-icon">💬</div>
        <h3>需要先绑定 Agent</h3>
        <p style={{ marginTop: "var(--sp-2)" }}>绑定后即可与对接的 Agent 实时通信</p>
      </div>
    );
  }

  const active = connections.find((c) => c.peer.slug === activePeer);

  return (
    <div className="card" style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 0, padding: 0, overflow: "hidden", height: "calc(100vh - var(--topbar-h) - var(--sp-12))" }}>
      {/* 会话列表 */}
      <nav
        aria-label="会话列表"
        style={{ borderRight: "1px solid var(--line)", overflowY: "auto", padding: "var(--sp-3)" }}
      >
        {connections.length === 0 && (
          <p style={{ color: "var(--ink-3)", fontSize: "var(--fs-sm)", padding: "var(--sp-4)", textAlign: "center" }}>
            暂无对接，去广场找伙伴吧
          </p>
        )}
        {connections.map((c) => (
          <button
            key={c.id}
            className="nav-item"
            style={activePeer === c.peer.slug ? { background: "var(--brand-soft)", color: "var(--brand)" } : undefined}
            onClick={() => setActivePeer(c.peer.slug)}
          >
            <span style={{ fontSize: 20 }}>{c.peer.emoji}</span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: "block", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.peer.name}
              </span>
              <span style={{ display: "block", fontSize: "var(--fs-xs)", color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.last ? c.last.text : c.peer.role}
              </span>
            </span>
            {c.unread > 0 && <span className="nav-badge">{c.unread}</span>}
          </button>
        ))}
      </nav>

      {/* 消息区 */}
      <section style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        {active ? (
          <>
            <header className="row-between" style={{ padding: "var(--sp-4) var(--sp-5)", borderBottom: "1px solid var(--line)" }}>
              <div className="row" style={{ gap: "var(--sp-3)" }}>
                <span style={{ fontSize: 22 }}>{active.peer.emoji}</span>
                <div>
                  <strong>{active.peer.name}</strong>
                  <div style={{ fontSize: "var(--fs-xs)", color: active.peer.online ? "var(--green)" : "var(--ink-4)" }}>
                    {active.peer.online ? "在线" : "离线"} · {active.peer.industry}
                  </div>
                </div>
              </div>
            </header>

            <div style={{ flex: 1, overflowY: "auto", padding: "var(--sp-5)", display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
              {loading ? (
                <div className="skeleton" style={{ height: 60 }} />
              ) : messages.length === 0 ? (
                <p style={{ color: "var(--ink-3)", textAlign: "center", marginTop: "var(--sp-8)" }}>
                  还没有消息，打个招呼吧 👋
                </p>
              ) : (
                messages.map((m) => {
                  const mine = m.fromAgent === agentSlug;
                  return (
                    <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                      <div
                        style={{
                          maxWidth: "72%",
                          padding: "var(--sp-2) var(--sp-4)",
                          borderRadius: "var(--r-lg)",
                          background: mine ? "var(--grad-brand)" : "var(--surface-3)",
                          color: mine ? "#fff" : "var(--ink)",
                          fontSize: "var(--fs-md)",
                          lineHeight: "var(--lh-base)",
                          wordBreak: "break-word",
                        }}
                      >
                        {m.type === "autopilot" && (
                          <div style={{ fontSize: "var(--fs-xs)", opacity: 0.75, marginBottom: 2 }}>⚡ 自动巡航</div>
                        )}
                        {m.type === "a2a-in" && (
                          <div style={{ fontSize: "var(--fs-xs)", opacity: 0.75, marginBottom: 2 }}>🔗 A2A 接入</div>
                        )}
                        {m.text}
                        <div style={{ fontSize: "var(--fs-xs)", opacity: 0.6, marginTop: 2, textAlign: "right" }}>
                          {fmtTime(m.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            <footer className="row" style={{ padding: "var(--sp-3) var(--sp-4)", borderTop: "1px solid var(--line)", gap: "var(--sp-3)" }}>
              <textarea
                className="textarea"
                style={{ minHeight: 44, maxHeight: 120 }}
                placeholder={`发消息给 ${active.peer.name}…（Enter 发送 / Shift+Enter 换行）`}
                aria-label="消息输入框"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <button className="btn btn-primary" disabled={!draft.trim() || sending} onClick={send}>
                {sending ? "发送中…" : "发送"}
              </button>
            </footer>
          </>
        ) : (
          <div className="empty" style={{ display: "grid", placeItems: "center", flex: 1 }}>
            <div>
              <div className="empty-icon">💬</div>
              <p>选择左侧会话开始聊天</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
