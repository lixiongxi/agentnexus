import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { assistantsApi, authApi, type FaqEntryPayload, type ProductEntryPayload } from "@/lib/endpoints";
import { credentials } from "@/lib/api";
import { useSession } from "@/providers/session";
import { useToast } from "@/providers/toast";

/**
 * 助理配置器（二期改版）：
 *   - 登录主人 / 已绑定 Agent：为「名下已有 Agent」配置助理能力（FAQ/产品/秘书）——
 *     助理是 Agent 的衍生能力，不再需要单独创建
 *   - 访客：保留一次性快速创建（无账号体验通道，POST /api/assistants）
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

const parseKeywords = (raw: string): string[] => raw.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);

export function FactoryPage() {
  const { owner } = useSession();
  const [params] = useSearchParams();
  const agentParam = params.get("agent");

  const [mode, setMode] = useState<"loading" | "configure" | "guest">("loading");
  const [myAgents, setMyAgents] = useState<{ slug: string; name: string; emoji: string }[]>([]);
  const [selected, setSelected] = useState<string>(agentParam ?? "");

  useEffect(() => {
    const determine = async () => {
      // 主人登录 → 拉名下 Agent 列表，进配置器
      if (owner) {
        try {
          const r = await authApi.myAgents();
          if (r.items.length > 0) {
            setMyAgents(r.items.map((a) => ({ slug: a.slug, name: a.name, emoji: a.emoji })));
            const pick =
              agentParam && r.items.some((i) => i.slug === agentParam) ? agentParam : r.items[0]!.slug;
            setSelected(pick);
            setMode("configure");
            return;
          }
        } catch {
          /* 拉取失败走访客模式 */
        }
      }
      // 未登录但 URL 指定了 agent 且与本地绑定一致 → 也可配置（签名鉴权）
      const bound = credentials.agent.get();
      if (agentParam && bound?.slug === agentParam) {
        setMyAgents([{ slug: bound.slug, name: bound.slug, emoji: "🤖" }]);
        setSelected(agentParam);
        setMode("configure");
        return;
      }
      setMode("guest");
    };
    void determine();
  }, [owner, agentParam]);

  if (mode === "loading") {
    return (
      <div style={{ maxWidth: 760, margin: "var(--sp-8) auto" }}>
        <div className="card" style={{ padding: "var(--sp-6)" }}>
          <div className="skeleton" style={{ height: 80 }} />
        </div>
      </div>
    );
  }

  if (mode === "configure" && selected) {
    return <ConfiguratorView myAgents={myAgents} selected={selected} onSelect={(s) => { setSelected(s); }} />;
  }

  return <GuestCreateView />;
}

/* ================= 配置器：为已有 Agent 配置助理能力 ================= */

