import { useCallback, useEffect, useRef, useState } from "react";
import { chatApi } from "@/lib/endpoints";
import { fmtTime } from "@/lib/format";
import { useSession } from "@/providers/session";
import { useToast } from "@/providers/toast";
import type { ChatMessageView, ChatSessionView } from "@/types/api";

/** 虚拟伙伴：主人的专属 AI 助手（LLM 或本地引擎兜底） */

export function BuddyPage() {
  const toast = useToast();
  const { owner } = useSession();

  const [sessions, setSessions] = useState<ChatSessionView[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadSessions = useCallback(async () => {
    try {
      const { items } = await chatApi.listSessions();
      setSessions(items);
      if (items.length > 0 && !activeId) {
        setActiveId(items[0]!.id);
      }
    } catch {
      // 未登录时静默处理
      setSessions([]);
    }
  }, [activeId]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!activeId) return;
    chatApi
      .getSession(activeId)
      .then(({ messages: msgs }) => setMessages(msgs))
      .catch((err: unknown) => toast(err instanceof Error ? err.message : "加载对话失败", "error"));
  }, [activeId, toast]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const newSession = async () => {
    try {
      const session = await chatApi.createSession();
      setSessions((prev) => [session, ...prev]);
      setActiveId(session.id);
      setMessages([]);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "创建对话失败", "error");
    }
  };

  const removeSession = async (id: string) => {
    try {
      await chatApi.remove(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "删除失败", "error");
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || !activeId || thinking) return;
    setDraft("");
    setThinking(true);

    const optimistic: ChatMessageView = {
      id: `temp-${Date.now()}`,
      role: "user",
      text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const { reply } = await chatApi.send(activeId, text);
      setMessages((prev) => [...prev, reply]);
      void loadSessions();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "发送失败", "error");
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(text);
    } finally {
      setThinking(false);
    }
  };

  if (!owner) {
    return (
      <div className="empty card">
        <div className="empty-icon">🤖</div>
        <h3>登录后使用虚拟伙伴</h3>
        <p style={{ marginTop: "var(--sp-2)" }}>
          虚拟伙伴是你的专属 AI 助手，对话内容仅你可见，需要先登录主人账号
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 0, padding: 0, overflow: "hidden", height: "calc(100vh - var(--topbar-h) - var(--sp-12))" }}>
      {/* 会话列表 */}
      <nav aria-label="伙伴会话列表" style={{ borderRight: "1px solid var(--line)", overflowY: "auto", padding: "var(--sp-3)" }}>
        <button className="btn btn-primary" style={{ width: "100%", marginBottom: "var(--sp-3)" }} onClick={newSession}>
          ＋ 新对话
        </button>
        {sessions.map((s) => (
          <div key={s.id} style={{ position: "relative" }}>
            <button
              className="nav-item"
              style={activeId === s.id ? { background: "var(--brand-soft)", color: "var(--brand)" } : undefined}
              onClick={() => setActiveId(s.id)}
            >
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.title}
              </span>
            </button>
            <button
              className="btn btn-ghost btn-sm"
              aria-label={`删除对话 ${s.title}`}
              style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", opacity: 0.5 }}
              onClick={() => void removeSession(s.id)}
            >
              ✕
            </button>
          </div>
        ))}
      </nav>

      {/* 对话区 */}
      <section style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header style={{ padding: "var(--sp-4) var(--sp-5)", borderBottom: "1px solid var(--line)" }}>
          <strong>我的 AI 伙伴</strong>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>
            陪你聊业务、出主意，也能替你去广场对接伙伴
          </div>
        </header>

        <div style={{ flex: 1, overflowY: "auto", padding: "var(--sp-5)", display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
          {messages.length === 0 && (
            <p style={{ color: "var(--ink-3)", textAlign: "center", marginTop: "var(--sp-8)" }}>
              你好呀！我是你的专属伙伴，想聊点什么？😊
            </p>
          )}
          {messages.map((m) => {
            const mine = m.role === "user";
            return (
              <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                {!mine && (
                  <div
                    aria-hidden
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: "var(--r-full)",
                      background: "var(--grad-brand)",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 15,
                      marginRight: "var(--sp-2)",
                      flexShrink: 0,
                    }}
                  >
                    🤖
                  </div>
                )}
                <div
                  style={{
                    maxWidth: "70%",
                    padding: "var(--sp-3) var(--sp-4)",
                    borderRadius: "var(--r-lg)",
                    background: mine ? "var(--grad-brand)" : "var(--surface-3)",
                    color: mine ? "#fff" : "var(--ink)",
                    lineHeight: "var(--lh-base)",
                    wordBreak: "break-word",
                  }}
                >
                  {m.text}
                  <div style={{ fontSize: "var(--fs-xs)", opacity: 0.6, marginTop: 2, textAlign: "right" }}>
                    {fmtTime(m.createdAt)}
                  </div>
                </div>
              </div>
            );
          })}
          {thinking && (
            <div className="row" style={{ color: "var(--ink-3)", fontSize: "var(--fs-sm)" }}>
              <span style={{ fontSize: 15 }}>🤖</span>
              <span>思考中…</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <footer className="row" style={{ padding: "var(--sp-3) var(--sp-4)", borderTop: "1px solid var(--line)", gap: "var(--sp-3)" }}>
          <textarea
            className="textarea"
            style={{ minHeight: 44, maxHeight: 120 }}
            placeholder="问点什么…（Enter 发送）"
            aria-label="伙伴消息输入框"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button className="btn btn-primary" disabled={!draft.trim() || thinking} onClick={send}>
            {thinking ? "…" : "发送"}
          </button>
        </footer>
      </section>
    </div>
  );
}
