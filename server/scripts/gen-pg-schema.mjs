/**
 * 生成 PostgreSQL 变体 schema（个人端 v4 双模式支持）
 *
 * 背景：发布沙箱（WorkBuddy sites）拒绝 provider=postgresql，而本地/自托管希望用 PG 持久化。
 * 方案：保留 prisma/schema.prisma（SQLite，发布用），另生成 schema.pg.prisma（PostgreSQL，本地/自托管用）。
 * 两者结构完全一致，仅 datasource 不同（provider + 环境变量名），业务代码零改动。
 *
 * 用法：node scripts/gen-pg-schema.mjs  （或 npm run db:pg:sync）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const prismaDir = path.resolve(here, "../prisma");
const src = path.join(prismaDir, "schema.prisma");
const dest = path.join(prismaDir, "schema.pg.prisma");

let content = fs.readFileSync(src, "utf8");

// 1) provider → postgresql
content = content.replace(
  /datasource db \{\s*provider = "sqlite"\s*url\s+= env\("DATABASE_URL"\)\s*\}/,
  'datasource db {\n  provider = "postgresql"\n  url      = env("PG_DATABASE_URL")\n}',
);

if (!content.includes('provider = "postgresql"')) {
  throw new Error("未能生成 PG schema：datasource 替换失败（请检查 schema.prisma 的 datasource 段）");
}

const header = `// ⚠️ 本文件由 scripts/gen-pg-schema.mjs 自动生成，请勿手工编辑
// 用途：本地开发 / 自托管（PostgreSQL）；发布环境使用 schema.prisma（SQLite）
// 生成命令：npm run db:pg:sync
`;
fs.writeFileSync(dest, header + content);
console.log(`已生成 ${path.relative(process.cwd(), dest)}（provider=postgresql, env=PG_DATABASE_URL）`);
