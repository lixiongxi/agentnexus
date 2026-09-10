import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { assistantsApi, type FaqEntryPayload, type ProductEntryPayload } from "@/lib/endpoints";
import { credentials } from "@/lib/api";
import { useToast } from "@/providers/toast";

/**
 * 创建企业助理：把交付套件的「填两个文件」变成界面表单。
 * 分节填写基础信息 → 能力开关 → FAQ 知识库 → 产品库 → 秘书规则 → 一键创建，
 * 创建成功后平台即对该 Agent 的所有来消息自动应答（无需任何外部进程）。
 */

interface FaqDraft {
  keywords: string;
  answer: string;
}

interface ProductDraft {
  name: string;
  keywords: string;
  pitch: string;
  priceRange: string;
  followup: string;
}

const EMOJI_CHOICES = ["🗂️", "🤖", "💼", "🎧", "🧭", "📊", "🚀", "🛠️"];

export function FactoryPage() {
  const toast = useToast();

  /* ---------------- 表单状态 ---------------- */
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [emoji, setEmoji] = useState("🗂️");
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");
  const [industry, setIndustry] = useState("企业服务");
  const [tags, setTags] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerOrg, setOwnerOrg] = useState("");

  const [caps, setCaps] = useState({ secretary: true, sales: true, ticket: true });

  const [faq, setFaq] = useState<FaqDraft[]>([{ keywords: "", answer: "" }]);
  const [products, setProducts] = useState<ProductDraft[]>([{ name: "", keywords: "", pitch: "", priceRange: "", followup: "" }]);

  const [bookable, setBookable] = useState("产品演示会议, 售后上门服务");
  const [workStart, setWorkStart] = useState("09:00");
  const [workEnd, setWorkEnd] = useState("18:00");

  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ slug: string; secret: string; name: string } | null>(null);

  const valid = useMemo(
    () =>
      name.trim().length > 0 &&
      role.trim().length > 0 &&
      ownerName.trim().length > 0 &&
      ownerOrg.trim().length > 0 &&
      (slug.trim().length === 0 || /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug.trim())),
    [name, role, ownerName, ownerOrg, slug],
  );

  /* ---------------- 动态条目操作 ---------------- */
  const addFaq = () => setFaq((f) => [...f, { keywords: "", answer: "" }]);
  const addProduct = () => setProducts((p) => [...p, { name: "", keywords: "", pitch: "", priceRange: "", followup: "" }]);

  const parseKeywords = (raw: string): string[] =>
    raw.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);

  /* ---------------- 提交 ---------------- */
  const submit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      const faqPayload: FaqEntryPayload[] = faq
        .map((f) => ({ keywords: parseKeywords(f.keywords), answer: f.answer.trim() }))
        .filter((f) => f.keywords.length > 0 && f.answer);

      const productsPayload: ProductEntryPayload[] = products
        .map((p) => ({
          name: p.name.trim(),
          keywords: parseKeywords(p.keywords),
          pitch: p.pitch.trim(),
          priceRange: p.priceRange.trim(),
          followup: p.followup.trim(),
        }))
        .filter((p) => p.name && p.keywords.length > 0);

      const result = await assistantsApi.create({
        slug: slug.trim() || undefined,
        name: name.trim(),
        emoji,
        role: role.trim(),
        description: description.trim(),
        industry: industry.trim() || "企业服务",
        tags: parseKeywords(tags),
        autoAccept: true,
        owner: { name: ownerName.trim(), org: ownerOrg.trim() },
        profile: {
          capabilities: caps,
          faq: faqPayload,
          products: productsPayload,
          secretary: { bookable: parseKeywords(bookable), workHours: { start: workStart, end: workEnd } },
        },
      });

      // 保存凭据：本页可直接继续编辑该助理（签名自动注入）
      credentials.agent.set({ slug: result.agent.slug, secret: result.secret });
      setCreated({ slug: result.agent.slug, secret: result.secret, name: result.agent.name });
      toast(`企业助理「${result.agent.name}」创建成功`, "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "创建失败", "error");
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------------- 成功页 ---------------- */
  if (created) {
    return (
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <div className="card" style={{ padding: "var(--sp-6)", textAlign: "center" }}>
          <div style={{ fontSize: 44, marginBottom: "var(--sp-3)" }}>{emoji}</div>
          <h2 className="section-title">「{created.name}」已上线广场</h2>
          <p className="section-desc">
            助理标识：<code>{created.slug}</code> · 平台将自动应答发来的消息（FAQ / 预约 / 报价 / 工单 / 转人工）
          </p>

          <div className="card" style={{ margin: "var(--sp-4) 0", textAlign: "left", background: "#fff8e6", borderColor: "#f0d896" }}>
            <p style={{ fontSize: 13, marginBottom: "var(--sp-2)" }}>
              <b>⚠️ 请立即保存签名密钥（仅此一次显示）：</b>
            </p>
            <code style={{ wordBreak: "break-all", fontSize: 12 }}>{created.secret}</code>
            <p className="field-hint" style={{ marginTop: "var(--sp-2)" }}>
              本页面已自动保存到本机，可继续在下方编辑配置；更换浏览器后需凭密钥恢复。
            </p>
          </div>

          <div className="row" style={{ gap: "var(--sp-3)", justifyContent: "center", flexWrap: "wrap" }}>
            <Link className="btn btn-primary" to="/">
              去广场查看
            </Link>
            <a className="btn btn-ghost" href={`/api/agents/${created.slug}/agent-card.json`} target="_blank" rel="noreferrer">
              查看签名名片
            </a>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setCreated(null);
                setName("");
                setSlug("");
                setRole("");
                setDescription("");
                setTags("");
              }}
            >
              再创建一个
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- 创建表单 ---------------- */
  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div style={{ marginBottom: "var(--sp-5)" }}>
        <h2 className="section-title" style={{ fontSize: 20 }}>
          🏭 创建企业助理
        </h2>
        <p className="section-desc">
          像秘书（会议预约 / 提醒）+ 像客服（FAQ / 工单 / 转人工）+ 像销售（产品推荐 / 报价 / 线索登记）。
          填完即创建：平台自动应答所有发来的消息，无需部署任何程序。
        </p>
      </div>

      {/* ① 基础信息 */}
      <div className="card" style={{ padding: "var(--sp-5)", marginBottom: "var(--sp-4)" }}>
        <h3 className="section-title">① 基础信息</h3>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "var(--sp-4)" }}>
          <div className="field">
            <label className="field-label" htmlFor="f-name">助理名称 *</label>
            <input id="f-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例：小帆智能助理" maxLength={50} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="f-slug">标识 slug（留空自动生成）</label>
            <input id="f-slug" className="input" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="例：acme-assistant" maxLength={40} />
          </div>
        </div>
        <div className="field">
          <label className="field-label">形象</label>
          <div className="row" style={{ gap: "var(--sp-2)", flexWrap: "wrap" }}>
            {EMOJI_CHOICES.map((e) => (
              <button
                key={e}
                type="button"
                className={`btn ${emoji === e ? "btn-primary" : "btn-ghost"} btn-sm`}
                onClick={() => setEmoji(e)}
                aria-pressed={emoji === e}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="f-role">一句话定位 *</label>
          <input id="f-role" className="input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="例：阿克米制造的全能助理" maxLength={120} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="f-desc">详细介绍（可选）</label>
          <textarea id="f-desc" className="textarea" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="会展示在广场卡片与 Agent 名片上" maxLength={500} />
        </div>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--sp-4)" }}>
          <div className="field">
            <label className="field-label" htmlFor="f-industry">行业</label>
            <input id="f-industry" className="input" value={industry} onChange={(e) => setIndustry(e.target.value)} maxLength={30} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="f-tags">能力标签（逗号分隔）</label>
            <input id="f-tags" className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="智能客服, 会议预约, 线索登记" maxLength={120} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="f-org">企业名称 *</label>
            <input id="f-org" className="input" value={ownerOrg} onChange={(e) => setOwnerOrg(e.target.value)} maxLength={60} />
          </div>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="f-owner">负责人姓名 *</label>
          <input id="f-owner" className="input" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} maxLength={30} />
        </div>
      </div>

      {/* ② 能力开关 */}
      <div className="card" style={{ padding: "var(--sp-5)", marginBottom: "var(--sp-4)" }}>
        <h3 className="section-title">② 能力开关</h3>
        <p className="section-desc">关闭的能力对应问题会转入兜底话术</p>
        <div className="row" style={{ gap: "var(--sp-2)", flexWrap: "wrap" }}>
          {(
            [
              ["secretary", "🗓️ 秘书（预约/提醒）"],
              ["sales", "🤝 销售（推荐/报价/线索）"],
              ["ticket", "🎫 客服（工单/转人工）"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`btn ${caps[key] ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setCaps((c) => ({ ...c, [key]: !c[key] }))}
              aria-pressed={caps[key]}
            >
              {caps[key] ? "✓ " : ""}
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ③ FAQ 知识库 */}
      <div className="card" style={{ padding: "var(--sp-5)", marginBottom: "var(--sp-4)" }}>
        <div className="row-between">
          <h3 className="section-title">③ FAQ 知识库（客服）</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addFaq}>
            + 添加一条
          </button>
        </div>
        {faq.map((f, i) => (
          <div key={i} className="card" style={{ padding: "var(--sp-3)", marginBottom: "var(--sp-3)", background: "#fbfcfe" }}>
            <div className="field">
              <label className="field-label" htmlFor={`f-faq-kw-${i}`}>触发关键词（逗号分隔）</label>
              <input
                id={`f-faq-kw-${i}`}
                className="input"
                value={f.keywords}
                onChange={(e) => setFaq((arr) => arr.map((x, j) => (j === i ? { ...x, keywords: e.target.value } : x)))}
                placeholder="例：退货, 退款, 退换"
                maxLength={120}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor={`f-faq-ans-${i}`}>标准答案</label>
              <textarea
                id={`f-faq-ans-${i}`}
                className="textarea"
                rows={2}
                value={f.answer}
                onChange={(e) => setFaq((arr) => arr.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))}
                placeholder="例：自签收之日起 7 天内可无理由退货…"
                maxLength={2000}
              />
            </div>
            {faq.length > 1 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFaq((arr) => arr.filter((_, j) => j !== i))}>
                删除本条
              </button>
            )}
          </div>
        ))}
      </div>

      {/* ④ 产品库 */}
      {caps.sales && (
        <div className="card" style={{ padding: "var(--sp-5)", marginBottom: "var(--sp-4)" }}>
          <div className="row-between">
            <h3 className="section-title">④ 产品与报价库（销售）</h3>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addProduct}>
              + 添加一个产品
            </button>
          </div>
          {products.map((p, i) => (
            <div key={i} className="card" style={{ padding: "var(--sp-3)", marginBottom: "var(--sp-3)", background: "#fbfcfe" }}>
              <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "var(--sp-3)" }}>
                <div className="field">
                  <label className="field-label" htmlFor={`f-p-name-${i}`}>产品名称</label>
                  <input
                    id={`f-p-name-${i}`}
                    className="input"
                    value={p.name}
                    onChange={(e) => setProducts((arr) => arr.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    placeholder="例：智能会议屏 V5"
                    maxLength={50}
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor={`f-p-kw-${i}`}>触发关键词（逗号分隔）</label>
                  <input
                    id={`f-p-kw-${i}`}
                    className="input"
                    value={p.keywords}
                    onChange={(e) => setProducts((arr) => arr.map((x, j) => (j === i ? { ...x, keywords: e.target.value } : x)))}
                    placeholder="例：会议屏, 大屏"
                    maxLength={120}
                  />
                </div>
              </div>
              <div className="field">
                <label className="field-label" htmlFor={`f-p-pitch-${i}`}>一句话卖点</label>
                <input
                  id={`f-p-pitch-${i}`}
                  className="input"
                  value={p.pitch}
                  onChange={(e) => setProducts((arr) => arr.map((x, j) => (j === i ? { ...x, pitch: e.target.value } : x)))}
                  maxLength={500}
                />
              </div>
              <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "var(--sp-3)" }}>
                <div className="field">
                  <label className="field-label" htmlFor={`f-p-price-${i}`}>参考报价</label>
                  <input
                    id={`f-p-price-${i}`}
                    className="input"
                    value={p.priceRange}
                    onChange={(e) => setProducts((arr) => arr.map((x, j) => (j === i ? { ...x, priceRange: e.target.value } : x)))}
                    placeholder="例：¥8,999 起"
                    maxLength={100}
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor={`f-p-follow-${i}`}>追问话术（可选）</label>
                  <input
                    id={`f-p-follow-${i}`}
                    className="input"
                    value={p.followup}
                    onChange={(e) => setProducts((arr) => arr.map((x, j) => (j === i ? { ...x, followup: e.target.value } : x)))}
                    placeholder="例：会议室多大？"
                    maxLength={300}
                  />
                </div>
              </div>
              {products.length > 1 && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setProducts((arr) => arr.filter((_, j) => j !== i))}>
                  删除本条
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ⑤ 秘书规则 */}
      {caps.secretary && (
        <div className="card" style={{ padding: "var(--sp-5)", marginBottom: "var(--sp-5)" }}>
          <h3 className="section-title">⑤ 秘书规则</h3>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "var(--sp-4)" }}>
            <div className="field">
              <label className="field-label" htmlFor="f-start">工作时间开始</label>
              <input id="f-start" className="input" value={workStart} onChange={(e) => setWorkStart(e.target.value)} maxLength={5} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="f-end">工作时间结束</label>
              <input id="f-end" className="input" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} maxLength={5} />
            </div>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="f-bookable">可预约事项（逗号分隔）</label>
            <input id="f-bookable" className="input" value={bookable} onChange={(e) => setBookable(e.target.value)} maxLength={200} />
          </div>
          <p className="field-hint">预约与提醒默认生成日程编号回执（mock）；接入真实日历系统见 docs/A2A-GUIDE.md 与套件文档。</p>
        </div>
      )}

      {/* 提交 */}
      <div className="card" style={{ padding: "var(--sp-5)", display: "flex", alignItems: "center", gap: "var(--sp-4)", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <b>{valid ? "表单已就绪" : "请补齐带 * 的必填项"}</b>
          <p className="field-hint" style={{ margin: 0 }}>
            创建后即可在广场被检索，平台自动应答；密钥仅显示一次。
          </p>
        </div>
        <button type="button" className="btn btn-primary" disabled={!valid || submitting} onClick={submit}>
          {submitting ? "创建中…" : "🚀 创建企业助理"}
        </button>
      </div>
    </div>
  );
}
