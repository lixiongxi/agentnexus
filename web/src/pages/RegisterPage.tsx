import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { credentials } from "@/lib/api";
import { personalApi } from "@/lib/personal-api";
import { useSession } from "@/providers/session";
import { useToast } from "@/providers/toast";

/**
 * 注册登记（个人端第一步）
 * 个人向字段：昵称 / 邮箱 / 口令 / 城市 / 擅长领域 / 一句话简介
 * 提交成功 → 自动创建「草稿」Agent → 跳转「发布个人 Agent」页
 */

const PRESET_DOMAINS = [
  "AI 视频创作",
  "AI 图像设计",
  "文案策划",
  "Agent 开发",
  "数据分析",
  "翻译",
  "配音",
  "剪辑包装",
  "短视频运营",
  "平面设计",
  "编程开发",
  "法律咨询",
  "财税咨询",
  "市场调研",
];

export function RegisterPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { setOwner } = useSession();

  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", city: "", bio: "" });
  const [domains, setDomains] = useState<string[]>([]);
  const [customDomain, setCustomDomain] = useState("");

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const toggleDomain = (d: string) =>
    setDomains((list) => (list.includes(d) ? list.filter((x) => x !== d) : list.length >= 6 ? list : [...list, d]));

  const addCustomDomain = () => {
    const v = customDomain.trim();
    if (!v) return;
    if (!domains.includes(v) && domains.length < 6) setDomains((l) => [...l, v]);
    setCustomDomain("");
  };

  const valid =
    form.name.trim().length > 0 &&
    /.+@.+\..+/.test(form.email) &&
    form.password.length >= 8 &&
    domains.length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      const result = await personalApi.register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        city: form.city.trim(),
        bio: form.bio.trim(),
        domains,
      });

      // 写入本地凭据：主人令牌（管理）+ Agent 凭据（签名）
      credentials.ownerToken.set(result.token);
      credentials.agent.set({ slug: result.agent.slug, secret: result.agent.secret });
      setOwner({
        id: result.profile.id,
        name: result.profile.name,
        org: "",
        email: result.profile.email ?? "",
        title: "",
        role: "owner",
      });

      toast("登记成功，接下来发布你的 Agent 能力");
      navigate("/publish", { replace: true });
    } catch (err) {
      toast(err instanceof Error ? err.message : "登记失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-narrow">
      <div className="card">
        <div className="section-title">📝 注册登记</div>
        <div className="section-desc">
          填写基础信息完成登记后，下一步将发布你的个人 Agent，说明你能为他人提供哪些服务。
        </div>

        <form onSubmit={submit}>
          <div className="field">
            <label className="field-label">昵称 *</label>
            <input className="input" value={form.name} onChange={set("name")} placeholder="例如：小林" maxLength={30} />
          </div>

          <div className="field">
            <label className="field-label">邮箱 *</label>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={set("email")}
              placeholder="you@example.com"
            />
            <div className="field-hint">用于登录与订单通知，同一邮箱不可重复登记</div>
          </div>

          <div className="field">
            <label className="field-label">口令 *（至少 8 位）</label>
            <input
              className="input"
              type="password"
              value={form.password}
              onChange={set("password")}
              placeholder="••••••••"
            />
          </div>

          <div className="field">
            <label className="field-label">所在城市</label>
            <input className="input" value={form.city} onChange={set("city")} placeholder="例如：杭州" maxLength={30} />
          </div>

          <div className="field">
            <label className="field-label">擅长领域 *（选 1-6 个，将作为匹配依据）</label>
            <div className="tag-picker">
              {PRESET_DOMAINS.map((d) => (
                <button
                  type="button"
                  key={d}
                  className={`tag-chip ${domains.includes(d) ? "on" : ""}`}
                  onClick={() => toggleDomain(d)}
                >
                  {d}
                </button>
              ))}
              {domains
                .filter((d) => !PRESET_DOMAINS.includes(d))
                .map((d) => (
                  <button type="button" key={d} className="tag-chip on" onClick={() => toggleDomain(d)}>
                    {d} ✕
                  </button>
                ))}
            </div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <input
                className="input"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomDomain())}
                placeholder="自定义领域，回车添加"
                maxLength={20}
              />
              <button type="button" className="btn btn-ghost" onClick={addCustomDomain}>
                添加
              </button>
            </div>
          </div>

          <div className="field">
            <label className="field-label">一句话简介</label>
            <textarea
              className="input"
              rows={3}
              value={form.bio}
              onChange={set("bio")}
              placeholder="例如：5 年短视频经验，擅长 AI 辅助的口播与品牌短片制作"
              maxLength={200}
            />
          </div>

          <button className="btn btn-primary" type="submit" disabled={!valid || submitting}>
            {submitting ? "登记中…" : "完成登记，下一步发布 Agent →"}
          </button>

          <div className="field-hint" style={{ marginTop: 10 }}>
            已有账号？<a href="/login">前往登录</a>
          </div>
        </form>
      </div>
    </div>
  );
}
