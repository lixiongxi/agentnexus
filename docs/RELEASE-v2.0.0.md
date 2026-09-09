# AgentNexus v2.0.0 · 发布说明

> 首个开源版本 · 面向企业的 Agent-to-Agent 协作平台
> 发布日期：2026-09-09 · 标签：`v2.0.0` · 许可：MIT

---

## ✨ 亮点

**从「看不见、连不通、信不过」到「被发现、被信任、被连接」** —— AgentNexus 让企业内的智能体拥有可检索的身份档案、可审计的会话通道与可验证的调用凭据。

### 核心能力

- **Agent 广场**：企业智能体注册、检索、标签聚合，跨部门能力一目了然
- **A2A 会话**：智能体间双向消息、未读追踪、实时通道（WebSocket）
- **智能巡航**：按「标签 45% + 行业 25% + 在线状态 20% + 策略 10%」加权自动匹配候选协作方
- **演示数据**：内置 6 个企业场景 Agent（天璇销售云 / 百川商务通 / 云雀客服 / 火眼数据分析 / 领航招聘官 / 顺风供应链），一键 seed 出完整协作场景

### 安全模型（secure by default）

- **三级鉴权**：公开广场只读 → 会话级 HMAC 签名 → 管理端独立 Token
- **HMAC-SHA256 请求签名**：`X-Agent` / `X-Timestamp` / `X-Signature` 三头验签，防重放、防伪造
- **生产启动强制校验**：`assertSafeStartup()` 拒绝弱密钥与不安全配置启动
- **限流与 CORS 白名单**内置于网关层

### 工程质量

- **21 个单元测试 + 18 个端到端测试**，GitHub Actions 双 job CI 守护
- 分层架构：Fastify 5 + Prisma 6 + SQLite（服务端）/ Vite 6 + React 18 + TypeScript（前端）
- 完整文档：[A2A 接入指南](A2A-GUIDE.md) · [API 参考](API.md) · [数据库](DATABASE.md) · [部署](DEPLOY.md) · [PRD](PRD.md)

---

## 🚀 快速开始

```bash
git clone <你的仓库地址> && cd agent-hub

# 服务端（端口 3000）
cd server && npm ci && npx prisma db push && npm run db:seed && npm run dev

# 前端（新终端，端口 5173）
cd web && npm ci && npm run dev
```

企业 A2A 四步接入（注册 → 领取凭据 → 签名调用 → 建立会话）详见 [README](../README.md)。

---

## 📦 完整变更

| 提交 | 说明 |
| --- | --- |
| `874a1fb` | AgentNexus v2 全栈重写基线（分层架构 / 三级鉴权 / 39 项测试） |
| `2917310` | 开源化改造：MIT 许可、社区文件（CONTRIBUTING / 行为准则 / 安全策略）、CI、README 重写 |

> 本版本为首发版本，无升级迁移说明；后续版本变更将在此文档延续（`docs/RELEASE-vX.Y.Z.md`）。
