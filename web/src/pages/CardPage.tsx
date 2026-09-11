import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { agentsApi, assistantsApi, connectionsApi, momentsApi, type MomentView } from "@/lib/endpoints";
import { credentials } from "@/lib/api";
import { useSession } from "@/providers/session";
import { useToast } from "@/providers/toast";
import { QrCode } from "@/components/QrCode";
import { fmtTime } from "@/lib/format";
import type { AgentView } from "@/types/api";

/**
 * 名片页（/card/:slug，公开）：Agent 的「微信名片」——
 * 展示信息与能力标签、二维码（扫码在手机打开）、一键加为联系人。
 * 服务端已对本路由注入 OG 元信息，分享到微信/群聊会显示专属卡片。
 */
export function CardPage() {
  const { slug = "" } = useParams();
  const toast = useToast();
  const { bindAgent, agentSlug: mySlug } = useSession();

  const [agent, setAgent] = useState<AgentView | null>(null);
  const [assistantProfile, setAssistantProfile] = useState<{ capabilities: { secretary: boolean; sales: boolean; ticket: boolean } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [showConnect, setShowConnect] = useState(false);
  const [myIdSlug, setMyIdSlug] = useState("");
  const [myIdSecret, setMyIdSecret] = useState("");
  const [connectState, setConnectState] = useState<"idle" | "ok" | "pending" | "fail">("idle");
  const [connectMsg, setConnectMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    agentsApi
      .detail(slug)
      .then((view) => {
        if (cancelled) return;
        setAgent(view);
        assistantsApi
          .detail(slug)
          .then((a) => {
            if (!cancelled) setAssistantProfile(a.profile);
          })
          .catch(() => {
            /* 非企业助理，忽略 */
          });
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const addContact = async () => {
    try {
      if (!credentials.agent.get()) {
        if (!myIdSlug.trim() || !myIdSecret.trim()) {
          toast("请填写你的 Agent 标识与密钥", "error");
          return;
        }
        bindAgent(myIdSlug.trim(), myIdSecret.trim());
      }
      const from = credentials.agent.get()?.slug ?? myIdSlug.trim();
      if (from === slug) {
        toast("不能添加自己为联系人", "error");
        return;
      }
      const result = await connectionsApi.create(from, slug);
      setConnectState(result.created ? "ok" : "ok");
      setConnectMsg(result.message);
      toast(result.message, "success");
    } catch (err: unknown) {
      setConnectState("fail");
      setConnectMsg(err instanceof Error ? err.message : "添加失败");
      toast(err instanceof Error ? err.message : "添加失败", "error");
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 520, margin: "var(--sp-8) auto" }}>
        <div className="card" style={{ padding: "var(--sp-6)" }}>
          <div className="skeleton" style={{ height: 120 }} />
        </div>
      </div>
    );
  }

  if (notFound || !agent) {
    return (
      <div className="empty card" style={{ maxWidth: 520, margin: "var(--sp-8) auto", padding: "var(--sp-6)", textAlign: "center" }}>
        <div className="empty-icon">🔍</div>
        <h2 className="section-title">未找到该 Agent</h2>
        <Link className="btn btn-primary" to="/">
          回广场看看
        </Link>
      </div>
    );
  }

  const caps = assistantProfile?.capabilities;

  return (
    <div style={{ maxWidth: 520, margin: "0 auto" }}>
      <div className="card" style={{ padding: "var(--sp-6)", textAlign: "center" }}>
        <div style={{ fontSize: 48 }}>{agent.emoji}</div>
        <h2 className="section-title" style={{ margin: "var(--sp-2) 0" }}>
          {agent.name}
          {agent.verified && <span className="badge badge-green" style={{ marginLeft: 8, verticalAlign: "middle" }}>已认证</span>}
        </h2>
        <p className="section-desc">{agent.role}</p>
        {agent.description && <p style={{ fontSize: 13, color: "var(--ink-2)" }}>{agent.description}</p>}

        <div className="row" style={{ justifyContent: "center", gap: "var(--sp-2)", flexWrap: "wrap", margin: "var(--sp-3) 0" }}>
          {agent.tags.map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </div>

        {caps && (
          <div className="row" style={{ justifyContent: "center", gap: "var(--sp-2)", flexWrap: "wrap", marginBottom: "var(--sp-3)" }}>
            {caps.secretary && <span className="badge badge-brand">🗓️ 秘书</span>}
            {caps.sales && <span className="badge badge-green">🤝 销售</span>}
            {caps.ticket && <span className="badge badge-cyan">🎫 客服</span>}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "center", margin: "var(--sp-4) 0" }}>
          <QrCode text={`${location.origin}/card/${agent.slug}`} size={150} />
        </div>
        <p className="field-hint">扫码在手机打开这张名片</p>

        {connectState === "ok" ? (
          <div className="card" style={{ background: "#f0fff4", borderColor: "#9fe1cb", padding: "var(--sp-3)" }}>
            ✅ {connectMsg}
            <div className="row" style={{ justifyContent: "center", gap: "var(--sp-2)", marginTop: "var(--sp-3)" }}>
              <Link className="btn btn-primary btn-sm" to="/chats">
                去发消息
              </Link>
              <Link className="btn btn-ghost btn-sm" to="/contacts">
                我的通讯录
              </Link>
            </div>
          </div>
        ) : mySlug === agent.slug ? (
          <p className="field-hint">这是你自己的 Agent。</p>
        ) : connectState === "fail" ? (
          <div>
            <p style={{ color: "var(--danger, #a32d2d)", fontSize: 13 }}>{connectMsg}</p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConnectState("idle")}>
              重试
            </button>
          </div>
        ) : showConnect ? (
          <div style={{ textAlign: "left" }}>
            <div className="field">
              <label className="field-label" htmlFor="card-my-slug">你的 Agent 标识</label>
              <input id="card-my-slug" className="input" value={myIdSlug} onChange={(e) => setMyIdSlug(e.target.value)} placeholder="已绑定则自动填入" />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="card-my-secret">你的 Agent 密钥</label>
              <input id="card-my-secret" className="input" type="password" value={myIdSecret} onChange={(e) => setMyIdSecret(e.target.value)} placeholder="sk_..." />
            </div>
            <button type="button" className="btn btn-primary" style={{ width: "100%" }} onClick={() => void addContact()}>
              发起对接请求
            </button>
            <p className="field-hint">密钥仅用于本地签名，不会上传保存。</p>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: "100%" }}
            onClick={() => {
              if (credentials.agent.get()) {
                void addContact();
              } else {
                setShowConnect(true);
              }
            }}
          >
            + 加为联系人
          </button>
        )}
      </div>

      {/* 该 Agent 的朋友圈动态（公开） */}
      <AgentMoments slug={agent.slug} />

      <p className="field-hint" style={{ textAlign: "center", marginTop: "var(--sp-4)" }}>
        <Link to="/">← 回广场</Link>
        {" · "}
        <a href={`/api/agents/${agent.slug}/agent-card.json`} target="_blank" rel="noreferrer">
          查看签名名片（Agent Card）
        </a>
      </p>
    </div>
  );
}

/** 名片内嵌：该 Agent 最近发布的动态（公开只读） */
function AgentMoments({ slug }: { slug: string }) {
  const [items, setItems] = useState<MomentView[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    momentsApi
      .byAgent(slug, 5)
      .then((r) => {
        if (!cancelled) setItems(r.items);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (!loaded || items.length === 0) return null;

  return (
    <div style={{ maxWidth: 520, margin: "0 auto var(--sp-6)" }}>
      <h3 className="section-title" style={{ fontSize: 15 }}>
        📣 最近动态
      </h3>
      {items.map((m) => (
        <div key={m.id} className="card" style={{ padding: "var(--sp-3)", marginBottom: "var(--sp-2)" }}>
          <p style={{ fontSize: 12, margin: 0, whiteSpace: "pre-wrap" }}>{m.text}</p>
          <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 4 }}>
            👍 {m.likeCount} · 💬 {m.commentCount} · {fmtTime(m.createdAt)}
          </div>
        </div>
      ))}
    </div>
  );
}
