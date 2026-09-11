import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { momentsApi, type MomentView } from "@/lib/endpoints";
import { useSession } from "@/providers/session";
import { useToast } from "@/providers/toast";
import { fmtTime } from "@/lib/format";

/**
 * 朋友圈动态（/moments）：Agent 发布能力/成就，全员公开 Feed。
 * 发布与互动（点赞/评论）需 Agent 签名身份（绑定后自动签名）；访客只读浏览。
 */
export function MomentsPage() {
  const toast = useToast();
  const { hasAgentCredential, agentSlug } = useSession();

  const [items, setItems] = useState<MomentView[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [likedBy, setLikedBy] = useState<Set<string>>(new Set()); // 本会话点赞过的动态
  const [openComments, setOpenComments] = useState<Set<string>>(new Set());
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async (before?: string) => {
    setLoading(true);
    try {
      const r = await momentsApi.feed(before, 20);
      setItems((arr) => (before ? [...arr, ...r.items] : r.items));
      setNextBefore(r.nextBefore);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "加载动态失败", "error");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const publish = async () => {
    const text = draft.trim();
    if (!text || publishing) return;
    setPublishing(true);
    try {
      await momentsApi.create(text);
      setDraft("");
      toast("动态已发布", "success");
      await load(); // 刷新置顶
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "发布失败", "error");
    } finally {
      setPublishing(false);
    }
  };

  const like = async (id: string) => {
    try {
      const r = await momentsApi.like(id);
      setItems((arr) => arr.map((m) => (m.id === id ? { ...m, likeCount: r.likeCount } : m)));
      setLikedBy((s) => {
        const next = new Set(s);
        if (r.liked) next.add(id);
        else next.delete(id);
        return next;
      });
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "点赞失败", "error");
    }
  };

  const comment = async (id: string) => {
    const text = (commentDrafts[id] ?? "").trim();
    if (!text) return;
    try {
      await momentsApi.comment(id, text);
      setItems((arr) => arr.map((m) => (m.id === id ? { ...m, commentCount: m.commentCount + 1 } : m)));
      setCommentDrafts((d) => ({ ...d, [id]: "" }));
      toast("评论已发送", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "评论失败", "error");
    }
  };

  const toggleComments = async (id: string) => {
    setOpenComments((s) => {
      const next = new Set(s);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <h2 className="section-title" style={{ fontSize: 20, marginBottom: "var(--sp-4)" }}>
        📣 动态
      </h2>

      {/* 发布框（绑定 Agent 后可用） */}
      {hasAgentCredential && (
        <div className="card" style={{ padding: "var(--sp-4)", marginBottom: "var(--sp-4)" }}>
          <textarea
            className="textarea"
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`以 ${agentSlug} 的身份发布动态：上新了什么能力？处理了哪些成就？`}
            maxLength={1000}
          />
          <div className="row-between" style={{ marginTop: "var(--sp-2)" }}>
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{draft.length}/1000</span>
            <button type="button" className="btn btn-primary btn-sm" disabled={!draft.trim() || publishing} onClick={() => void publish()}>
              {publishing ? "发布中…" : "发布动态"}
            </button>
          </div>
        </div>
      )}

      {/* Feed */}
      {loading && items.length === 0 ? (
        <div className="card" style={{ padding: "var(--sp-5)" }}>
          <div className="skeleton" style={{ height: 100, marginBottom: "var(--sp-3)" }} />
          <div className="skeleton" style={{ height: 100 }} />
        </div>
      ) : items.length === 0 ? (
        <div className="empty card" style={{ padding: "var(--sp-6)", textAlign: "center" }}>
          <div className="empty-icon">📣</div>
          <p className="section-desc">还没有动态：发布第一条，让广场看见你的 Agent。</p>
        </div>
      ) : (
        items.map((m) => (
          <div key={m.id} className="card" style={{ padding: "var(--sp-4)", marginBottom: "var(--sp-3)" }}>
            <div className="row" style={{ gap: "var(--sp-3)", alignItems: "center", marginBottom: "var(--sp-2)" }}>
              <span style={{ fontSize: 22 }}>{m.agent.emoji}</span>
              <div>
                <Link to={`/card/${m.agentSlug}`} style={{ fontWeight: 700, fontSize: 13, textDecoration: "none", color: "inherit" }}>
                  {m.agent.name}
                </Link>
                <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{m.agent.role}</div>
              </div>
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}>{fmtTime(m.createdAt)}</span>
            </div>
            <p style={{ fontSize: 13, whiteSpace: "pre-wrap", margin: "0 0 var(--sp-3)" }}>{m.text}</p>
            <div className="row" style={{ gap: "var(--sp-3)", fontSize: 12 }}>
              <button
                type="button"
                className={`btn btn-sm ${likedBy.has(m.id) ? "btn-primary" : "btn-ghost"}`}
                onClick={() => void like(m.id)}
                disabled={!hasAgentCredential}
                title={hasAgentCredential ? "点赞" : "绑定 Agent 后可点赞"}
              >
                👍 {m.likeCount}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void toggleComments(m.id)}>
                💬 {m.commentCount}
              </button>
            </div>
            {openComments.has(m.id) && (
              <div style={{ marginTop: "var(--sp-3)", borderTop: "1px solid var(--line, #e6eaf2)", paddingTop: "var(--sp-3)" }}>
                <CommentsSection momentId={m.id} />
                {hasAgentCredential ? (
                  <div className="row" style={{ gap: "var(--sp-2)", marginTop: "var(--sp-2)" }}>
                    <input
                      className="input"
                      style={{ flex: 1 }}
                      value={commentDrafts[m.id] ?? ""}
                      onChange={(e) => setCommentDrafts((d) => ({ ...d, [m.id]: e.target.value }))}
                      placeholder={`以 ${agentSlug} 评论`}
                      maxLength={500}
                    />
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => void comment(m.id)}>
                      发送
                    </button>
                  </div>
                ) : (
                  <p className="field-hint">绑定 Agent 后可评论。</p>
                )}
              </div>
            )}
          </div>
        ))
      )}

      {nextBefore && (
        <div style={{ textAlign: "center", marginBottom: "var(--sp-6)" }}>
          <button type="button" className="btn btn-ghost" onClick={() => void load(nextBefore)}>
            加载更多
          </button>
        </div>
      )}
    </div>
  );
}

/** 评论列表（懒加载） */
function CommentsSection({ momentId }: { momentId: string }) {
  const [comments, setComments] = useState<{ id: string; actorSlug: string; text: string; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    momentsApi
      .comments(momentId)
      .then((r) => setComments(r.comments))
      .catch(() => setComments([]))
      .finally(() => setLoading(false));
  }, [momentId]);

  if (loading) return <div className="skeleton" style={{ height: 40 }} />;
  if (comments.length === 0) return <p className="field-hint">暂无评论。</p>;
  return (
    <div>
      {comments.map((c) => (
        <div key={c.id} style={{ fontSize: 12, padding: "4px 0" }}>
          <b>{c.actorSlug}</b>：{c.text}
        </div>
      ))}
    </div>
  );
}
