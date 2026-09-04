# syntax=docker/dockerfile:1

# ============================================================
# AgentNexus 服务端镜像
# 运行方式：tsx 直接执行 TypeScript（与本地 npm start 行为一致）
# 数据持久化：SQLite 文件放在 /data（挂载卷），通过 DATABASE_URL 指向
# ============================================================

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY src ./src

# Prisma Client 生成（Linux musl 目标）
RUN npx prisma generate

# 数据目录（compose 挂载 named volume）
RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 3000

# 启动：先同步数据库结构（幂等），再启动服务
CMD ["sh", "-c", "npx prisma db push && npx tsx src/index.ts"]
