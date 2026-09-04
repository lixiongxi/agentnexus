import type { AgentView } from "@/types/api";
import { useToast } from "@/providers/toast";
import { connectionsApi } from "@/lib/endpoints";
import { useSession } from "@/providers/session";

/** 广场 Agent 卡片：信息展示 + 一键对接 */

interface AgentCardProps {
  agent: AgentView;
  onConnected?: () => void;
}

export function AgentCard({ agent, onConnected }: AgentCardProps) {
  const toast = useToast();
  const { agentSlug, hasAgentCredential } = useSession();

  const isSelf = agent.slug === agentSlug;
  const canConnect = hasAgentCredential && !isSelf;

  const handleConnect = async () => {
    if (!agentSlug) return;
    try {
      const result = await connectionsApi.create(agentSlug, agent.slug);
      toast(result.message, result.created ? "success" : "info");
      onConnected?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "对接失败";
      toast(message, "error");
    }
  };

  return (
    <article className="card card-hover" style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
      <header className="row" style={{ gap: "var(--sp-3)" }}>
        <div
          aria-hidden
          style={{
            width: 42,
            height: 42,
            borderRadius: "var(--r-md)",
            background: `${agent.color}1a`,
            display: "grid",
            placeItems: "center",
            fontSize: 22,
            flexShrink: 0,
          }}
        >
          {agent.emoji}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row" style={{ gap: "var(--sp-2)" }}>
            <strong style={{ fontSize: "var(--fs-lg)" }}>{agent.name}</strong>
            {agent.verified && <span className="badge badge-brand">已认证</span>}
            {isSelf && <span className="badge badge-cyan">我的</span>}
          </div>
          <div style={{ color: "var(--ink-3)", fontSize: "var(--fs-sm)" }}>@{agent.slug}</div>
        </div>
        <span className={`badge ${agent.online ? "badge-green" : ""}`}>
          {agent.online ? "在线" : "离线"}
        </span>
      </header>

      <p style={{ color: "var(--ink-2)", fontSize: "var(--fs-md)", lineHeight: "var(--lh-base)" }}>
        {agent.role}
      </p>

      {agent.description && (
        <p style={{ color: "var(--ink-3)", fontSize: "var(--fs-sm)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {agent.description}
        </p>
      )}

      <div className="row" style={{ gap: "var(--sp-2)", flexWrap: "wrap" }}>
        <span className="tag">{agent.industry}</span>
        {agent.tags.slice(0, 4).map((t) => (
          <span className="tag" key={t}>
            {t}
          </span>
        ))}
      </div>

      <footer className="row-between" style={{ marginTop: "auto", paddingTop: "var(--sp-2)" }}>
        <span style={{ color: "var(--ink-4)", fontSize: "var(--fs-xs)" }}>
          {agent.owner ? `${agent.owner.name} · ${agent.owner.org}` : "主人信息不可见"}
        </span>
        <button className="btn btn-primary btn-sm" disabled={!canConnect} onClick={handleConnect}>
          {isSelf ? "这是我的" : canConnect ? "对接" : "需先绑定 Agent"}
        </button>
      </footer>
    </article>
  );
}
