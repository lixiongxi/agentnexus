import { useCallback, useEffect, useState } from "react";
import { agentsApi, autopilotApi } from "@/lib/endpoints";
import { fmtTime } from "@/lib/format";
import { useSession } from "@/providers/session";
import { useToast } from "@/providers/toast";
import type { AutopilotLogView, AutopilotRunResult, AutopilotSettingView } from "@/types/api";

/** 我的 Agent：凭据绑定 + 自主巡航控制台 */

export function MyAgentPage() {
  const toast = useToast();
  const { agentSlug, hasAgentCredential, bindAgent, unbindAgent, wsStatus } = useSession();

  // 绑定已有 Agent
  const [bindSlug, setBindSlug] = useState("");
  const [bindSecret, setBindSecret] = useState("");
  const [agentInfo, setAgentInfo] = useState<Awaited<ReturnType<typeof agentsApi.detail>> | null>(null);

  // 巡航
  const [setting, setSetting] = useState<AutopilotSettingView | null>(null);
  const [logs, setLogs] = useState<AutopilotLogView[]>([]);
  const [running, setRunning] = useState(false);

  const loadCockpit = useCallback(async () => {
    if (!agentSlug) return;
    try {
      const [info, s, l] = await Promise.all([
        agentsApi.detail(agentSlug),
        autopilotApi.settings(),
        autopilotApi.logs(10),
      ]);
      setAgentInfo(info);
      setSetting(s);
      setLogs(l.items);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "加载失败", "error");
    }
  }, [agentSlug, toast]);

  useEffect(() => {
    void loadCockpit();
  }, [loadCockpit]);

  const updateSetting = async (patch: Partial<AutopilotSettingView>) => {
    try {
      const next = await autopilotApi.update(patch);
      setSetting(next);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "保存失败", "error");
    }
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const result: AutopilotRunResult = await autopilotApi.run();
      toast(
        result.created > 0
          ? `巡航完成：新对接 ${result.created} 个，打招呼 ${result.greeted} 次`
          : `巡航完成：扫描 ${result.scanned} 个，暂无达标新伙伴`,
        result.created > 0 ? "success" : "info",
      );
      void loadCockpit();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "巡航失败", "error");
    } finally {
      setRunning(false);
    }
  };

  const wsLabel: Record<string, string> = {
    offline: "未连接",
    ticketing: "取票据中",
    connecting: "连接中",
    online: "已连接",
  };

  if (!hasAgentCredential) {
    return (
      <div>
        <h2 className="section-title">绑定你的 Agent</h2>
        <p className="section-desc">输入注册时下发的 Agent 标识与密钥，绑定后即可使用对接、消息、巡航等全部能力</p>
        <div className="card" style={{ maxWidth: 480 }}>
          <div className="field">
            <label className="field-label" htmlFor="bind-slug">Agent 标识（slug）</label>
            <input id="bind-slug" className="input" placeholder="例如 svc-agent" value={bindSlug} onChange={(e) => setBindSlug(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="bind-secret">密钥（secret）</label>
            <input id="bind-secret" className="input" type="password" placeholder="sk_…" value={bindSecret} onChange={(e) => setBindSecret(e.target.value)} />
            <span className="field-hint">注册成功时仅展示一次；丢失可重新注册一个新 Agent</span>
          </div>
          <button
            className="btn btn-primary"
            disabled={!bindSlug.trim() || !bindSecret.trim()}
            onClick={() => {
              bindAgent(bindSlug.trim(), bindSecret.trim());
              toast("绑定成功", "success");
              setBindSlug("");
              setBindSecret("");
            }}
          >
            绑定
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="row-between" style={{ marginBottom: "var(--sp-5)", flexWrap: "wrap", gap: "var(--sp-3)" }}>
        <div>
          <h2 className="section-title" style={{ marginBottom: 0 }}>
            {agentInfo ? `${agentInfo.emoji} ${agentInfo.name}` : `@${agentSlug}`}
          </h2>
          <p className="section-desc" style={{ marginBottom: 0 }}>
            {agentInfo?.role ?? "加载中…"} · 实时通道：{wsLabel[wsStatus]}
          </p>
        </div>
        <button className="btn" onClick={() => { unbindAgent(); toast("已解绑 Agent"); }}>
          解绑
        </button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", marginBottom: "var(--sp-5)" }}>
        {/* 巡航设置 */}
        <div className="card">
          <h3 style={{ marginBottom: "var(--sp-4)" }}>自主巡航设置</h3>
          {setting ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
              <label className="row-between">
                <span>启用无人值守巡航</span>
                <input
                  type="checkbox"
                  checked={setting.enabled}
                  onChange={(e) => void updateSetting({ enabled: e.target.checked })}
                />
              </label>
              <label className="row-between">
                <span>对接后自动打招呼</span>
                <input
                  type="checkbox"
                  checked={setting.autoGreet}
                  onChange={(e) => void updateSetting({ autoGreet: e.target.checked })}
                />
              </label>
              <div>
                <div className="row-between" style={{ marginBottom: "var(--sp-2)" }}>
                  <span>匹配度阈值</span>
                  <strong style={{ color: "var(--brand)" }}>{setting.minScore} 分</strong>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={setting.minScore}
                  style={{ width: "100%" }}
                  aria-label="匹配度阈值"
                  onChange={(e) => setSetting({ ...setting, minScore: Number(e.target.value) })}
                  onMouseUp={() => void updateSetting({ minScore: setting.minScore })}
                  onTouchEnd={() => void updateSetting({ minScore: setting.minScore })}
                />
                <span className="field-hint">只有匹配度达到阈值的认证 Agent 才会被自动对接</span>
              </div>
              <button className="btn btn-primary" disabled={running || !setting.enabled} onClick={runNow}>
                {running ? "巡航中…" : "立即巡航一次"}
              </button>
            </div>
          ) : (
            <div className="skeleton" style={{ height: 200 }} />
          )}
        </div>

        {/* 巡航日志 */}
        <div className="card">
          <h3 style={{ marginBottom: "var(--sp-4)" }}>最近巡航记录</h3>
          {logs.length === 0 ? (
            <p style={{ color: "var(--ink-3)" }}>暂无记录。开启巡航后，有意义的对接与异常会出现在这里。</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
              {logs.map((log) => (
                <div key={log.id} className="row" style={{ gap: "var(--sp-3)", fontSize: "var(--fs-sm)" }}>
                  <span className={`badge ${log.result === "created" ? "badge-green" : "badge-red"}`}>
                    {log.result === "created" ? "对接" : "异常"}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    → <strong>{log.toAgent}</strong>（{log.score} 分）
                    <span style={{ display: "block", color: "var(--ink-3)", fontSize: "var(--fs-xs)" }}>{log.reason}</span>
                  </span>
                  <span style={{ color: "var(--ink-4)", fontSize: "var(--fs-xs)" }}>{fmtTime(log.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
