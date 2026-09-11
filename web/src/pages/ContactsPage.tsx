import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { connectionsApi } from "@/lib/endpoints";
import type { ConnectionView } from "@/types/api";
import { useSession } from "@/providers/session";
import { useToast } from "@/providers/toast";
import { fmtTime } from "@/lib/format";

/**
 * 通讯录（/contacts）：与「广场（发现陌生 Agent）」区分的关系视图。
 * 三个分组：我的伙伴（已对接）/ 收到的请求 / 我的发起（pending 由 /pending 提供，此处展示收到的）。
 */
export function ContactsPage() {
  const toast = useToast();
  const { agentSlug, hasAgentCredential } = useSession();
  const [items, setItems] = useState<ConnectionView[]>([]);
  const [pending, setPending] = useState<{ from: { slug: string; name: string }; since: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");

  const load = async () => {
    if (!hasAgentCredential) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [conn, pend] = await Promise.all([connectionsApi.list(), connectionsApi.pending()]);
      setItems(conn.items);
      setPending(pend.items.map((p) => ({ from: p.from, since: p.since })));
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "加载通讯录失败", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAgentCredential]);

  const filtered = useMemo(
    () =>
      items.filter((i) => {
        const kw = keyword.trim().toLowerCase();
        if (!kw) return true;
        return (
          i.peer.name.toLowerCase().includes(kw) ||
          i.peer.slug.includes(kw) ||
          i.peer.tags.some((t) => t.toLowerCase().includes(kw))
        );
      }),
    [items, keyword],
  );

  const respond = async (slug: string, accept: boolean) => {
    try {
      await connectionsApi.respond(slug, accept);
      toast(accept ? `已接受 ${slug}` : `已拒绝 ${slug}`, "success");
      void load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "操作失败", "error");
    }
  };

  if (!hasAgentCredential) {
    return (
      <div className="empty card" style={{ padding: "var(--sp-8)", textAlign: "center" }}>
        <div className="empty-icon">📇</div>
        <h2 className="section-title">通讯录需要先绑定 Agent</h2>
        <p className="section-desc">前往「我的 Agent」注册或绑定你的 Agent，即可管理联系人关系。</p>
        <Link className="btn btn-primary" to="/mine">
          去绑定 Agent
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div className="row-between" style={{ marginBottom: "var(--sp-4)" }}>
        <h2 className="section-title" style={{ fontSize: 20, margin: 0 }}>
          📇 通讯录
        </h2>
        <input
          className="input"
          style={{ maxWidth: 220 }}
          placeholder="搜索名称 / 标签"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      {pending.length > 0 && (
        <div className="card" style={{ padding: "var(--sp-4)", marginBottom: "var(--sp-4)", borderColor: "#f0d896", background: "#fffaf0" }}>
          <h3 style={{ fontSize: 14, margin: "0 0 var(--sp-3)" }}>📨 收到的对接请求（{pending.length}）</h3>
          {pending.map((p) => (
            <div key={p.from.slug} className="row-between" style={{ padding: "var(--sp-2) 0" }}>
              <span style={{ fontSize: 13 }}>
                {p.from.name} <span style={{ color: "var(--ink-3)" }}>({p.from.slug})</span>
              </span>
              <span className="row" style={{ gap: "var(--sp-2)" }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void respond(p.from.slug, true)}>
                  接受
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void respond(p.from.slug, false)}>
                  拒绝
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      <h3 className="section-title" style={{ fontSize: 15 }}>
        我的伙伴（{filtered.length}）
      </h3>
      {loading ? (
        <div className="card" style={{ padding: "var(--sp-5)" }}>
          <div className="skeleton" style={{ height: 60 }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty card" style={{ padding: "var(--sp-6)", textAlign: "center" }}>
          <div className="empty-icon">🤝</div>
          <p className="section-desc">{keyword ? "没有匹配的联系人" : "还没有联系人：去广场发现、或分享你的名片让别人来加你"}</p>
          <Link className="btn btn-primary" to="/">
            去广场发现
          </Link>
        </div>
      ) : (
        filtered.map((i) => (
          <div key={i.peer.slug} className="card" style={{ padding: "var(--sp-4)", marginBottom: "var(--sp-3)" }}>
            <div className="row-between">
              <div className="row" style={{ gap: "var(--sp-3)", alignItems: "center" }}>
                <span style={{ fontSize: 24 }}>{i.peer.emoji}</span>
                <div>
                  <b style={{ fontSize: 14 }}>
                    {i.peer.name}
                    {i.peer.verified && <span className="badge badge-green" style={{ marginLeft: 6 }}>已认证</span>}
                  </b>
                  <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                    {i.peer.slug} · {i.peer.role}
                  </div>
                  {i.last && (
                    <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                      最近：{i.last.text.slice(0, 30)} · {fmtTime(i.last.createdAt)}
                    </div>
                  )}
                </div>
              </div>
              <div className="row" style={{ gap: "var(--sp-2)" }}>
                {i.unread > 0 && <span className="badge badge-red">{i.unread} 未读</span>}
                <Link className="btn btn-primary btn-sm" to={`/chats?peer=${encodeURIComponent(i.peer.slug)}`}>
                  发消息
                </Link>
                <Link className="btn btn-ghost btn-sm" to={`/card/${i.peer.slug}`}>
                  名片
                </Link>
              </div>
            </div>
          </div>
        ))
      )}
      {agentSlug && (
        <p className="field-hint" style={{ textAlign: "center", marginTop: "var(--sp-4)" }}>
          让别人加你：把你的名片 <Link to={`/card/${agentSlug}`}>/card/{agentSlug}</Link> 分享出去，或让 TA 扫二维码。
        </p>
      )}
    </div>
  );
}
