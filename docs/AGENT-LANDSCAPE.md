# Agent 生态学习地图（AgentNexus 视角）

> 用途：持续跟踪业界对 Agent 的理解与标准演进，沉淀为 AgentNexus 的升级依据。
> 本文档由「Agent 生态周报」自动化定期追加更新日志；首次成稿：2026-09-09。

---

## 一、三层理解框架

业界对 Agent 的理解可以拆成三层，每层都出现了事实标准：

### 1. 协议层 —— Agent 怎么「连接」

| 协议 | 发起 / 治理 | 职责 | 现状（2026-09） |
| --- | --- | --- | --- |
| **A2A** | Google（2025-04）→ Linux Foundation | **横向**：Agent ↔ Agent 的发现、协商、任务协作 | v1.0 稳定；150+ 组织生产使用；SDK 五语言；22k+ stars |
| **MCP** | Anthropic（2024-11）→ Agentic AI Foundation | **纵向**：Agent ↔ 工具/数据源 | 97M+ 月下载、10k+ 公开服务器、1B+ 月工具调用；OAuth 2.1 + PKCE 补齐企业鉴权 |
| **ACP** | IBM → Linux Foundation | REST 原生的轻量替代（边缘/离线发现） | 2025-08 并入 A2A |
| **ANP** | 开源社区 | 去中心化 P2P Agent 网络（DID 身份） | 早期 |

**关键结论：A2A 与 MCP 是互补分层，不是竞争** —— MCP 解决「Agent 用工具」，A2A 解决「Agent 找 Agent」。

### 2. 框架层 —— Agent 怎么「被构建」

- **生产可用性分级**（2026 中）：LangGraph（Tier 1：87% 任务成功率、checkpointing、LangSmith 可观测）> CrewAI（Tier 2：最快原型、RBAC/SSO 企业化）> OpenAI Agents SDK / Google ADK（Tier 3-4，生态仍成长中）。
- **收敛事件**：Microsoft Agent Framework 1.0（2026-04）合并 AutoGen + Semantic Kernel；OpenAI Swarm 已废弃、AutoGen 进入维护模式 —— 框架选型的迁移窗口有限。
- **共同趋势**：所有主流框架都已原生支持 MCP；A2A 支持成为 2026 年新战场（CrewAI / MS AF 已原生）。

### 3. 信任与经济层 —— Agent 怎么「被信任、被结算」

- **Signed Agent Cards（A2A v1.0）**：卡片带域名绑定的密码学签名，防「卡片伪造」—— 这是去中心化发现可行的信任前提。
- **AP2 支付协议**（Google，60+ 金融伙伴 → FIDO 治理）：Intent / Cart / Payment 三段式 **mandate 链**（W3C VC），把「谁授权、买什么、多少钱」变成不可抵赖的审计链。
- **卡组织入场**：Visa Trusted Agent Protocol（签名 HTTP 头证明 Agent 身份）、Mastercard Agent Pay（Agent 注册 + 代币绑定三方身份）。
- **链上信任**：ERC-8004「Trustless Agents」—— 身份 / 声誉 / 验证三个注册表，作为 A2A 的链上扩展。
- **最大软肋**：签名保证「执行完整性」，但不保证「决策完整性」—— prompt 注入可以在签名发生前污染 Agent 的推理（AP2 红队研究已实证）。

---

## 二、对 AgentNexus 的差距分析与升级记录

| 业界做法 | AgentNexus 现状 | 结论 / 动作 |
| --- | --- | --- |
| Agent Card（`/.well-known/agent-card.json`） | ❌ 无 | ✅ **本次已实现**：`GET /api/agents/:slug/agent-card.json`（A2A 适配版，标签自动推导 skills、如实声明 HMAC 鉴权、暴露全部互操作端点、含 x-agentnexus 扩展段） |
| Signed Agent Cards | 平台有 verified 认证标识 + HMAC 请求签名 | ✅ **本次已实现**：Agent Card 附 Ed25519 平台签名（`signature` 块：kid / keyUrl / payloadDigest / value），公钥经 `GET /.well-known/jwks.json`（JWKS）发布，第三方可独立验签；密钥从 SESSION_SECRET 确定性派生（轮换密钥即轮换签名身份） |
| Task 生命周期（submitted→working→completed/failed） | 消息 type 含 task 但无状态机；GroupTask 已有 open→working→done/failed 雏形 | **P1（2026-09-21 上调）**：消息升级为带生命周期的 Task 对象；建模对齐 A2A v1.1 草案（task timeline、事件过滤标准化、working 态消息处理），预留兼容字段，避免 v1.1 正式发布后返工。**排期见 `docs/PLAN-MCP-TASK.md`** |
| MCP 工具生态 | Agent 表有 mcpEndpoint + 探测能力（`POST /api/mcp/probe`，结果未持久化） | **P1（2026-09-21 由路线图上调）**：依据——MCP 生产化率 78%、SDK 月下载逼近 5 亿（AAIF 口径），企业客户默认会询问 MCP 能力；近期落地 MCP Server 注册与工具发现（Agent Card 已暴露 mcp 端点，具备前置条件）。**排期见 `docs/PLAN-MCP-TASK.md`** |
| 可观测性（LangSmith 级） | 全量审计日志已内置 | 已具备基础；路线图：会话级 trace 视图 |
| 声誉体系（ERC-8004 reputation） | 无 | 路线图：Agent 互评 / 评分沉淀为声誉分 |
| 决策完整性（防 prompt 注入） | LLM 增强仅在 kit 层 | 已写入 SECURITY.md 红线；路线图：平台侧输入过滤与提示词隔离 |

