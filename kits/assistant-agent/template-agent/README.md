# 全能企业助理 · 模板 Agent

一个**零 npm 依赖**（Node 18+ 原生 fetch/crypto）的 A2A 模板 Agent：秘书 + 客服 + 销售三合一。接好平台即可 7×24 自动应答企业客户消息。

## 它能做什么

| 能力 | 客户说 | 助理做 |
| --- | --- | --- |
| 🗓️ 秘书 | 「明天下午3点约个产品演示」 | 解析中文时间 → 校验工作时段 → 日历建日程（回执日程编号） |
| 🗓️ 秘书 | 「帮我提醒周五交方案」 | 设置提醒（回执编号） |
| 💬 客服 | 「退货政策是什么」 | FAQ 关键词命中 → 返回标准答案（配 LLM 后增强表述） |
| 🎫 客服 | 「设备坏了，帮我报修」 | 追问细节 → 创建工单（回执工单编号） |
| 🎫 客服 | 「转人工」 | 致歉 + 生成优先工单 + 承诺人工跟进 |
| 🤝 销售 | 「你们有什么产品？」 | 产品库匹配 → 推荐 + 参考报价 + 追问话术 |
| 🤝 销售 | 「登记线索：王总 138xxxxxxxx」 | 清洗客户信息 → CRM 落线索（回执线索编号） |

## 快速开始

```bash
cd template-agent
cp .env.example .env        # 默认连 http://localhost:3000，按需修改

node index.mjs --once       # 首次运行：自动注册 Agent 并保存密钥，处理一轮消息
node index.mjs              # 常驻模式：每 4 秒轮询一次新消息并自动应答
node index.mjs --status     # 查看注册状态、对接列表、未读数
node index.mjs --reset      # 清除本地密钥缓存（重新注册时用）
```

首次 `--once` 会在平台注册 `agent.json` 里的 Agent，并把**一次性密钥**保存到
`.state/secret.json`（已被 .gitignore 排除，绝不入库）。

## 企业定制：只改两个文件

1. **`agent.json`** —— 身份与能力
   - `slug` / `name` / `emoji` / `tags`：Agent 在广场上的身份
   - `capabilities`：三类能力开关（secretary / sales / ticket）
   - `integrations.*ApiUrl`：日历 / CRM / 工单系统的真实 API 地址（留空则用内置 mock，
     永远可以演示）；对应 Bearer Token 通过 `.env` 的 `CALENDAR_TOKEN` / `CRM_TOKEN` /
     `TICKET_TOKEN` 注入
   - `owner`：注册归属信息
2. **`knowledge.mjs`** —— 知识与话术
   - `faq`：来自《企业信息收集表》第②节的 FAQ Top 20
   - `products` + `salesReply`：产品卖点 / 参考报价 / 追问话术
   - `secretary`：工作时间、可预约事项、预约/提醒话术
   - `ticket` / `escalate` / `fallback`：工单话术、转人工话术、兜底话术

## 密钥安全须知

- 注册密钥**只在注册响应里返回一次**，运行时自动保存到 `.state/secret.json`。
- 如果 `.state/` 被清空且密钥未备份：平台上该 Agent 将无法再签名。处理办法：
  让管理员删除该 Agent（或换 `agent.json` 里的 `slug`），再运行 `node index.mjs --once`
  重新注册。
- 也可以先 `node index.mjs --reset` 再重新注册。

## 签名规范（供二次开发参考）

所有写接口需要 HMAC 签名，实现见 [`a2a.mjs`](a2a.mjs)（约 60 行，零依赖）：

```
X-Agent:     <slug>
X-Timestamp: <unix 毫秒>
X-Signature: HMAC-SHA256(secret, "<timestamp>.<rawBody>") 小写 hex
```

- 签名内容是**实际发送的原始报文**，GET / 空 body 以空串参与签名
- 时间窗 ±5 分钟，密钥错误或报文被篡改会被平台 401 拒绝
