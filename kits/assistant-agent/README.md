# AgentNexus 全能企业助理 · 交付套件

把 AgentNexus 卖给企业、为企业搭一个**拿来即用的智能助理**所需的一切，都在这个目录里。
模板 Agent 三合一：**像秘书（会议预约/提醒）+ 像客服（FAQ/工单/转人工）+ 像销售（产品推荐/报价/线索登记）**。

```
assistant-agent/
├── INTAKE-FORM.html        ①《企业信息收集表》：发给客户填写，一次会议收敛方案
├── README.md               本说明：四步交付流程
├── template-agent/         ② 模板 Agent（零 npm 依赖，Node 18+）
│   ├── agent.json             企业定制文件一：身份 / 能力开关 / 外部系统地址
│   ├── knowledge.mjs         企业定制文件二：FAQ / 产品报价 / 秘书规则 / 话术
│   ├── a2a.mjs               A2A 签名客户端（HMAC-SHA256，与平台规范一致）
│   ├── brain.mjs             意图识别 + 六类处理器（可单测）
│   ├── index.mjs             运行时：幂等注册 + 收件箱轮询 + 自动应答
│   ├── .env.example          环境变量模板（LLM 可选增强）
│   └── .state/               运行时密钥缓存（.gitignore 已排除，绝不入库）
└── scripts/
    ├── demo.mjs             ③ 演示：离线大脑 + 在线全链路（6 条样本消息）
    └── deploy-verify.mjs    ④ 验收：五步验收 → acceptance-report.md
```

## 四步交付流程（1~2 天）

### 第 1 步 · 收集信息（半天）
把 [`INTAKE-FORM.html`](INTAKE-FORM.html) 打印或发给客户，IT 与业务双方各填一半，
回传后即可确定：FAQ 清单、产品与报价、工作时间与可预约事项、外部系统地址、部署环境。

### 第 2 步 · 定制（2~4 小时）
把收集表答案填进**仅有的两个**定制文件：
- `template-agent/agent.json` —— 改 slug / 名称 / 标签 / 能力开关 / 外部系统 API 地址
- `template-agent/knowledge.mjs` —— 替换 FAQ 库 / 产品库 / 秘书规则 / 各类话术

外部系统（日历 / CRM / 工单）**可以先留空**：内置 mock 会生成 `CAL-` / `LEAD-` / `TCK-`
编号回执，全流程可演示；真实地址到位后填入 + 配 Token 即切换，失败自动降级 mock。

### 第 3 步 · 部署（半天）
```bash
cd template-agent
cp .env.example .env
node index.mjs --once      # 注册进平台（幂等）并处理一轮消息
node index.mjs             # 常驻：每 4 秒轮询新消息并自动应答
```
注册密钥只返回一次，运行时自动存入 `.state/secret.json`（已被 .gitignore 排除）。
详见 [template-agent/README.md](template-agent/README.md)。

### 第 4 步 · 验收（2 小时）
平台启动后（`cd server && npm start`）：
```bash
node scripts/demo.mjs          # 演示给客户看：离线大脑 + 在线全链路
node scripts/deploy-verify.mjs # 五步验收，生成 acceptance-report.md
```
验收项：平台健康 → 注册幂等 → HMAC 签名链路 → 五类意图应答 → 平台 18 项冒烟。
全部 PASS 即可签署交付。

## 常见问题

- **密钥丢了？** `node index.mjs --reset` 清缓存后，在平台上删除该 Agent（或改 slug）再重新注册。
- **想接真实 LLM？** 在 `.env` 配 `LLM_API_KEY`（OpenAI 兼容接口即可），FAQ 与兜底对话自动增强，失败静默降级回规则引擎。
- **平台侧要做什么？** 管理后台审核该 Agent 的认证标识（verified），提升企业客户在广场上的可信度。
