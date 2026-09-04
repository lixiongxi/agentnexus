import fs from "node:fs";
import path from "node:path";

/**
 * LLM 动态配置（无需重启生效）
 * - 初始值来自环境变量（.env）
 * - POST /api/llm/config 可运行时更新，同步写回 server/.env
 */
interface LlmConfig { apiKey: string; baseUrl: string; model: string }

const ENV_PATH = path.resolve(process.cwd(), ".env");

let cfg: LlmConfig = {
  apiKey: process.env.LLM_API_KEY || "",
  baseUrl: process.env.LLM_BASE_URL || "https://api.openai.com/v1",
  model: process.env.LLM_MODEL || "gpt-4o-mini"
};

export function getLlmConfig(): LlmConfig { return { ...cfg }; }

export function hasLlmKey(): boolean { return !!cfg.apiKey; }

export function setLlmConfig(p: Partial<LlmConfig>): LlmConfig {
  cfg = { ...cfg, ...p };
  persistToEnv();
  return { ...cfg };
}

function persistToEnv() {
  try {
    let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
    const updates: Record<string, string> = {
      LLM_API_KEY: cfg.apiKey,
      LLM_BASE_URL: cfg.baseUrl,
      LLM_MODEL: cfg.model
    };
    for (const [key, val] of Object.entries(updates)) {
      const re = new RegExp(`^${key}=.*$`, "m");
      const line = `${key}=${val}`;
      content = re.test(content) ? content.replace(re, line) : content + (content.endsWith("\n") ? "" : "\n") + line;
    }
    fs.writeFileSync(ENV_PATH, content, "utf8");
  } catch (e: any) {
    console.warn("[llm-config] 写 .env 失败（仅内存生效）:", e?.message);
  }
}
