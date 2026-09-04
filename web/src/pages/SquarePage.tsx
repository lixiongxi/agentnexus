import { useCallback, useEffect, useState } from "react";
import { AgentCard } from "@/components/AgentCard";
import { AgentRegisterModal } from "@/components/AgentRegisterModal";
import { SearchIcon } from "@/components/icons";
import { agentsApi } from "@/lib/endpoints";
import { useToast } from "@/providers/toast";
import type { AgentView } from "@/types/api";

/** 广场：Agent 发现与检索 */

interface Filters {
  q: string;
  tag: string;
  industry: string;
  onlineOnly: boolean;
  page: number;
}

const PAGE_SIZE = 12;

export function SquarePage() {
  const toast = useToast();
  const [filters, setFilters] = useState<Filters>({ q: "", tag: "", industry: "", onlineOnly: false, page: 1 });
  const [items, setItems] = useState<AgentView[]>([]);
  const [total, setTotal] = useState(0);
  const [topTags, setTopTags] = useState<{ name: string; count: number }[]>([]);
  const [industries, setIndustries] = useState<{ name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const paged = await agentsApi.list({
        q: filters.q || undefined,
        tag: filters.tag || undefined,
        industry: filters.industry || undefined,
        online: filters.onlineOnly ? true : undefined,
        page: filters.page,
        pageSize: PAGE_SIZE,
      });
      setItems(paged.items);
      setTotal(paged.total);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "加载失败", "error");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q, filters.tag, filters.industry, filters.onlineOnly, filters.page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    agentsApi
      .topTags(12)
      .then(setTopTags)
      .catch(() => setTopTags([]));
    agentsApi
      .industries()
      .then(setIndustries)
      .catch(() => setIndustries([]));
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="row-between" style={{ marginBottom: "var(--sp-5)", flexWrap: "wrap", gap: "var(--sp-3)" }}>
        <div>
          <h2 className="section-title" style={{ marginBottom: 0 }}>
            Agent 广场
          </h2>
          <p className="section-desc" style={{ marginBottom: 0 }}>
            发现平台上的智能体，按能力与行业检索，一键建立对接
          </p>
        </div>
        <div className="row" style={{ gap: "var(--sp-2)" }}>
          <button className="btn btn-primary" onClick={() => setShowRegister(true)}>
            + 注册 Agent
          </button>
          <label className="row" style={{ gap: "var(--sp-2)", fontSize: "var(--fs-sm)", color: "var(--ink-2)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={filters.onlineOnly}
              onChange={(e) => setFilters((f) => ({ ...f, onlineOnly: e.target.checked, page: 1 }))}
            />
            仅在线
          </label>
          <div className="row" style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 10, color: "var(--ink-3)", display: "flex" }}>
              <SearchIcon />
            </span>
            <input
              className="input"
              style={{ paddingLeft: 32, width: 240 }}
              placeholder="搜索名称 / 定位 / 行业"
              aria-label="搜索 Agent"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value, page: 1 }))}
            />
          </div>
        </div>
      </div>

      {/* 标签筛选 */}
      {topTags.length > 0 && (
        <div className="row" style={{ gap: "var(--sp-2)", flexWrap: "wrap", marginBottom: "var(--sp-4)" }}>
          <button
            className={`tag ${!filters.tag ? "badge-brand" : ""}`}
            style={{ border: "none", cursor: "pointer" }}
            onClick={() => setFilters((f) => ({ ...f, tag: "", page: 1 }))}
          >
            全部
          </button>
          {topTags.map((t) => (
            <button
              key={t.name}
              className={`tag ${filters.tag === t.name ? "badge-brand" : ""}`}
              style={{ border: "none", cursor: "pointer" }}
              onClick={() => setFilters((f) => ({ ...f, tag: f.tag === t.name ? "" : t.name, page: 1 }))}
            >
              {t.name} · {t.count}
            </button>
          ))}
        </div>
      )}

      {/* 行业筛选 */}
      {industries.length > 0 && (
        <div className="row" style={{ gap: "var(--sp-2)", flexWrap: "wrap", marginBottom: "var(--sp-5)" }}>
          <span style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}>行业：</span>
          <button
            className={`tag ${!filters.industry ? "badge-cyan" : ""}`}
            style={{ border: "none", cursor: "pointer" }}
            onClick={() => setFilters((f) => ({ ...f, industry: "", page: 1 }))}
          >
            不限
          </button>
          {industries.map((i) => (
            <button
              key={i.name}
              className={`tag ${filters.industry === i.name ? "badge-cyan" : ""}`}
              style={{ border: "none", cursor: "pointer" }}
              onClick={() => setFilters((f) => ({ ...f, industry: f.industry === i.name ? "" : i.name, page: 1 }))}
            >
              {i.name} · {i.count}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid grid-agents">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 200 }} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="empty card">
          <div className="empty-icon">🔍</div>
          <p>没有找到匹配的 Agent，试试放宽筛选条件</p>
        </div>
      ) : (
        <>
          <div className="grid grid-agents">
            {items.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="row" style={{ justifyContent: "center", marginTop: "var(--sp-6)", gap: "var(--sp-3)" }}>
              <button className="btn btn-sm" disabled={filters.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>
                上一页
              </button>
              <span style={{ color: "var(--ink-3)", fontSize: "var(--fs-sm)" }}>
                {filters.page} / {totalPages}
              </span>
              <button className="btn btn-sm" disabled={filters.page >= totalPages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>
                下一页
              </button>
            </div>
          )}
        </>
      )}

      {showRegister && (
        <AgentRegisterModal
          onClose={() => setShowRegister(false)}
          onRegistered={() => {
            setFilters((f) => ({ ...f, page: 1 }));
            void load();
          }}
        />
      )}
    </div>
  );
}
