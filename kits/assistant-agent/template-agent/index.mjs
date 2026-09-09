/**
 * index.mjs —— 全能企业助理运行时。
 *
 * 用法：
 *   node index.mjs            注册（幂等）并常驻轮询，自动应答平台消息
 *   node index.mjs --once     注册（幂等）并处理一轮新消息后退出（供脚本/演示调用）
 *   node index.mjs --status   查看注册状态与当前对接列表
 *   node index.mjs --reset    清除本地密钥缓存 .state/（下次运行将重新注册）
 *
 * 企业定制只需改两个文件：agent.json（身份/能力/外部系统）与 knowledge.mjs（知识库）。
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { api, endpoints, hubBase } from "./a2a.mjs";
import { handleText } from "./brain.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = path.join(HERE, ".state");
const SECRET_FILE = path.join(STATE_DIR, "secret.json");
const SEEN_FILE = path.join(STATE_DIR, "seen.json");

/* ---------------- 启动装载 ---------------- */

/** 极简 .env 装载（不覆盖已有环境变量，零依赖） */
function loadEnv() {
  const envFile = path.join(HERE, ".env");
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export function loadKit() {
  loadEnv();
  const cfg = JSON.parse(fs.readFileSync(path.join(HERE, "agent.json"), "utf8"));
  return cfg;
}

async function loadKnowledge() {
  return (await import("./knowledge.mjs")).default;
}

/** 可选 LLM 增强：配置了 LLM_API_KEY 时走 OpenAI 兼容接口，失败返回 null */
function makeLlm() {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return null;
  const baseUrl = (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.LLM_MODEL || "gpt-4o-mini";
  return {
    chat: async (userText) => {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          max_tokens: 500,
          messages: [
            { role: "system", content: `你是${"企业全能助理"}，用简洁专业的中文回答。` },
            { role: "user", content: userText },
          ],
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.choices?.[0]?.message?.content ?? null;
    },
  };
}

/* ---------------- 注册（幂等核心） ---------------- */

/**
 * 确保 Agent 已注册并拿到可用密钥。优先级：
 *   1) .state/secret.json 本地缓存（并校验该 slug 在平台上仍存在）
 *   2) 环境变量 AGENT_SECRET（CI / 已知密钥场景）
 *   3) 平台公开接口确认未注册后，POST /api/agents 新注册（secret 仅此一次返回）
 * 密钥只写本地 .state/（已被 .gitignore 排除），绝不落仓库。
 */
export async function ensureRegistered(cfg, hubUrl) {
  const hub = hubBase(hubUrl || process.env.AGENT_HUB_URL);
  const slug = cfg.slug;

  if (fs.existsSync(SECRET_FILE)) {
    let state = null;
    try {
      state = JSON.parse(fs.readFileSync(SECRET_FILE, "utf8"));
    } catch {
      state = null; // 缓存损坏视为无缓存
    }
    if (state?.slug === slug && typeof state.secret === "string" && state.secret.startsWith("sk_")) {
      try {
        await api(hub, { secret: state.secret, slug }, "GET", `/api/agents/${slug}`);
        return { slug, secret: state.secret, source: "cache" };
      } catch (e) {
        if (e.status === 404) {
          // 平台上已不存在（被删除/换库），本地缓存作废 → 走下方重新注册
          fs.rmSync(SECRET_FILE);
        } else {
          throw e;
        }
      }
    }
  }

  if (process.env.AGENT_SECRET?.startsWith("sk_")) {
    await api(hub, { secret: process.env.AGENT_SECRET, slug }, "GET", `/api/agents/${slug}`);
    saveSecret(slug, process.env.AGENT_SECRET);
    return { slug, secret: process.env.AGENT_SECRET, source: "env" };
  }

  // 平台已存在同名 Agent 但本地无密钥 → 无法取回，给出明确指引
  try {
    await api(hub, { secret: "sk_placeholder", slug }, "GET", `/api/agents/${slug}`);
    // 能走到这里说明公开详情存在（注意：公开接口不需要有效签名，占位签名仅为统一通道）
    throw new Error(
      `Agent「${slug}」已存在于平台，但本地 .state/secret.json 没有密钥（注册密钥只显示一次）。` +
        `请联系平台管理员删除该 Agent 后重跑，或将 agent.json 的 slug 改为新标识。`,
    );
  } catch (e) {
    if (e.status !== 404) throw e;
  }

  const body = {
    name: cfg.name,
    slug: cfg.slug,
    emoji: cfg.emoji || "🤖",
    color: cfg.color || "#4F6BFF",
    role: cfg.role,
    description: cfg.description || "",
    industry: cfg.industry || "企业服务",
    tags: cfg.tags || [],
    autoAccept: cfg.autoAccept !== false,
    online: cfg.online !== false,
    owner: cfg.owner,
  };
  const created = await fetch(`${hub}/api/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const envelope = await created.json();
  // 平台统一信封：成功 {ok:true, data:{...agent, secret}}，失败 {ok:false, error:{message}}
  const data = envelope?.ok ? envelope.data : envelope;
  const errMsg = envelope?.error?.message || `HTTP ${created.status}`;
  if (!created.ok || !data?.secret?.startsWith("sk_")) {
    throw new Error(`注册失败：${errMsg}`);
  }
  saveSecret(slug, data.secret);
  return { slug, secret: data.secret, source: "registered" };
}

function saveSecret(slug, secret) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(SECRET_FILE, JSON.stringify({ slug, secret, registeredAt: new Date().toISOString() }, null, 2), {
    mode: 0o600,
  });
}

/* ---------------- 收件箱轮询与应答 ---------------- */

function loadSeen() {
  try {
    return JSON.parse(fs.readFileSync(SEEN_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveSeen(seen) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(SEEN_FILE, JSON.stringify(seen));
}

/** 对所有已对接 peer：拉新消息 → 逐条生成回复 → 签名回发。返回 {handled, peers} */
export async function processOnce(cfg, auth, knowledge, llm) {
  const hub = hubBase(process.env.AGENT_HUB_URL);
  const conn = await endpoints.connections(hub, auth);
  const seen = loadSeen();
  let handled = 0;

  for (const item of conn.items || []) {
    const peer = item.peer?.slug;
    if (!peer) continue;
    seen[peer] ||= [];
    const history = await endpoints.history(hub, auth, peer, 50);
    const incoming = (history.messages || []).filter(
      (m) => m.toAgent === cfg.slug && m.fromAgent === peer && m.type !== "bot" && !seen[peer].includes(m.id),
    );
    for (const m of incoming) {
      const { reply } = await handleText(cfg, knowledge, m.text, llm);
      await endpoints.sendMessage(hub, auth, cfg.slug, peer, reply, "chat");
      seen[peer].push(m.id);
      handled++;
    }
    if (seen[peer].length > 400) seen[peer] = seen[peer].slice(-200); // 防膨胀
  }
  saveSeen(seen);
  return { handled, peers: (conn.items || []).map((i) => i.peer?.slug).filter(Boolean) };
}

/* ---------------- CLI ---------------- */

async function main() {
  const arg = process.argv[2] || "";
  const cfg = loadKit();

  if (arg === "--reset") {
    if (fs.existsSync(SECRET_FILE)) fs.rmSync(SECRET_FILE);
    if (fs.existsSync(SEEN_FILE)) fs.rmSync(SEEN_FILE);
    console.log("已清除本地密钥与已读状态缓存（.state/）。下次运行将重新注册。");
    return;
  }

  const hub = hubBase(process.env.AGENT_HUB_URL);
  const reg = await ensureRegistered(cfg, hub);
  const auth = { slug: reg.slug, secret: reg.secret };
  console.log(`[${cfg.name}] 已就绪 · slug=${reg.slug} · 密钥来源=${reg.source} · hub=${hub}`);

  if (arg === "--status") {
    const conn = await endpoints.connections(hub, auth);
    console.log(`对接 Agent：${conn.items.length ? conn.items.map((i) => i.peer.slug).join(", ") : "（暂无）"}`);
    const unread = await endpoints.unread(hub, auth);
    console.log(`未读消息：${unread.unread}`);
    return;
  }

  const knowledge = await loadKnowledge();
  const llm = makeLlm();
  if (llm) console.log("LLM 增强已启用（LLM_API_KEY 已配置，失败自动降级为规则引擎）");

  if (arg === "--once") {
    const r = await processOnce(cfg, auth, knowledge, llm);
    console.log(`处理完成：${r.handled} 条新消息，对接 ${r.peers.length} 个 Agent。`);
    return;
  }

  const interval = Number(process.env.POLL_INTERVAL_MS || 4000);
  console.log(`开始常驻轮询（每 ${interval}ms 一轮），Ctrl+C 退出。`);
  const tick = async () => {
    try {
      const r = await processOnce(cfg, auth, knowledge, llm);
      if (r.handled) console.log(`[${new Date().toLocaleTimeString()}] 应答 ${r.handled} 条消息`);
    } catch (e) {
      console.error(`[warn] 本轮处理失败：${e.message}`);
    }
  };
  await tick();
  setInterval(tick, interval);
}

if (import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1] || "").href) {
  main().catch((e) => {
    console.error(`[error] ${e.message}`);
    process.exit(1);
  });
}
