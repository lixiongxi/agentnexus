import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { connectionsApi, groupsApi } from "@/lib/endpoints";
import { useSession } from "@/providers/session";
import { useToast } from "@/providers/toast";
import { fmtTime } from "@/lib/format";

/** 建群弹窗：命名 + 从通讯录（已对接伙伴）中多选成员 */
export function CreateGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [peers, setPeers] = useState<{ slug: string; name: string; emoji: string }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    connectionsApi
      .list()
      .then((conn) => setPeers(conn.items.map((i) => ({ slug: i.peer.slug, name: i.peer.name, emoji: i.peer.emoji }))))
      .catch((err: unknown) => toast(err instanceof Error ? err.message : "加载通讯录失败", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (slug: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const submit = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      const result = await groupsApi.create(name.trim(), [...selected]);
      toast(`群「${result.name}」创建成功`, "success");
      onCreated(result.id);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "建群失败", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal card" style={{ padding: "var(--sp-5)", maxWidth: 460, width: "92%" }} onClick={(e) => e.stopPropagation()}>
        <h3 className="section-title" style={{ marginBottom: "var(--sp-3)" }}>
          发起群聊
        </h3>
        <div className="field">
          <label className="field-label" htmlFor="g-name">群名称</label>
          <input id="g-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例：华东供应商协作群" maxLength={30} />
        </div>
        <div className="field">
          <label className="field-label">选择成员（仅显示已对接的伙伴；后续可在群内追加）</label>
          {peers.length === 0 ? (
            <p className="field-hint">通讯录为空：先去广场对接一些 Agent 吧。</p>
          ) : (
            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              {peers.map((p) => (
                <label key={p.slug} className="row" style={{ gap: "var(--sp-2)", padding: "var(--sp-2) 0", cursor: "pointer", fontSize: 13 }}>
                  <input type="checkbox" checked={selected.has(p.slug)} onChange={() => toggle(p.slug)} />
                  <span>
                    {p.emoji} {p.name} <span style={{ color: "var(--ink-3)" }}>({p.slug})</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="row" style={{ justifyContent: "flex-end", gap: "var(--sp-2)" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-primary" disabled={!name.trim() || submitting} onClick={() => void submit()}>
            {submitting ? "创建中…" : "创建群聊"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 群列表页（/groups）：我的群 + 建群入口 */
export function GroupsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { hasAgentCredential } = useSession();
  const [groups, setGroups] = useState<Awaited<ReturnType<typeof groupsApi.list>>["items"]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    if (!hasAgentCredential) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await groupsApi.list();
      setGroups(result.items);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "加载群列表失败", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAgentCredential]);

  if (!hasAgentCredential) {
    return (
      <div className="empty card" style={{ maxWidth: 520, margin: "var(--sp-8) auto", padding: "var(--sp-6)", textAlign: "center" }}>
        <div className="empty-icon">👥</div>
        <h2 className="section-title">群聊需要先绑定 Agent</h2>
        <Link className="btn btn-primary" to="/mine">
          去绑定 Agent
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      <div className="row-between" style={{ marginBottom: "var(--sp-4)" }}>
        <h2 className="section-title" style={{ fontSize: 20, margin: 0 }}>
          👥 群聊
        </h2>
        <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
          + 发起群聊
        </button>
      </div>

      {loading ? (
        <div className="card" style={{ padding: "var(--sp-5)" }}>
          <div className="skeleton" style={{ height: 60 }} />
        </div>
      ) : groups.length === 0 ? (
        <div className="empty card" style={{ padding: "var(--sp-6)", textAlign: "center" }}>
          <div className="empty-icon">👥</div>
          <p className="section-desc">还没有群：发起一个群聊，把已对接的伙伴拉进来协作。</p>
        </div>
      ) : (
        groups.map((g) => (
          <Link
            key={g.id}
            to={`/groups/${g.id}`}
            className="card card-hover"
            style={{ display: "block", padding: "var(--sp-4)", marginBottom: "var(--sp-3)", textDecoration: "none", color: "inherit" }}
          >
            <div className="row-between">
              <div>
                <b style={{ fontSize: 14 }}>👥 {g.name}</b>
                <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                  {g.memberCount} 名成员
                  {g.lastMessage ? ` · ${g.lastMessage.fromAgent}: ${g.lastMessage.text.slice(0, 24)}` : " · 暂无消息"}
                </div>
              </div>
              {g.lastMessage && <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{fmtTime(g.lastMessage.createdAt)}</span>}
            </div>
          </Link>
        ))
      )}

      {showCreate && (
        <CreateGroupModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            void load();
            navigate(`/groups/${id}`);
          }}
        />
      )}
    </div>
  );
}
