import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { credentials } from "@/lib/api";
import { personalApi, type ServiceItem } from "@/lib/personal-api";
import { useToast } from "@/providers/toast";

/**
 * 发布个人 Agent（个人端第二步）
 * 用「服务清单 + 能力标签 + 历史案例」描述我能为他人提供什么；
 * 发布后进入能力广场，并参与需求撮合（案例与能力决定推荐排序）。
 */

const PRESET_TAGS = [
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
];

const EMOJIS = ["🙋", "🎬", "🎨", "✍️", "🧠", "🎧", "📊", "💻", "🚀", "🧩"];

const emptyService = (): ServiceItem => ({
  title: "",
  tags: [],
  deliverable: "",
  priceRange: "",
  cycleDays: 3,
  intro: "",
});

interface CaseDraft {
  title: string;
  summary: string;
  tags: string[];
  rating: number;
}

const emptyCase = (): CaseDraft => ({ title: "", summary: "", tags: [], rating: 0 });

export function PublishAgentPage() {
  const toast = useToast();
  const navigate = useNavigate();

  const [slug, setSlug] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: "",
    emoji: "🙋",
    role: "",
    serviceIntro: "",
    acceptingOrders: true,
  });
  const [domains, setDomains] = useState<string[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([emptyService()]);
  const [cases, setCases] = useState<CaseDraft[]>([]);

  /* 载入当前 Agent 的既有能力（编辑模式） */
  useEffect(() => {
    const cred = credentials.agent.get();
    if (!cred) {
      toast("请先完成注册登记");
      navigate("/register", { replace: true });
      return;
    }
    setSlug(cred.slug);
    personalApi
      .ability(cred.slug)
      .then((p) => {
        setForm({
          name: p.agent.name,
          emoji: p.agent.emoji || "🙋",
          role: p.agent.role,
          serviceIntro: p.agent.serviceIntro,
          acceptingOrders: p.agent.acceptingOrders,
        });
        setDomains(p.agent.tags);
        if (p.services.length > 0) setServices(p.services);
        setCases(
          p.cases
            .filter((c) => c.source === "manual")
            .map((c) => ({ title: c.title, summary: c.summary, tags: c.tags, rating: c.rating })),
        );
      })
      .catch(() => {
        /* 新登记用户尚无能力数据，忽略 */
      })
      .finally(() => setLoading(false));
  }, [navigate, toast]);

  const toggleDomain = (t: string) =>
    setDomains((l) => (l.includes(t) ? l.filter((x) => x !== t) : l.length >= 6 ? l : [...l, t]));

  const patchService = (i: number, patch: Partial<ServiceItem>) =>
    setServices((list) => list.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const toggleServiceTag = (i: number, tag: string) =>
    setServices((list) =>
      list.map((s, idx) =>
        idx === i
          ? { ...s, tags: s.tags.includes(tag) ? s.tags.filter((t) => t !== tag) : [...s.tags, tag] }
          : s,
      ),
    );

  const patchCase = (i: number, patch: Partial<CaseDraft>) =>
    setCases((list) => list.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const valid =
    form.name.trim().length > 0 &&
    form.role.trim().length > 0 &&
    form.serviceIntro.trim().length > 0 &&
    domains.length > 0 &&
    services.some((s) => s.title.trim() && s.tags.length > 0);

  const submit = async (publish: boolean) => {
    if (!valid || submitting || !slug) return;
    setSubmitting(true);
    try {
      const cleanServices = services.filter((s) => s.title.trim() && s.tags.length > 0);
      const cleanCases = cases.filter((c) => c.title.trim());
      await personalApi.publishAbility(slug, {
        ...form,
        domains,
        services: cleanServices,
        cases: cleanCases.map((c) => ({
          title: c.title,
          summary: c.summary,
          tags: c.tags,
          rating: c.rating,
        })),
        publish,
      });
      toast(publish ? "发布成功，已进入能力广场并参与需求撮合" : "草稿已保存");
      navigate(publish ? `/card/${slug}` : "/mine");
    } catch (err) {
      toast(err instanceof Error ? err.message : "提交失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="page-narrow">
        <div className="card">加载中…</div>
      </div>
    );
  }

  return (
    <div className="page-narrow">
      <div className="card">
        <div className="section-title">🚀 发布个人 Agent</div>
        <div className="section-desc">
          描述你能为他人提供什么服务。发布后，当他人发布需求时，系统将依据你的
          <b>已完成案例</b>与<b>能力标签</b>进行排序推荐 —— 案例越多、口碑越好，越靠前。
        </div>

        {/* 基础信息 */}
        <div className="field">
          <label className="field-label">Agent 名称 *</label>
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="例如：小林 · AI 视频工作室"
            maxLength={30}
          />
        </div>

        <div className="field">
          <label className="field-label">头像</label>
          <div className="tag-picker">
            {EMOJIS.map((e) => (
              <button
                type="button"
                key={e}
                className={`tag-chip ${form.emoji === e ? "on" : ""}`}
                onClick={() => setForm((f) => ({ ...f, emoji: e }))}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label className="field-label">一句话定位 *</label>
          <input
            className="input"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            placeholder="例如：品牌短视频制作 / AI 口播视频"
            maxLength={60}
          />
        </div>

        <div className="field">
          <label className="field-label">我能提供什么 *（能力自述，将展示在名片与匹配结果中）</label>
          <textarea
            className="input"
            rows={4}
            value={form.serviceIntro}
            onChange={(e) => setForm((f) => ({ ...f, serviceIntro: e.target.value }))}
            placeholder="例如：承接 30-90 秒品牌短片与口播视频，含脚本、AI 生成素材、剪辑与字幕；48 小时出初稿，支持两次修改。"
            maxLength={600}
          />
        </div>

        <div className="field">
          <label className="field-label">能力标签 *（1-6 个，匹配的核心依据）</label>
          <div className="tag-picker">
            {PRESET_TAGS.map((t) => (
              <button
                type="button"
                key={t}
                className={`tag-chip ${domains.includes(t) ? "on" : ""}`}
                onClick={() => toggleDomain(t)}
              >
                {t}
              </button>
            ))}
            {domains
              .filter((d) => !PRESET_TAGS.includes(d))
              .map((d) => (
                <button type="button" key={d} className="tag-chip on" onClick={() => toggleDomain(d)}>
                  {d} ✕
                </button>
              ))}
          </div>
        </div>

        {/* 服务清单 */}
        <div className="field">
          <label className="field-label">服务清单 *（他人可据此直接下单）</label>
          {services.map((s, i) => (
            <div key={i} className="sub-card">
              <div className="row-between">
                <b>服务 {i + 1}</b>
                {services.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setServices((l) => l.filter((_, idx) => idx !== i))}
                  >
                    删除
                  </button>
                )}
              </div>
              <input
                className="input"
                value={s.title}
                onChange={(e) => patchService(i, { title: e.target.value })}
                placeholder="服务名称，如：60 秒品牌短片制作"
                maxLength={40}
              />
              <div className="tag-picker">
                {PRESET_TAGS.map((t) => (
                  <button
                    type="button"
                    key={t}
                    className={`tag-chip ${s.tags.includes(t) ? "on" : ""}`}
                    onClick={() => toggleServiceTag(i, t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="row" style={{ gap: 8 }}>
                <input
                  className="input"
                  value={s.deliverable}
                  onChange={(e) => patchService(i, { deliverable: e.target.value })}
                  placeholder="交付物，如：1 条 60s 成片 + 2 次修改"
                  maxLength={80}
                />
                <input
                  className="input"
                  value={s.priceRange}
                  onChange={(e) => patchService(i, { priceRange: e.target.value })}
                  placeholder="报价区间，如：800-2000 元"
                  maxLength={40}
                />
              </div>
              <div className="row" style={{ gap: 8 }}>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={365}
                  value={s.cycleDays}
                  onChange={(e) => patchService(i, { cycleDays: Number(e.target.value) })}
                  placeholder="交付周期（天）"
                />
                <input
                  className="input"
                  value={s.intro}
                  onChange={(e) => patchService(i, { intro: e.target.value })}
                  placeholder="补充说明（可选）"
                  maxLength={300}
                />
              </div>
            </div>
          ))}
          <button type="button" className="btn btn-ghost" onClick={() => setServices((l) => [...l, emptyService()])}>
            + 添加服务
          </button>
        </div>

        {/* 历史案例 */}
        <div className="field">
          <label className="field-label">历史案例（可选，可后补 —— 直接影响匹配排序）</label>
          {cases.map((c, i) => (
            <div key={i} className="sub-card">
              <div className="row-between">
                <b>案例 {i + 1}</b>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setCases((l) => l.filter((_, idx) => idx !== i))}
                >
                  删除
                </button>
              </div>
              <input
                className="input"
                value={c.title}
                onChange={(e) => patchCase(i, { title: e.target.value })}
                placeholder="案例标题，如：某茶饮品牌夏季新品短片"
                maxLength={60}
              />
              <input
                className="input"
                value={c.summary}
                onChange={(e) => patchCase(i, { summary: e.target.value })}
                placeholder="简述交付内容与结果"
                maxLength={300}
              />
              <div className="tag-picker">
                {PRESET_TAGS.map((t) => (
                  <button
                    type="button"
                    key={t}
                    className={`tag-chip ${c.tags.includes(t) ? "on" : ""}`}
                    onClick={() =>
                      patchCase(i, {
                        tags: c.tags.includes(t) ? c.tags.filter((x) => x !== t) : [...c.tags, t],
                      })
                    }
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button type="button" className="btn btn-ghost" onClick={() => setCases((l) => [...l, emptyCase()])}>
            + 补充历史案例
          </button>
        </div>

        <div className="field">
          <label className="field-label">
            <input
              type="checkbox"
              checked={form.acceptingOrders}
              onChange={(e) => setForm((f) => ({ ...f, acceptingOrders: e.target.checked }))}
            />{" "}
            对外接单（关闭后不参与需求匹配）
          </label>
        </div>

        <div className="row" style={{ gap: 10 }}>
          <button className="btn btn-primary" onClick={() => submit(true)} disabled={!valid || submitting}>
            {submitting ? "提交中…" : "发布到能力广场"}
          </button>
          <button className="btn btn-ghost" onClick={() => submit(false)} disabled={submitting}>
            保存草稿
          </button>
        </div>
      </div>
    </div>
  );
}
