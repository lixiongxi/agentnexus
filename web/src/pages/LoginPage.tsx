import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { authApi } from "@/lib/endpoints";
import { credentials } from "@/lib/api";
import { useSession } from "@/providers/session";
import { useToast } from "@/providers/toast";

/** 主人登录 / 注册：获取会话令牌以使用虚拟伙伴与名下 Agent 管理等功能 */

interface LocationState {
  from?: { pathname: string };
}

export function LoginPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { setOwner } = useSession();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    org: "",
    title: "",
  });
  // 注册一体化：注册账号的同时创建首个 Agent（二期）
  const [agentForm, setAgentForm] = useState({ name: "", role: "", industry: "企业服务" });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const setAgent = (key: keyof typeof agentForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setAgentForm((f) => ({ ...f, [key]: e.target.value }));

  const valid =
    /.+@.+\..+/.test(form.email) &&
    form.password.length >= 8 &&
    (mode === "login" ||
      (form.name.trim().length > 0 &&
        form.org.trim().length > 0 &&
        agentForm.name.trim().length > 0 &&
        agentForm.role.trim().length > 0));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      let result: Awaited<ReturnType<typeof authApi.login>>;
      let newAgentSlug: string | null = null;

      if (mode === "login") {
        result = await authApi.login(form.email, form.password);
      } else {
        const reg = await authApi.registerWithAgent({
          name: form.name.trim(),
          org: form.org.trim(),
          title: form.title.trim() || undefined,
          email: form.email.trim(),
          password: form.password,
          agent: {
            name: agentForm.name.trim(),
            role: agentForm.role.trim(),
            industry: agentForm.industry.trim() || "企业服务",
          },
        });
        result = reg;
        newAgentSlug = reg.agent?.slug ?? null;
        // 注册即持有 Agent 凭据：自动绑定
        if (reg.agent && reg.secret) {
          credentials.agent.set({ slug: reg.agent.slug, secret: reg.secret });
        }
      }

      credentials.ownerToken.set(result.token);
      setOwner(result.owner);
      toast(mode === "login" ? `欢迎回来，${result.owner.name}` : `注册成功，欢迎 ${result.owner.name}`, "success");

      // 新注册：直接去配置助理能力（Agent 已就位）
      if (newAgentSlug) {
        navigate(`/factory?agent=${encodeURIComponent(newAgentSlug)}`, { replace: true });
        return;
      }
      const from = (location.state as LocationState | null)?.from?.pathname ?? "/buddy";
      navigate(from, { replace: true });
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "操作失败", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: "var(--sp-12) auto" }}>
      <div className="card" style={{ padding: "var(--sp-6)" }}>
        <h2 className="section-title">主人账号</h2>
        <p className="section-desc">
          登录后可使用虚拟伙伴对话、管理名下 Agent；Agent 侧功能无需登录，凭密钥签名即可
        </p>

        {/* 模式切换 */}
        <div className="row" style={{ gap: "var(--sp-2)", marginBottom: "var(--sp-5)" }}>
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`btn btn-sm ${mode === m ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setMode(m)}
            >
              {m === "login" ? "登录" : "注册新账号"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} noValidate>
          {mode === "register" && (
            <>
              <div className="field">
                <label className="field-label" htmlFor="login-name">
                  姓名 *
                </label>
                <input
                  id="login-name"
                  className="input"
                  value={form.name}
                  onChange={set("name")}
                  autoComplete="name"
                  maxLength={40}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="login-org">
                  组织 / 公司 *
                </label>
                <input
                  id="login-org"
                  className="input"
                  value={form.org}
                  onChange={set("org")}
                  autoComplete="organization"
                  maxLength={80}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="login-title">
                  职位
                </label>
                <input id="login-title" className="input" value={form.title} onChange={set("title")} maxLength={40} />
              </div>

              {/* 注册一体化：同步创建首个 Agent */}
              <div style={{ borderTop: "1px solid var(--line, #e6eaf2)", margin: "var(--sp-2) 0 var(--sp-4)", paddingTop: "var(--sp-3)" }}>
                <p className="field-hint" style={{ marginTop: 0 }}>
                  🤖 同时创建你的第一个 Agent（注册后可继续在「创建助理」配置它的客服/销售能力）
                </p>
                <div className="field">
                  <label className="field-label" htmlFor="login-agent-name">Agent 名称 *</label>
                  <input
                    id="login-agent-name"
                    className="input"
                    value={agentForm.name}
                    onChange={setAgent("name")}
                    placeholder="例：小帆智能助理"
                    maxLength={50}
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="login-agent-role">一句话定位 *</label>
                  <input
                    id="login-agent-role"
                    className="input"
                    value={agentForm.role}
                    onChange={setAgent("role")}
                    placeholder="例：云帆制造的全能助理"
                    maxLength={120}
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="login-agent-industry">行业</label>
                  <input
                    id="login-agent-industry"
                    className="input"
                    value={agentForm.industry}
                    onChange={setAgent("industry")}
                    maxLength={30}
                  />
                </div>
              </div>
            </>
          )}

          <div className="field">
            <label className="field-label" htmlFor="login-email">
              邮箱 *
            </label>
            <input
              id="login-email"
              className="input"
              type="email"
              value={form.email}
              onChange={set("email")}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="login-password">
              口令 *
            </label>
            <input
              id="login-password"
              className="input"
              type="password"
              value={form.password}
              onChange={set("password")}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="至少 8 位"
            />
            <span className="field-hint">口令以 scrypt 摘要存储，平台不保存明文</span>
          </div>

          <button className="btn btn-primary" type="submit" disabled={!valid || submitting} style={{ width: "100%" }}>
            {submitting ? "处理中…" : mode === "login" ? "登录" : "注册并登录"}
          </button>
        </form>
      </div>
    </div>
  );
}
