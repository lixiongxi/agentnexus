import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { groupsApi } from "@/lib/endpoints";
import { useSession } from "@/providers/session";
import { useToast } from "@/providers/toast";
import { fmtTime } from "@/lib/format";
import type { GroupMessageView } from "@/types/api";

/** 群聊页（/groups/:id）：成员列表 + 消息流（实时）+ 发送框 */
export function GroupChatPage() {
  const { id = "" } = useParams();
  const toast = useToast();
  const { agentSlug, subscribeGroupMessages } = useSession();

  const [detail, setDetail] = useState<Awaited<ReturnType<typeof groupsApi.detail>> | null>(null);
  const [messages, setMessages] = useState<GroupMessageView[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await groupsApi.detail(id);
      setDetail(d);
      setMessages(d.messages);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "加载群信息失败", "error");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // 实时：订阅本群的新消息（含 @助理 的 bot 回复）
  useEffect(() => {
    const off = subscribeGroupMessages((msg) => {
      if (msg.groupId !== id) return;
      setMessages((arr) => (arr.some((m) => m.id === msg.id) ? arr : [...arr, msg]));
    });
    return off;
  }, [id, subscribeGroupMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const msg = await groupsApi.send(id, text);
      setMessages((arr) => (arr.some((m) => m.id === msg.id) ? arr : [...arr, msg]));
      setDraft("");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "发送失败", "error");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <div className="card" style={{ padding: "var(--sp-5)" }}>
          <div className="skeleton" style={{ height: 200 }} />
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="empty card" style={{ maxWidth: 520, margin: "var(--sp-8) auto", padding: "var(--sp-6)", textAlign: "center" }}>
        <div className="empty-icon">🚫</div>
        <p className="section-desc">群不存在或你不是成员。</p>
        <Link className="btn btn-primary" to="/groups">
          回群列表
        </Link>
      </div>
    );
  }

  const isCreator = detail.creatorSlug === agentSlug;

  const [addSlug, setAddSlug] = useState("");
  const [adding, setAdding] = useState(false);
  const addMember = async () => {
    const slug = addSlug.trim();
    if (!slug || adding) return;
    setAdding(true);
    try {
      const r = await groupsApi.addMembers(id, [slug]);
      toast(r.added.length ? `已添加 ${r.added.join("、")}` : "该成员已在群里", "success");
      setAddSlug("");
      void load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "添加失败", "error");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", height: "calc(100vh - 140px)", minHeight: 420 }}>
      <div className="row-between" style={{ marginBottom: "var(--sp-3)" }}>
        <div>
          <h2 className="section-title" style={{ fontSize: 18, margin: 0 }}>
            👥 {detail.name}
          </h2>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {detail.members.length} 名成员 · 群主：{detail.creatorSlug}
          </span>
        </div>
        <Link className="btn btn-ghost btn-sm" to="/groups">
          ← 群列表
        </Link>
      </div>

      {/* 成员条 */}
      <div className="row" style={{ gap: "var(--sp-2)", flexWrap: "wrap", marginBottom: "var(--sp-3)" }}>
        {detail.members.map((m) => (
          <span key={m.agentSlug} className="tag" title={m.agentSlug}>
            {m.emoji ?? "🤖"} {m.name ?? m.agentSlug}
            {m.isCreator ? "（群主）" : ""}
            {m.agentSlug === agentSlug ? "（我）" : ""}
          </span>
        ))}
      </div>

      {/* 群主添加成员 */}
      {isCreator && (
        <div className="row" style={{ gap: "var(--sp-2)", marginBottom: "var(--sp-3)" }}>
          <input
            className="input"
            style={{ flex: 1 }}
            value={addSlug}
            onChange={(e) => setAddSlug(e.target.value)}
            placeholder="输入伙伴的 slug 添加成员（需已与群主对接）"
            maxLength={40}
          />
          <button type="button" className="btn btn-ghost btn-sm" disabled={!addSlug.trim() || adding} onClick={() => void addMember()}>
            {adding ? "…" : "添加成员"}
          </button>
        </div>
      )}

      {/* 消息流 */}
      <div className="card" style={{ flex: 1, overflowY: "auto", padding: "var(--sp-4)", marginBottom: "var(--sp-3)" }}>
        {messages.length === 0 ? (
          <div className="empty" style={{ textAlign: "center", padding: "var(--sp-6)" }}>
            <p className="section-desc">还没有消息：说点什么，或 @某个助理 让它干活（例：@{detail.members.find((m) => !m.isCreator)?.agentSlug ?? "assistant"} 报价）。</p>
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.fromAgent === agentSlug;
            const member = detail.members.find((x) => x.agentSlug === m.fromAgent);
            return (
              <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: "var(--sp-3)" }}>
                <div style={{ maxWidth: "78%" }}>
                  {!mine && (
                    <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 2 }}>
                      {member?.emoji ?? "🤖"} {member?.name ?? m.fromAgent}
                      {m.type === "bot" && <span className="badge badge-cyan" style={{ marginLeft: 6 }}>自动应答</span>}
                    </div>
                  )}
                  <div
                    style={{
                      background: mine ? "var(--brand)" : m.type === "bot" ? "#eef7f4" : "#fbfcfe",
                      color: mine ? "#fff" : "var(--ink)",
                      borderRadius: 10,
                      padding: "8px 12px",
                      fontSize: 13,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      border: mine ? "none" : "1px solid var(--line, #e6eaf2)",
                    }}
                  >
                    {m.text}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--ink-3)", textAlign: mine ? "right" : "left", marginTop: 2 }}>{fmtTime(m.createdAt)}</div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* 发送框 */}
      <div className="row" style={{ gap: "var(--sp-2)" }}>
        <input
          className="input"
          style={{ flex: 1 }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="发消息…（@助理slug 可召唤助理）"
          maxLength={4000}
        />
        <button type="button" className="btn btn-primary" disabled={!draft.trim() || sending} onClick={() => void send()}>
          {sending ? "…" : "发送"}
        </button>
      </div>
    </div>
  );
}
