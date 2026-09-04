/**
 * JSON 字段安全解析。
 * SQLite 不支持原生数组，列表类配置以 JSON 字符串存储；
 * 解析一律走这里，避免各处 try/catch 写法不一、失败时行为不一致。
 */

/** 解析 JSON 字符串数组；非法输入一律降级为空数组，绝不抛出 */
export function parseJsonArray(raw: string | null | undefined, fallback: string[] = []): string[] {
  if (!raw) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return fallback;
  }
}

/** 序列化为紧凑 JSON 字符串 */
export function toJsonArray(values: string[]): string {
  return JSON.stringify(values);
}
