import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { chat, chatHistory } from "../lib/chat.js";
import { runAutopilot, setSettings, getSettings, pruneAutopilotLogs } from "../lib/autopilot.js";
import { checkAgentAuth } from "../lib/auth.js";
import { getLlmConfig, setLlmConfig, hasLlmKey } from "../lib/llm-config.js";

const chatSchema = z.object({
  sessionId: z.string().min(1).max(64),
  message: z.string().min(1, "消息不能为空").max(2000)
});
const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  minScore: z.number().int().min(0).max(100).optional(),
  autoGreet: z.boolean().optional(),
  industries: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional()
});
const llmSchema = z.object({
  apiKey: z.string().min(1).max(300),
  baseUrl: z.string().url("baseUrl 需为合法 URL").max(200).optional(),
  model: z.string().min(1).max(100).optional()
});

export function registerChatRoutes(app: FastifyInstance) {
  /* ---------- 虚拟伙伴对话 ---------- */
  app.post("/api/chat", async (req, reply) => {
    const p = chatSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ ok: false, error: p.error.issues[0]?.message });
    const { sessionId, message } = p.data;
    const { reply: text, engine } = await chat(sessionId, message);
    return reply.send({ ok: true, reply: text, engine });
  });

  /* ---------- 虚拟伙伴历史 ---------- */
  app.get("/api/chat/:sessionId", async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const messages = await chatHistory(sessionId, 100);
    return reply.send({ ok: true, messages });
  });

  /* ---------- 自主巡航：读取设置 ---------- */
  app.get("/api/autopilot/settings", async () => ({ ok: true, settings: getSettings() }));

  /* ---------- 自主巡航：更新设置 ---------- */
  app.post("/api/autopilot/settings", async (req, reply) => {
    const p = settingsSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ ok: false, error: p.error.issues[0]?.message });
    setSettings(p.data);
    return reply.send({ ok: true, settings: getSettings() });
  });

  /* ---------- 自主巡航：立即执行一次（带 Agent 签名鉴权） ---------- */
  app.post("/api/autopilot/run", async (req, reply) => {
    const auth = await checkAgentAuth(req);
    if (!auth.ok) return reply.code(401).send({ ok: false, error: auth.reason, authMode: auth.mode });
    const { fromAgent } = (req.body || {}) as { fromAgent?: string };
    if (!fromAgent) return reply.code(400).send({ ok: false, error: "fromAgent 必填" });
    try {
      const result = await runAutopilot(fromAgent);
      return reply.send({ ok: true, ...result });
    } catch (e: any) {
      return reply.code(500).send({ ok: false, error: e?.message || String(e) });
    }
  });

  /* ---------- LLM 配置：读取（key 脱敏） ---------- */
  app.get("/api/llm/config", async () => {
    const c = getLlmConfig();
    return { ok: true, config: { baseUrl: c.baseUrl, model: c.model, hasKey: hasLlmKey() } };
  });

  /* ---------- LLM 配置：保存（写入 .env，无需重启） ---------- */
  app.post("/api/llm/config", async (req, reply) => {
    const p = llmSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ ok: false, error: p.error.issues[0]?.message });
    setLlmConfig({ apiKey: p.data.apiKey, baseUrl: p.data.baseUrl, model: p.data.model });
    const c = getLlmConfig();
    return reply.send({ ok: true, message: `已保存（model: ${c.model}），无需重启，立即生效`, config: { baseUrl: c.baseUrl, model: c.model, hasKey: true } });
  });

  /* ---------- LLM 配置：测试连通 ---------- */
  app.post("/api/llm/test", async (req, reply) => {
    if (!hasLlmKey()) return reply.send({ ok: false, error: "尚未配置 LLM API Key（协议设置页可配置）", engine: "local" });
    const c = getLlmConfig();
    try {
      const res = await fetch(`${c.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.apiKey}` },
        body: JSON.stringify({ model: c.model, messages: [{ role: "user", content: "回复：连接成功" }], max_tokens: 20 }),
        signal: AbortSignal.timeout(12000)
      });
      if (!res.ok) return reply.send({ ok: false, error: `模型返回 ${res.status}`, engine: "llm" });
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content?.trim();
      return reply.send({ ok: true, engine: "llm", reply: text, model: c.model });
    } catch (e: any) {
      return reply.send({ ok: false, error: "连接失败: " + (e?.message || e), engine: "llm" });
    }
  });

  /* ---------- 自主巡航：日志 ---------- */
  app.get("/api/autopilot/logs", async (req, reply) => {
    const { agent, limit } = req.query as { agent?: string; limit?: string };
    const logs = await prisma.autopilotLog.findMany({
      where: agent ? { fromAgent: agent } : undefined,
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(limit) || 30, 100)
    });
    return reply.send({ ok: true, logs });
  });

  /* ---------- 自主巡航：手动清理日志（保留最近 N 条/agent） ---------- */
  app.post("/api/autopilot/cleanup", async (req, reply) => {
    const { keep } = (req.body || {}) as { keep?: number };
    const max = Math.max(10, Math.min(keep ?? 300, 2000));
    const deleted = await pruneAutopilotLogs(max);
    return reply.send({ ok: true, deleted, keep: max });
  });
}
