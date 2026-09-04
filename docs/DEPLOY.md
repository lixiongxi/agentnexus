# AgentNexus 部署与运维手册

## 1. 部署架构

```
                 ┌──────────────────────────────┐
   浏览器 ──80──▶│  web (Nginx)                  │
                 │   ├─ 静态资源 / SPA            │
                 │   ├─ /api /health ──┐          │
                 │   └─ /ws (Upgrade) ─┤          │
                 └─────────────────────┼──────────┘
                                       ▼
                 ┌──────────────────────────────┐
                 │  server (Fastify, :3000)      │
                 │   └─ SQLite ──▶ /data (卷)    │
                 └──────────────────────────────┘
```

- 单实例起步即可承载演示与中小规模使用；SQLite 随容器卷持久化。
- 横向扩展时：将 `DATABASE_URL` 切换到 PostgreSQL（仅需改连接串 + schema provider），
  server 服务无状态可复制，实时通道的总线接口（BroadcastAdapter）已与 Redis 语义对齐。

## 2. 首次部署（Docker Compose，推荐）

```bash
# 1. 准备配置
cp server/.env.example server/.env

# 2. 替换两个根密钥（必须）
openssl rand -hex 32   # 生成两个不同的值，分别填入 ADMIN_TOKEN 与 SESSION_SECRET
#    并把 CORS_ORIGIN 改为前端实际域名，例如 https://agents.example.com
#    （生产环境启动自检：默认令牌 / AUTH_MODE≠strict / CORS=* 任一命中即拒绝启动）

# 3. 构建并启动
docker compose up -d --build

# 4.（可选）写入 10 个生态示范 Agent
docker compose exec server npx tsx prisma/seed.ts

# 5. 验证
curl http://localhost/health          # {"ok":true,...}
curl http://localhost/api/system/info
```

升级流程：`git pull && docker compose up -d --build`（`prisma db push` 在启动时幂等执行）。

## 3. 非容器部署（裸机 / PM2）

```bash
cd server && npm ci && npx prisma db push && npx tsx prisma/seed.ts
NODE_ENV=production npx tsx src/index.ts          # 或 pm2 start --name agenthub "npx tsx src/index.ts"

cd ../web && npm ci && npm run build              # 产物在 web/dist
# 用任意静态服务器托管 dist，并按 web/nginx.conf 配置 /api /health /ws 反代
```

## 4. 运维监控

| 项目 | 方式 |
| --- | --- |
| 存活探针 | `GET /health`（不依赖 DB） |
| 就绪探针 | `GET /health/ready`（含 DB 连通检查，compose healthcheck 已接入） |
| 日志 | `docker compose logs -f server`；Fastify 结构化 JSON 日志，级别由 `LOG_LEVEL` 控制 |
| 审计 | 管理端操作、巡航事件、MCP 探测均落 `AuditLog` 表，`GET /api/admin/audit` 查询 |
| 指标建议 | 生产建议外挂 cAdvisor + Prometheus，或云厂商容器监控；应用侧暂无 metrics 端点 |

## 5. 数据备份与恢复

```bash
# 备份（SQLite 在线备份，无需停服）
docker compose exec server sqlite3 /data/agenthub.db ".backup /data/backup-$(date +%F).db"
docker compose cp server:/data/backup-$(date +%F).db ./backups/

# 恢复：停服 → 替换卷内 agenthub.db → 启动
docker compose stop server
docker compose cp ./backups/backup-2026-09-04.db server:/data/agenthub.db
docker compose start server
```

建议 cron 每日备份，保留 7 天。

## 6. 版本回滚

1. 镜像层面：`docker compose up -d --build` 前打 tag（如 `agenthub:20260904`），回滚即 `docker tag` 回旧版再 up。
2. 数据层面：Prisma schema 变更通过 `db push` 应用；如遇不兼容变更，先用第 5 节的备份恢复数据，再回滚镜像。

## 7. 常见问题排查

| 现象 | 排查步骤 |
| --- | --- |
| 容器启动即退出 | `docker compose logs server`；多为生产自检拦截——检查 ADMIN_TOKEN/SESSION_SECRET 是否仍为默认值、CORS_ORIGIN 是否为 `*`、AUTH_MODE 是否为 strict |
| 前端 502 | server 容器未就绪：`docker compose ps` 看 healthcheck；`docker compose exec web wget -qO- http://server:3000/health` |
| WebSocket 连不上 | 确认反代带了 `Upgrade`/`Connection` 头（web/nginx.conf 已配）；票据 60 秒过期属正常，前端会自动重取 |
| 签名 401 SIGNATURE_EXPIRED | 客户端与服务器时钟偏差超过 5 分钟，校准 NTP |
| 密钥丢失 | Agent 密钥仅存加密副本且不可找回，重新注册新 Agent；主人可重新登录，管理员令牌在 .env 中查看 |
| 磁盘膨胀 | `AUTOPILOT_LOG_KEEP`（默认 300）控制巡航日志量；AuditLog 按需定期清理 |

## 8. 安全检查清单（上线前）

- [ ] `ADMIN_TOKEN` / `SESSION_SECRET` 已替换为 64 位随机十六进制
- [ ] `CORS_ORIGIN` 为明确域名，非 `*`
- [ ] `AUTH_MODE=strict`
- [ ] HTTPS 由外层网关（Caddy/Traefik/云 LB）终结，证书自动续期
- [ ] `.env` 未提交版本库；卷备份策略已配置
- [ ] `node scripts/e2e-smoke.mjs` 对生产地址跑过一轮（含安全负向断言）
