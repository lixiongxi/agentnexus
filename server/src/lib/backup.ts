/**
 * 数据备份与恢复（v3 持久化保障）：
 *
 * 目标：SQLite 单文件在沙箱内随目录持久；万一将来更换沙箱/目录导致库重置，
 * 可从最近的 JSON 快照一键恢复，注册数据与知识库不丢。
 *
 * 机制：
 *   - 每日自动快照：服务启动 + 定时检查，写 backups/backup-YYYY-MM-DD.json（保留最近 7 份）
 *   - 启动自愈：owner 表为空且存在快照 → 自动恢复最新一份
 *   - 管理端点：GET /api/admin/backup（导出）、POST /api/admin/restore（恢复）
 */
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../db/client";

const BACKUP_DIR = path.resolve(process.cwd(), "backups");
const KEEP = 7;
const CORE_TABLES = [
  "Owner",
  "Agent",
  "Tag",
  "AgentTag",
  "AgentSetting",
  "AssistantProfile",
  "FaqEntry",
  "ProductEntry",
  "Connection",
  "Message",
  "AgentGroup",
  "GroupMember",
  "GroupMessage",
  "GroupTask",
  "AgentMoment",
  "MomentLike",
  "MomentComment",
  "ChatSession",
  "ChatMessage",
  "LlmConfig",
] as const;

/** 全量导出核心业务数据为可恢复快照 */
export async function exportSnapshot(): Promise<Record<string, unknown[]>> {
  const db = prisma as unknown as Record<string, { findMany: () => Promise<unknown[]> } | undefined>;
  const snap: Record<string, unknown[]> = {};
  for (const t of CORE_TABLES) {
    const model = db[t];
    if (!model) continue;
    snap[t] = await model.findMany();
  }
  return snap;
}

/** 从快照恢复（清空业务表后按依赖序灌入；幂等） */
export async function restoreSnapshot(snap: Record<string, unknown[]>): Promise<void> {
  const db = prisma as unknown as Record<
    string,
    { deleteMany: () => Promise<unknown>; createMany: (a: { data: unknown[] }) => Promise<unknown> } | undefined
  >;
  // 先清空（逆依赖序：子表在前）
  for (const t of [...CORE_TABLES].reverse()) {
    await db[t]?.deleteMany();
  }
  // 灌入（依赖序：父表在前）
  for (const t of CORE_TABLES) {
    const rows = snap[t];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    await db[t]?.createMany({ data: rows });
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 写一份今日快照到 backups/（同日覆盖；保留最近 KEEP 份） */
export async function writeDailyBackup(): Promise<string> {
  const snap = await exportSnapshot();
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const file = path.join(BACKUP_DIR, `backup-${today()}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify({ version: 3, exportedAt: new Date().toISOString(), data: snap }, null, 1),
  );
  // 清理过期快照
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("backup-") && f.endsWith(".json"))
    .sort();
  while (files.length > KEEP) {
    fs.unlinkSync(path.join(BACKUP_DIR, files.shift() as string));
  }
  return file;
}

/** 启动自愈：owner 表为空且存在快照 → 恢复最新一份；返回恢复的文件名或 null */
export async function restoreLatestIfEmpty(): Promise<string | null> {
  try {
    const owners = await prisma.owner.count();
    if (owners > 0) return null;
    if (!fs.existsSync(BACKUP_DIR)) return null;
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith("backup-") && f.endsWith(".json"))
      .sort();
    if (files.length === 0) return null;
    const latest = files[files.length - 1] as string;
    const parsed = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, latest), "utf8")) as {
      data?: Record<string, unknown[]>;
    };
    if (!parsed.data) return null;
    await restoreSnapshot(parsed.data as Record<string, unknown[]>);
    return latest ?? null;
  } catch (err) {
    console.warn("[backup] 启动自愈失败（忽略）:", err instanceof Error ? err.message : err);
    return null;
  }
}

let lastBackupDay = "";

/** 定时备份入口：每日首 tick 执行一次快照 */
export async function autoBackupTick(): Promise<void> {
  const day = today();
  if (day === lastBackupDay) return;
  try {
    const file = await writeDailyBackup();
    lastBackupDay = day;
    console.log(`[backup] 每日快照完成: ${file}`);
  } catch (err) {
    console.warn("[backup] 每日快照失败（忽略）:", err instanceof Error ? err.message : err);
  }
}
