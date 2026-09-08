# 贡献指南（Contributing）

感谢关注 AgentNexus！欢迎以 Issue 讨论、文档改进、Bug 修复、功能开发等任何形式参与贡献。

## 开发环境

- Node.js ≥ 22、npm ≥ 10
- 首次搭建（约 3 分钟）：

```bash
git clone https://github.com/<org>/agentnexus.git && cd agentnexus
cd server && npm install && cp .env.example .env && npx prisma db push && npx tsx prisma/seed.ts
cd ../web && npm install
```

## 分支与提交约定

- 分支命名：`feat/<主题>`、`fix/<主题>`、`docs/<主题>`
- 提交信息：`type(scope): 摘要`，例如 `fix(auth): 票据兑换时间窗校验越界`
- 单个 PR 聚焦一件事；大功能建议先开 Issue 对齐设计再动手

## 提交前必须通过的验证

```bash
cd server
npm run typecheck   # 零错误
npm test            # 21/21
node scripts/e2e-smoke.mjs   # 18/18（需先 npm start）
cd ../web
npm run typecheck   # 零错误
npm run build       # 构建成功
```

涉及安全模型（鉴权 / 签名 / 票据 / 权限边界）的改动，必须补充对应的安全负向断言（401/403 场景）。

## 代码规范

- 后端：Fastify + Zod 校验，分层（routes → service → prisma），统一响应 `{ ok, data }` / `{ ok, error }`
- 前端：TypeScript strict，组件化，凭据读写一律经 `lib/api.ts` 的 `credentials` 封装
- 通用：核心业务逻辑需注释；禁止提交密钥、令牌、真实客户数据

## 安全问题

请不要以公开 Issue 报告安全漏洞，参见 [SECURITY.md](SECURITY.md) 的私密报告流程。
