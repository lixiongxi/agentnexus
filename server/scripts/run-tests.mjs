/**
 * 测试入口包装（跨平台）：
 *
 * 背景（本机环境两个已定位的坑）：
 *  1. 宿主文件系统代理对系统临时目录（%TEMP%）与工作区外路径的写入有限制，
 *     而 vitest/vite-node 会把 SSR 转译缓存写入 os.tmpdir()，触发
 *     `EPERM: operation not permitted, open '...\ssr\<hash>'` 非致命错误，
 *     导致部分测试文件收集失败（用例数忽多忽少：36/41/43/49 不稳定）。
 *     → 修复：将 TMP/TEMP/TMPDIR 指向仓库内 .tmp 目录。
 *  2. 多文件并行时多个 worker 并发写同一 SSR 缓存目录，仍偶发 EPERM。
 *     → 修复：追加 --no-file-parallelism（串行，实测 4s 内完成，稳定 0 error）。
 *
 * 用法：npm test（= node scripts/run-tests.mjs [额外 vitest 参数]）
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "..");
const tmpDir = path.join(serverRoot, ".tmp");
fs.mkdirSync(tmpDir, { recursive: true });

const env = { ...process.env, TMP: tmpDir, TEMP: tmpDir, TMPDIR: tmpDir };

const args = process.argv.slice(2);
const hasParallelFlag = args.some((a) => a.startsWith("--no-file-parallelism") || a.startsWith("--fileParallelism"));
const isWin = process.platform === "win32";
const child = spawn(
  isWin ? "npx.cmd" : "npx",
  ["vitest", "run", ...(hasParallelFlag ? [] : ["--no-file-parallelism"]), ...args],
  { cwd: serverRoot, env, stdio: "inherit", shell: isWin },
);

child.on("exit", (code) => process.exit(code ?? 1));