function ConfiguratorView({
  myAgents,
  selected,
  onSelect,
}: {
  myAgents: { slug: string; name: string; emoji: string }[];
  selected: string;
  onSelect: (slug: string) => void;
}) {
  const toast = useToast();

  const [caps, setCaps] = useState({ secretary: true, sales: true, ticket: true });
  const [faq, setFaq] = useState<FaqDraft[]>([{ keywords: "", answer: "" }]);
  const [products, setProducts] = useState<ProductDraft[]>([{ name: "", keywords: "", pitch: "", priceRange: "", followup: "" }]);
  const [bookable, setBookable] = useState("产品演示会议, 售后上门服务");
  const [workStart, setWorkStart] = useState("09:00");
  const [workEnd, setWorkEnd] = useState("18:00");

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);

  // 加载所选 Agent 的现有配置（无配置 = 全新表单）
  useEffect(() => {
    let cancelled = false;
    setLoadingProfile(true);
    setSavedSlug(null);
    assistantsApi
      .detail(selected)
      .then((view) => {
        if (cancelled) return;
        setCaps({ ...view.profile.capabilities });
        setFaq(
          view.profile.faq.length > 0
            ? view.profile.faq.map((f) => ({ keywords: f.keywords.join(", "), answer: f.answer }))
            : [{ keywords: "", answer: "" }],
        );
        setProducts(
          view.profile.products.length > 0
            ? view.profile.products.map((p) => ({
                name: p.name,
                keywords: p.keywords.join(", "),
                pitch: p.pitch,
                priceRange: p.priceRange,
                followup: p.followup,
              }))
            : [{ name: "", keywords: "", pitch: "", priceRange: "", followup: "" }],
        );
        const secretary = view.profile.secretary as { bookable?: string[]; workHours?: { start: string; end: string } };
        if (secretary.bookable?.length) setBookable(secretary.bookable.join(", "));
        if (secretary.workHours) {
          setWorkStart(secretary.workHours.start);
          setWorkEnd(secretary.workHours.end);
        }
      })
      .catch(() => {
        // 首次配置：重置为默认
        setCaps({ secretary: true, sales: true, ticket: true });
        setFaq([{ keywords: "", answer: "" }]);
        setProducts([{ name: "", keywords: "", pitch: "", priceRange: "", followup: "" }]);
      })
      .finally(() => {
        if (!cancelled) setLoadingProfile(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const buildProfile = () => ({
    capabilities: caps,
    faq: faq
      .map((f) => ({ keywords: parseKeywords(f.keywords), answer: f.answer.trim() }))
      .filter((f) => f.keywords.length > 0 && f.answer),
    products: products
      .map((p) => ({
        name: p.name.trim(),
        keywords: parseKeywords(p.keywords),
        pitch: p.pitch.trim(),
        priceRange: p.priceRange.trim(),
        followup: p.followup.trim(),
      }))
      .filter((p) => p.name && p.keywords.length > 0),
    secretary: { bookable: parseKeywords(bookable), workHours: { start: workStart, end: workEnd } },
  });

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await assistantsApi.update(selected, buildProfile());
      setSavedSlug(selected);
      toast(`「${selected}」的助理能力已保存，即刻生效`, "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "保存失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const current = myAgents.find((a) => a.slug === selected);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div style={{ marginBottom: "var(--sp-5)" }}>
        <h2 className="section-title" style={{ fontSize: 20, margin: 0 }}>
          🧩 助理能力配置
        </h2>
        <p className="section-desc">
          为你的 Agent 配置助理大脑：像秘书（预约/提醒）+ 像客服（FAQ/工单/转人工）+ 像销售（推荐/报价/线索）。
          保存即生效——平台自动应答发来的消息。
        </p>
      </div>

      {/* Agent 选择 */}
      <div className="card" style={{ padding: "var(--sp-4)", marginBottom: "var(--sp-4)" }}>
        <label className="field-label" htmlFor="cfg-agent">选择要配置的 Agent</label>
        {myAgents.length <= 1 ? (
          <b style={{ fontSize: 14 }}>
            {current?.emoji} {current?.name} <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>({selected})</span>
          </b>
        ) : (
          <select id="cfg-agent" className="select" value={selected} onChange={(e) => onSelect(e.target.value)}>
            {myAgents.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.emoji} {a.name}（{a.slug}）
              </option>
            ))}
          </select>
        )}
      </div>

      {loadingProfile ? (
        <div className="card" style={{ padding: "var(--sp-6)" }}>
          <div className="skeleton" style={{ height: 120 }} />
        </div>
      ) : (
        <>
          {/* 能力开关 */}
          <div className="card" style={{ padding: "var(--sp-5)", marginBottom: "var(--sp-4)" }}>
            <h3 className="section-title">能力开关</h3>
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

          {/* FAQ */}
          <div className="card" style={{ padding: "var(--sp-5)", marginBottom: "var(--sp-4)" }}>
            <div className="row-between">
              <h3 className="section-title">FAQ 知识库</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFaq((f) => [...f, { keywords: "", answer: "" }])}>
                + 添加一条
              </button>
            </div>
            {faq.map((f, i) => (
              <div key={i} className="card" style={{ padding: "var(--sp-3)", marginBottom: "var(--sp-3)", background: "#fbfcfe" }}>
                <div className="field">
                  <label className="field-label" htmlFor={`cfg-faq-kw-${i}`}>触发关键词（逗号分隔）</label>
                  <input
                    id={`cfg-faq-kw-${i}`}
                    className="input"
                    value={f.keywords}
                    onChange={(e) => setFaq((arr) => arr.map((x, j) => (j === i ? { ...x, keywords: e.target.value } : x)))}
                    placeholder="例：退货, 退款"
                    maxLength={120}
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor={`cfg-faq-ans-${i}`}>标准答案</label>
                  <textarea
                    id={`cfg-faq-ans-${i}`}
                    className="textarea"
                    rows={2}
                    value={f.answer}
                    onChange={(e) => setFaq((arr) => arr.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))}
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

          {/* 产品库 */}
          {caps.sales && (
            <div className="card" style={{ padding: "var(--sp-5)", marginBottom: "var(--sp-4)" }}>
              <div className="row-between">
                <h3 className="section-title">产品与报价库</h3>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setProducts((p) => [...p, { name: "", keywords: "", pitch: "", priceRange: "", followup: "" }])}>
                  + 添加一个产品
                </button>
              </div>
              {products.map((p, i) => (
                <div key={i} className="card" style={{ padding: "var(--sp-3)", marginBottom: "var(--sp-3)", background: "#fbfcfe" }}>
                  <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "var(--sp-3)" }}>
                    <div className="field">
                      <label className="field-label" htmlFor={`cfg-p-name-${i}`}>产品名称</label>
                      <input id={`cfg-p-name-${i}`} className="input" value={p.name} onChange={(e) => setProducts((arr) => arr.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} maxLength={50} />
                    </div>
                    <div className="field">
                      <label className="field-label" htmlFor={`cfg-p-kw-${i}`}>触发关键词</label>
                      <input id={`cfg-p-kw-${i}`} className="input" value={p.keywords} onChange={(e) => setProducts((arr) => arr.map((x, j) => (j === i ? { ...x, keywords: e.target.value } : x)))} maxLength={120} />
                    </div>
                  </div>
                  <div className="field">
                    <label className="field-label" htmlFor={`cfg-p-pitch-${i}`}>一句话卖点</label>
                    <input id={`cfg-p-pitch-${i}`} className="input" value={p.pitch} onChange={(e) => setProducts((arr) => arr.map((x, j) => (j === i ? { ...x, pitch: e.target.value } : x)))} maxLength={500} />
                  </div>
                  <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "var(--sp-3)" }}>
                    <div className="field">
                      <label className="field-label" htmlFor={`cfg-p-price-${i}`}>参考报价</label>
                      <input id={`cfg-p-price-${i}`} className="input" value={p.priceRange} onChange={(e) => setProducts((arr) => arr.map((x, j) => (j === i ? { ...x, priceRange: e.target.value } : x)))} maxLength={100} />
                    </div>
                    <div className="field">
                      <label className="field-label" htmlFor={`cfg-p-follow-${i}`}>追问话术</label>
                      <input id={`cfg-p-follow-${i}`} className="input" value={p.followup} onChange={(e) => setProducts((arr) => arr.map((x, j) => (j === i ? { ...x, followup: e.target.value } : x)))} maxLength={300} />
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

          {/* 秘书规则 */}
          {caps.secretary && (
            <div className="card" style={{ padding: "var(--sp-5)", marginBottom: "var(--sp-5)" }}>
              <h3 className="section-title">秘书规则</h3>
              <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "var(--sp-4)" }}>
                <div className="field">
                  <label className="field-label" htmlFor="cfg-start">工作时间开始</label>
                  <input id="cfg-start" className="input" value={workStart} onChange={(e) => setWorkStart(e.target.value)} maxLength={5} />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="cfg-end">工作时间结束</label>
                  <input id="cfg-end" className="input" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} maxLength={5} />
                </div>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="cfg-bookable">可预约事项（逗号分隔）</label>
                <input id="cfg-bookable" className="input" value={bookable} onChange={(e) => setBookable(e.target.value)} maxLength={200} />
              </div>
            </div>
          )}

          <div className="card" style={{ padding: "var(--sp-5)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-4)", flexWrap: "wrap" }}>
            <div>
              <b>{savedSlug === selected ? "✅ 已保存，配置即刻生效" : "修改后点击保存"}</b>
              <p className="field-hint" style={{ margin: 0 }}>
                配置即时生效：发往该 Agent 的消息将按此知识库自动应答。
              </p>
            </div>
            <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>
              {saving ? "保存中…" : "💾 保存配置"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ================= 访客快速创建（无账号体验通道，保留） ================= */

function GuestCreateView() {
  const toast = useToast();

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

      credentials.agent.set({ slug: result.agent.slug, secret: result.secret });
      setCreated({ slug: result.agent.slug, secret: result.secret, name: result.agent.name });
      toast(`企业助理「${result.agent.name}」创建成功`, "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "创建失败", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (created) {
    return (
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <div className="card" style={{ padding: "var(--sp-6)", textAlign: "center" }}>
          <div style={{ fontSize: 44, marginBottom: "var(--sp-3)" }}>{emoji}</div>
          <h2 className="section-title">「{created.name}」已上线广场</h2>
          <p className="section-desc">
            助理标识：<code>{created.slug}</code> · 平台将自动应答发来的消息。
          </p>
          <div className="card" style={{ margin: "var(--sp-4) 0", textAlign: "left", background: "#fff8e6", borderColor: "#f0d896" }}>
            <p style={{ fontSize: 13, marginBottom: "var(--sp-2)" }}>
              <b>⚠️ 请立即保存签名密钥（仅此一次显示）：</b>
            </p>
            <code style={{ wordBreak: "break-all", fontSize: 12 }}>{created.secret}</code>
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

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div className="card" style={{ padding: "var(--sp-5)", marginBottom: "var(--sp-5)", background: "#f5f9ff", borderColor: "#c9d9ff" }}>
        <b style={{ fontSize: 14 }}>💡 提示：已有账号？</b>
        <p className="section-desc" style={{ margin: "var(--sp-1) 0 0" }}>
          登录后可为「名下任意 Agent」配置助理能力，无需重复填写企业信息。本页是免注册的快速体验通道。
        </p>
      </div>

      <div style={{ marginBottom: "var(--sp-5)" }}>
        <h2 className="section-title" style={{ fontSize: 20, margin: 0 }}>
          🏭 快速创建企业助理（免注册体验）
        </h2>
        <p className="section-desc">
          像秘书 + 像客服 + 像销售：填完即创建，平台自动应答所有发来的消息。
        </p>
      </div>

      {/* 基础信息 */}
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
          <textarea id="f-desc" className="textarea" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
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

      {/* 能力开关 */}
      <div className="card" style={{ padding: "var(--sp-5)", marginBottom: "var(--sp-4)" }}>
        <h3 className="section-title">② 能力开关</h3>
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

      {/* FAQ */}
      <div className="card" style={{ padding: "var(--sp-5)", marginBottom: "var(--sp-4)" }}>
        <div className="row-between">
          <h3 className="section-title">③ FAQ 知识库（客服）</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFaq((f) => [...f, { keywords: "", answer: "" }])}>
            + 添加一条
          </button>
        </div>
        {faq.map((f, i) => (
          <div key={i} className="card" style={{ padding: "var(--sp-3)", marginBottom: "var(--sp-3)", background: "#fbfcfe" }}>
            <div className="field">
              <label className="field-label" htmlFor={`g-faq-kw-${i}`}>触发关键词（逗号分隔）</label>
              <input
                id={`g-faq-kw-${i}`}
                className="input"
                value={f.keywords}
                onChange={(e) => setFaq((arr) => arr.map((x, j) => (j === i ? { ...x, keywords: e.target.value } : x)))}
                maxLength={120}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor={`g-faq-ans-${i}`}>标准答案</label>
              <textarea
                id={`g-faq-ans-${i}`}
                className="textarea"
                rows={2}
                value={f.answer}
                onChange={(e) => setFaq((arr) => arr.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))}
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

      {/* 产品库 */}
      {caps.sales && (
        <div className="card" style={{ padding: "var(--sp-5)", marginBottom: "var(--sp-4)" }}>
          <div className="row-between">
            <h3 className="section-title">④ 产品与报价库（销售）</h3>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setProducts((p) => [...p, { name: "", keywords: "", pitch: "", priceRange: "", followup: "" }])}>
              + 添加一个产品
            </button>
          </div>
          {products.map((p, i) => (
            <div key={i} className="card" style={{ padding: "var(--sp-3)", marginBottom: "var(--sp-3)", background: "#fbfcfe" }}>
              <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "var(--sp-3)" }}>
                <div className="field">
                  <label className="field-label" htmlFor={`g-p-name-${i}`}>产品名称</label>
                  <input id={`g-p-name-${i}`} className="input" value={p.name} onChange={(e) => setProducts((arr) => arr.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} maxLength={50} />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor={`g-p-kw-${i}`}>触发关键词</label>
                  <input id={`g-p-kw-${i}`} className="input" value={p.keywords} onChange={(e) => setProducts((arr) => arr.map((x, j) => (j === i ? { ...x, keywords: e.target.value } : x)))} maxLength={120} />
                </div>
              </div>
              <div className="field">
                <label className="field-label" htmlFor={`g-p-pitch-${i}`}>一句话卖点</label>
                <input id={`g-p-pitch-${i}`} className="input" value={p.pitch} onChange={(e) => setProducts((arr) => arr.map((x, j) => (j === i ? { ...x, pitch: e.target.value } : x)))} maxLength={500} />
              </div>
              <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "var(--sp-3)" }}>
                <div className="field">
                  <label className="field-label" htmlFor={`g-p-price-${i}`}>参考报价</label>
                  <input id={`g-p-price-${i}`} className="input" value={p.priceRange} onChange={(e) => setProducts((arr) => arr.map((x, j) => (j === i ? { ...x, priceRange: e.target.value } : x)))} maxLength={100} />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor={`g-p-follow-${i}`}>追问话术</label>
                  <input id={`g-p-follow-${i}`} className="input" value={p.followup} onChange={(e) => setProducts((arr) => arr.map((x, j) => (j === i ? { ...x, followup: e.target.value } : x)))} maxLength={300} />
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

      {/* 秘书规则 */}
      {caps.secretary && (
        <div className="card" style={{ padding: "var(--sp-5)", marginBottom: "var(--sp-5)" }}>
          <h3 className="section-title">⑤ 秘书规则</h3>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "var(--sp-4)" }}>
            <div className="field">
              <label className="field-label" htmlFor="g-start">工作时间开始</label>
              <input id="g-start" className="input" value={workStart} onChange={(e) => setWorkStart(e.target.value)} maxLength={5} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="g-end">工作时间结束</label>
              <input id="g-end" className="input" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} maxLength={5} />
            </div>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="g-bookable">可预约事项（逗号分隔）</label>
            <input id="g-bookable" className="input" value={bookable} onChange={(e) => setBookable(e.target.value)} maxLength={200} />
          </div>
        </div>
      )}

      <div className="card" style={{ padding: "var(--sp-5)", display: "flex", alignItems: "center", gap: "var(--sp-4)", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <b>{valid ? "表单已就绪" : "请补齐带 * 的必填项"}</b>
          <p className="field-hint" style={{ margin: 0 }}>
            创建后即可在广场被检索，平台自动应答；密钥仅显示一次。
          </p>
        </div>
        <button type="button" className="btn btn-primary" disabled={!valid || submitting} onClick={() => void submit()}>
          {submitting ? "创建中…" : "🚀 创建企业助理"}
        </button>
      </div>
    </div>
  );
}
