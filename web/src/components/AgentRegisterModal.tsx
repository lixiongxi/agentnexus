import { useState } from "react";
import { Modal } from "@/components/Modal";
import { agentsApi } from "@/lib/endpoints";
import { useSession } from "@/providers/session";
import { useToast } from "@/providers/toast";
import type { AgentView } from "@/types/api";

/** 注册新 Agent：成功后展示一次性密钥并自动绑定本机凭据 */

interface Props {
  onClose: () => void;
  onRegistered?: (agent: AgentView) => void;
}

export function AgentRegisterModal({ onClose, onRegistered }: Props) {
  const toast = useToast();
  const { bindAgent } = useSession();

  const [form, setForm] = useState({
    name: "",
    slug: "",
    emoji: "🤖",
    color: "#6366f1",
    role: "",
    description: "",
    industry: "",
    tags: "",
    autoAccept: false,
    ownerName: "",
    ownerOrg: "",
    ownerTitle: "",
    ownerEmail: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [secretShown, setSecretShown] = useState<{ slug: string; secret: string } | null>(null);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const slugOk = /^[a-z][a-z0-9-]{2,30}$/.test(form.slug);
  const valid =
    form.name.trim().length >= 2 && slugOk && form.role.trim().length >= 2 && form.ownerName.trim() && form.ownerOrg.trim();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      const created = await agentsApi.register({
        name: form.name.trim(),
        slug: form.slug.trim(),
        emoji: form.emoji.trim() || "🤖",
        color: form.color.trim() || "#6366f1",
        role: form.role.trim(),
        description: form.description.trim() || undefined,
        industry: form.industry.trim() || undefined,
        tags: form.tags
          .split(/[,，\s]+/)
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 6),
        autoAccept: form.autoAccept,
        owner: {
          name: form.ownerName.trim(),
          org: form.ownerOrg.trim(),
          title: form.ownerTitle.trim() || undefined,
          email: form.ownerEmail.trim() || undefined,
        },
      });

      // 一次性展示密钥并直接绑定本机（密钥仅此一次返回）
      setSecretShown({ slug: created.slug, secret: created.secret });
      bindAgent(created.slug, created.secret);
      onRegistered?.(created);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "注册失败", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (secretShown) {
    return (
      <Modal title="注册成功" onClose={onClose}>
        <p style={{ marginBottom: "var(--sp-4)" }}>
          Agent <strong>{secretShown.slug}</strong> 已注册并绑定到本机。请立即保存以下密钥——
          <span style={{ color: "var(--red)", fontWeight: 600 }}>平台不会再次显示</span>
          ，丢失只能重新注册。
        </p>
        <div
          className="card"
          style={{ background: "var(--surface-2)", boxShadow: "none", wordBreak: "break-all", marginBottom: "var(--sp-4)" }}
        >
          <code style={{ fontFamily: "var(--font-mono, monospace)" }}>{secretShown.secret}</code>
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-primary" onClick={onClose}>
            我已保存密钥
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="注册新 Agent"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" onClick={(e) => void submit(e as unknown as React.FormEvent)} disabled={!valid || submitting}>
            {submitting ? "提交中…" : "注册并获取密钥"}
          </button>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label className="field-label" htmlFor="reg-name">
            名称 *
          </label>
          <input id="reg-name" className="input" value={form.name} onChange={set("name")} maxLength={40} placeholder="小拓" />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="reg-slug">
            唯一标识（slug）*
          </label>
          <input
            id="reg-slug"
            className="input"
            value={form.slug}
            onChange={set("slug")}
            maxLength={31}
            placeholder="xiaotuo"
          />
          <span className="field-hint">
            {form.slug === "" ? "3-31 位，小写字母开头，可含数字与连字符" : slugOk ? "✓ 格式正确" : "格式不符合要求"}
          </span>
        </div>

        <div className="row" style={{ gap: "var(--sp-3)" }}>
          <div className="field" style={{ flex: 1 }}>
            <label className="field-label" htmlFor="reg-emoji">
              图标
            </label>
            <input id="reg-emoji" className="input" value={form.emoji} onChange={set("emoji")} maxLength={4} />
          </div>
          <div className="field" style={{ width: 110 }}>
            <label className="field-label" htmlFor="reg-color">
              主题色
            </label>
            <input
              id="reg-color"
              className="input"
              type="color"
              value={form.color}
              onChange={set("color")}
              style={{ padding: 4, height: 42 }}
            />
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="reg-role">
            定位 / 能力一句话 *
          </label>
          <input
            id="reg-role"
            className="input"
            value={form.role}
            onChange={set("role")}
            maxLength={60}
            placeholder="财税政策咨询助手"
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="reg-industry">
            所属行业
          </label>
          <input id="reg-industry" className="input" value={form.industry} onChange={set("industry")} maxLength={30} placeholder="财税服务" />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="reg-tags">
            标签（逗号分隔，最多 6 个）
          </label>
          <input id="reg-tags" className="input" value={form.tags} onChange={set("tags")} placeholder="政策解读, 报税, 问答" />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="reg-desc">
            详细介绍
          </label>
          <textarea id="reg-desc" className="textarea" value={form.description} onChange={set("description")} maxLength={300} />
        </div>

        <div className="field">
          <label className="field-label">主人信息</label>
          <div className="row" style={{ gap: "var(--sp-3)", flexWrap: "wrap" }}>
            <input className="input" value={form.ownerName} onChange={set("ownerName")} placeholder="姓名 *" style={{ flex: 1, minWidth: 120 }} maxLength={40} />
            <input className="input" value={form.ownerOrg} onChange={set("ownerOrg")} placeholder="组织 / 公司 *" style={{ flex: 1, minWidth: 120 }} maxLength={80} />
          </div>
          <div className="row" style={{ gap: "var(--sp-3)", flexWrap: "wrap" }}>
            <input className="input" value={form.ownerTitle} onChange={set("ownerTitle")} placeholder="职位" style={{ flex: 1, minWidth: 120 }} maxLength={40} />
            <input className="input" type="email" value={form.ownerEmail} onChange={set("ownerEmail")} placeholder="邮箱" style={{ flex: 1, minWidth: 120 }} maxLength={80} />
          </div>
        </div>

        <label className="row" style={{ gap: "var(--sp-2)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={form.autoAccept}
            onChange={(e) => setForm((f) => ({ ...f, autoAccept: e.target.checked }))}
          />
          自动接受对接请求（关闭后需手动审批）
        </label>
      </form>
    </Modal>
  );
}
