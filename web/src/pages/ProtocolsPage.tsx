import { useCallback, useEffect, useState } from "react";
import { credentials } from "@/lib/api";
import { adminApi, mcpApi, systemApi } from "@/lib/endpoints";
import { useSession } from "@/providers/session";
import { useToast } from "@/providers/toast";
import type { LlmConfigView, McpProbeResult, SystemInfo } from "@/types/api";

/** 协议设置：系统信息 / LLM 配置（管理员）/ MCP Server 探测 */

export function ProtocolsPage() {
  const toast = useToast();
  const { hasAgentCredential } = useSession();

  /* ---------- 系统信息 ---------- */
  const [info, setInfo] = useState<SystemInfo | null>(null);
  useEffect(() => {
    systemApi.info().then(setInfo).catch(() => setInfo(null));
  }, []);

  /* ---------- 管理员令牌 ---------- */
  const [adminToken, setAdminToken] = useState(() => credentials.adminToken.get() ?? "");

  const saveAdminToken = () => {
    const t = adminToken.trim();
    if (t) {
      credentials.adminToken.set(t);
      toast("管理员令牌已保存（仅存于本机 localStorage）", "success");
    } else {
      credentials.adminToken.clear();
      toast("管理员令牌已清除");
    }
  };

  /* ---------- LLM 配置 ---------- */
  const [llm, setLlm] = useState<LlmConfigView | null>(null);
  const [llmForm, setLlmForm] = useState({ baseUrl: "", model: "", apiKey: "" });
  const [llmBusy, setLlmBusy] = useState(false);

  const loadLlm = useCallback(async () => {
    try {
      const cfg = await adminApi.llmConfig();
      setLlm(cfg);
      setLlmForm({ baseUrl: cfg.baseUrl, model: cfg.model, apiKey: "" });
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "读取 LLM 配置失败", "error");
    }
  }, [toast]);

  useEffect(() => {
    if (credentials.adminToken.get()) void loadLlm();
  }, [loadLlm]);

  const saveLlm = async () => {
    if (llmBusy) return;
    setLlmBusy(true);
    try {
      const next = await adminApi.updateLlmConfig({
        baseUrl: llmForm.baseUrl.trim() || undefined,
        model: llmForm.model.trim() || undefined,
        apiKey: llmForm.apiKey.trim() || undefined,
      });
      setLlm(next);
      setLlmForm((f) => ({ ...f, apiKey: "" }));
      toast("LLM 配置已保存", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "保存失败", "error");
    } finally {
      setLlmBusy(false);
    }
  };

  const testLlm = async () => {
    if (llmBusy) return;
    setLlmBusy(true);
    try {
      const result = await adminApi.testLlm();
      if (result.ok) {
        toast(`连通正常（${result.model}）`, "success");
      } else {
        toast(`连通失败：${result.message}`, "error");
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "测试失败", "error");
    } finally {
      setLlmBusy(false);
    }
  };

  /* ---------- MCP 探测 ---------- */
  const [mcpUrl, setMcpUrl] = useState("https://modelcontextprotocol.io/sse");
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<McpProbeResult | null>(null);

  const probe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasAgentCredential) {
      toast("请先在「我的 Agent」绑定 Agent 凭据（探测接口需 Agent 签名）", "error");
      return;
    }
    if (probing) return;
    setProbing(true);
    setProbeResult(null);
    try {
      const result = await mcpApi.probe(mcpUrl.trim());
      setProbeResult(result);
      if (result.ok) {
        toast(`探测成功：${result.tools.length} 个工具`, "success");
      } else {
        toast(`探测失败：${result.error ?? "未知错误"}`, "error");
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "探测失败", "error");
    } finally {
      setProbing(false);
    }
  };

  return (
    <div>
      <h2 className="section-title">协议设置</h2>
      <p className="section-desc">平台系统信息、LLM 引擎配置（管理员）与 MCP 协议探测工具</p>

      {/* ===== 系统信息 ===== */}
      <div className="card" style={{ marginBottom: "var(--sp-5)" }}>
        <div className="row-between" style={{ marginBottom: "var(--sp-4)" }}>
          <h3>系统信息</h3>
          {info && <span className="badge badge-cyan">{info.version}</span>}
        </div>
        {info ? (
          <div className="grid grid-stats">
            <InfoCell label="服务" value={info.service} />
            <InfoCell label="鉴权模式" value={info.authMode} />
            <InfoCell label="LLM 引擎" value={info.features.llmEnabled ? info.features.llmModel : "未启用"} />
            <InfoCell label="自主巡航" value={info.features.autopilotEnabled ? "已启用" : "已关闭"} />
            <InfoCell label="接口限流" value={info.features.rateLimitEnabled ? "已启用" : "已关闭"} />
          </div>
        ) : (
          <div className="skeleton" style={{ height: 72 }} />
        )}
      </div>

      {/* ===== LLM 配置（管理员） ===== */}
      <div className="card" style={{ marginBottom: "var(--sp-5)" }}>
        <div className="row-between" style={{ marginBottom: "var(--sp-4)", flexWrap: "wrap", gap: "var(--sp-2)" }}>
          <h3>LLM 引擎配置</h3>
          {llm && (
            <span className={`badge ${llm.hasKey ? "badge-green" : "badge-amber"}`}>
              {llm.hasKey ? "API Key 已配置" : "API Key 未配置（虚拟伙伴走本地引擎）"}
            </span>
          )}
        </div>

        {/* 管理员令牌 */}
        <div className="field">
          <label className="field-label" htmlFor="admin-token">
            管理员令牌（X-Admin-Token）
          </label>
          <div className="row" style={{ gap: "var(--sp-2)" }}>
            <input
              id="admin-token"
              className="input"
              type="password"
              placeholder="服务端 .env 中 ADMIN_TOKEN 的值"
              value={adminToken}
              onChange={(e) => setAdminToken(e.target.value)}
              autoComplete="off"
            />
            <button type="button" className="btn" onClick={saveAdminToken}>
              保存
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => void loadLlm()}>
              加载配置
            </button>
          </div>
          <span className="field-hint">令牌仅保存在本机，请求时自动注入请求头，不经过服务端存储</span>
        </div>

        {llm && (
          <>
            <div className="field">
              <label className="field-label" htmlFor="llm-baseurl">
                Base URL
              </label>
              <input
                id="llm-baseurl"
                className="input"
                value={llmForm.baseUrl}
                onChange={(e) => setLlmForm((f) => ({ ...f, baseUrl: e.target.value }))}
                placeholder="https://api.example.com/v1"
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="llm-model">
                模型
              </label>
              <input
                id="llm-model"
                className="input"
                value={llmForm.model}
                onChange={(e) => setLlmForm((f) => ({ ...f, model: e.target.value }))}
                placeholder="gpt-4o-mini / qwen-plus / …"
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="llm-apikey">
                API Key {llm.hasKey && <span className="field-hint">（已配置，留空表示不变更）</span>}
              </label>
              <input
                id="llm-apikey"
                className="input"
                type="password"
                value={llmForm.apiKey}
                onChange={(e) => setLlmForm((f) => ({ ...f, apiKey: e.target.value }))}
                placeholder="sk-…"
                autoComplete="off"
              />
            </div>
            <div className="row" style={{ gap: "var(--sp-2)" }}>
              <button className="btn btn-primary" onClick={() => void saveLlm()} disabled={llmBusy}>
                保存配置
              </button>
              <button className="btn" onClick={() => void testLlm()} disabled={llmBusy}>
                连通性测试
              </button>
            </div>
          </>
        )}
      </div>

      {/* ===== MCP 探测 ===== */}
      <div className="card">
        <div className="row-between" style={{ marginBottom: "var(--sp-4)", flexWrap: "wrap", gap: "var(--sp-2)" }}>
          <h3>MCP Server 探测</h3>
          <span className="badge">{hasAgentCredential ? "凭据就绪" : "需绑定 Agent 凭据"}</span>
        </div>

        <form onSubmit={probe}>
          <div className="field">
            <label className="field-label" htmlFor="mcp-url">
              MCP Server URL
            </label>
            <div className="row" style={{ gap: "var(--sp-2)" }}>
              <input
                id="mcp-url"
                className="input"
                value={mcpUrl}
                onChange={(e) => setMcpUrl(e.target.value)}
                placeholder="https://example.com/mcp/sse"
              />
              <button className="btn btn-primary" type="submit" disabled={probing || !mcpUrl.trim()}>
                {probing ? "探测中…" : "探测"}
              </button>
            </div>
            <span className="field-hint">
              探测 MCP Server 暴露的工具与资源清单；服务端已做 SSRF 防护（生产环境拒绝内网地址）
            </span>
          </div>
        </form>

        {probeResult && probeResult.ok && (
          <div>
            <p style={{ fontWeight: 600, marginBottom: "var(--sp-2)" }}>
              工具（{probeResult.tools.length} 个）
            </p>
            {probeResult.tools.length === 0 ? (
              <p className="field-hint">该 Server 未声明任何工具</p>
            ) : (
              <div className="grid" style={{ gap: "var(--sp-2)" }}>
                {probeResult.tools.map((t) => (
                  <div key={t.name} className="tag" style={{ padding: "var(--sp-2) var(--sp-3)" }}>
                    <strong style={{ marginRight: 8 }}>{t.name}</strong>
                    <span style={{ color: "var(--ink-3)" }}>{t.description || "（无描述）"}</span>
                  </div>
                ))}
              </div>
            )}
            {probeResult.resources.length > 0 && (
              <p className="field-hint" style={{ marginTop: "var(--sp-3)" }}>
                资源 URI：{probeResult.resources.join("、")}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="card" style={{ padding: "var(--sp-4)", boxShadow: "none", background: "var(--surface-2)" }}>
      <p className="field-hint" style={{ marginBottom: "var(--sp-1)" }}>
        {label}
      </p>
      <p style={{ fontWeight: 600, wordBreak: "break-all" }}>{value}</p>
    </div>
  );
}