**对招商定位的影响**：AgentNexus 的「广场 + 对接 + 巡航 + 审计」恰好是 A2A Registry（发现）+ Agent Card（自描述）+ 审计（企业合规）的中国企业私有化组合，协议层叙事可以全面对齐 A2A 术语。

---

## 三、来源（首次成稿时点 2026-09-09）

- A2A 协议与 v1.0 更新：a2a-registry.org、stellagent.ai、rapidclaw.dev、agentica.wiki、developer.huawei.com
- MCP 规模数据：neuralcoretech.com、agentscout.live
- 框架对比：morphllm.com、alphacorp.ai、agentscout.live
- 信任与支付：theuniversalcommerceprotocol.com、joinhexagon.com、splunk.com、eco.com

---

## 更新日志

<!-- 「Agent 生态周报」自动化在此追加：搜索 A2A/MCP/框架/信任层的关键变化，对比本文「差距分析」，追加条目。 -->

### 2026-09-28 · 周报第 4 期
**本周变化要点（2026-09-21 ~ 09-28，检索窗口）：**
- **MCP 2026-07-28 spec 被 9 月业界定性为「史上最大更新」**：无状态化落地——移除 initialize 握手与 Mcp-Session-Id，请求可路由到任意实例；新增 Mcp-Method / Mcp-Name 网关路由头、W3C Trace Context 分布式追踪、tools/list 可缓存（TTL）；鉴权升级为正式 OAuth 2.1 资源服务器（RFC 9207/9728/8707 + Client ID Metadata Documents）；MCP Apps 与 Tasks 升级为正式扩展框架；确立 12 个月废弃宽限期（Roots/Sampling/Logging/HTTP+SSE 进入废弃窗口）。AWS 发布 Well-Architected 部署指引：可用普通负载均衡替代 sticky session，Lambda 成为合法部署形态（bex.co 9-24、infoq.com）。
- **A2A 首个超大规模企业生产落地**：Amazon Connect Customer（9-23）上线基于 A2A 的 Agent 间协作——客服 AI Agent 可在通话中委托外部专业 Agent，AWS 与 A2A 技术指导委员会合作将协议扩展支持**语音流式**与交互级会话连续性，并提供统一可观测、护栏与升级控制（mwpro.co.uk）。spec 本体仍为 v1.0.1（2026-05-28），A2A 已于 8-27 成为 AAIF Growth Stage 项目、支持组织 170+、GitHub 25.9k stars（agentsurface.dev，9-25 核验）。
- **框架层无格局突变**：LangGraph 1.2.12（9-21，纯修复）、CrewAI 1.15.22（9-16）、Microsoft Agent Framework Python 1.19.0（9-18）、Google ADK 2.0 多语言 GA；GitHub 生态周观察（9-22）：无新框架入场，热点全面转向「生产治理」——策略引擎、凭据隔离、便携记忆（analyticsinsight.net、quidproquo.cc）。
- **Agent 支付现分化信号**：x402 链上累计交易超 1 亿笔（Chainalysis Q1 口径），但 Real Vision 分析显示上半年日均支付量下滑 93%——基建真实、热度回落；AP2 维持「治理强、部署薄」；Stripe+Tempo 的 MPP 主打会话式流式微支付；AWS AgentCore Payments 正式 GA（mpaypass.com.cn 9-23、agentsurface.dev）。
- 数据甄别备注：skillsllm.com（9-22）称「MCP spec 2.1 双向流式」「LangGraph 2.0 发布」「GPT-4.5 Code」，与 InfoQ/官方 release 口径冲突，连续第二周判定为不可靠来源，未采纳。

**对 AgentNexus 的影响与建议（中等变化，不触发代码级升级，建议更新差距表 1 行设计约束）：**
- Agent Card + Ed25519 签名方向不变；A2A 的 AAIF Growth Stage 地位强化了「协议叙事全面对齐 A2A 术语」的招商定位，无需改动。
- **建议更新差距表「MCP 工具生态」行（当前 P1）**，补充设计约束：MCP Server 注册与工具发现（`POST /api/mcp/probe` 及后续排期开发）须按 **2026-07-28 stateless spec** 设计——probe 不得假设会话粘性、SDK 需兼容新旧两版 spec 协商、工具列表结果可按 TTL 缓存；MCP Tasks 扩展与平台 Task 状态机（PLAN-MCP-TASK）概念对齐，避免两套 Task 语义冲突。
- A2A 语音扩展与支付协议分化暂不影响 AgentNexus 现有路线，持续观察即可。

### 2026-09-21 · 周报第 3 期
**本周变化要点（2026-09-09 ~ 09-21，检索窗口）：**
- **MCP 规模跃迁 + 首个官方认证**：9-14 Agentic AI Foundation（阿姆斯特丹 AGNTCon + MCPCon Europe）发布首个官方认证 MCPA，对齐 2026-07-28 spec（bex.co）；Tier 1 SDK 月下载逼近 **5 亿**（H1 约 9700 万，约 5 倍跳增）、TypeScript/Python SDK 累计各破 10 亿、ChatGPT MCP 工具调用 8 月为 1 月的 98 倍、公开 MCP Server 超 1 万、78% 企业 AI 团队已生产化部署（bex.co，AAIF 口径）。
- **A2A 进入 v1.1 演进窗口**：官方 roadmap 列出 v1.1 重点（task timeline 规范细化、事件过滤标准化、working 状态消息处理指引）、BiDi 双向流式、A2A CLI + 编码工具集成、Inspector/TCK 验证工具（a2a-protocol.org）；当前最新版仍为 v1.0.1（2026-05-28）；生态量级对比：a2a-sdk 月下载约 1090 万 vs MCP SDK 约 2.57 亿（tomrochette.com，6 月中数据）——「MCP 在内、A2A 在外」差距仍在拉大。
- **框架层无格局突变**：CrewAI 1.15.21（9-09）宣称 A2A 集成达企业级；LangGraph 1.2.x 聚焦 durable execution；Microsoft Agent Framework 1.17.0（9-03）；AutoGen 确认停止新特性（solutiongigs.in、dutchstartup.ai）。
- **Agent 支付从 spec 走向真实交易**：AP2 v0.2 细化 Checkout/Payment Mandate 与双 Receipt、五角色模型、与 UCP 互通（universalcommerceprotocol.blog）；x402 已归入 Linux Foundation x402 Foundation，近 30 天 7541 万笔交易 / 2424 万美元交易额（eco.com，9-16 x402.org 数据）。
- **垂直行业 MCP 化加速**：Rubrik（9-15，安全云 + OWASP MCP Top 10 治理护栏）、Cint、Beeline 等企业级 MCP 相继上线（futurumgroup.com、manilatimes.net、byte.eco）。
- 数据甄别备注：skillsllm.com（9-10）称「MCP 2.1 流式已发布」，与 AAIF 口径（最新 spec 为 2026-07-28）冲突，判定为不可靠来源，未采纳。

**对 AgentNexus 的影响与建议（本周无重大变化，无需触发代码级升级）：**
- Agent Card + Ed25519 签名已落地的方向与业界一致，无需改动。
- ~~建议上调差距表「**MCP 工具生态**」行优先级~~ → ✅ 已落实：该项提为 P1。
- ~~建议在差距表「**Task 生命周期**」行补充设计约束~~ → ✅ 已落实：已对齐 A2A v1.1 草案约束。
- 落实记录：两条建议经用户于 2026-09-21 确认后更新至「差距分析与升级记录」表；代码实现（MCP Server 注册、Task 状态机）待排期开发。

### 2026-09-09 · 第二期：落地 Signed Agent Cards
- 升级内容：Agent Card 附平台 **Ed25519 签名**（对标 A2A v1.0 Signed Agent Cards）——`signature` 块含 algorithm / keyId / keyUrl / payloadDigest / value（base64url）。
- 公钥发现：新增 **`GET /.well-known/jwks.json`**（JWKS，OKP/Ed25519），第三方按 keyId 取公钥独立验签，无需信任平台口头声明。
- 工程实现：`server/src/lib/card-signing.ts`（canonical JSON 键序无关签名 + 确定性密钥派生 + 平台自验/外部 JWK 验签），5 个新单测（总 **31**）。
- 实测（第三方视角）：kid 匹配 ✓ payloadDigest 匹配 ✓ Ed25519 验签 ✓ 篡改卡片任意字段后验签拒绝 ✓。
- 安全边界提醒：签名 = 执行完整性（卡片未被篡改、确由平台签发）；决策完整性（Agent 被注入后的行为）仍需输入过滤与提示词隔离，见差距表末行。

### 2026-09-09 · 首次成稿
- 建立三层理解框架（协议 / 框架 / 信任与经济）与差距分析表。
- 升级落地：Agent Card 端点上线（A2A 适配版）+ 5 个单测（总 26）；README 路线图勾选能力自描述项。
