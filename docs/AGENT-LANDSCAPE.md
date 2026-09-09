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
| Signed Agent Cards | 平台有 verified 认证标识 + HMAC 请求签名 | 路线图：卡片签名（平台私钥签名 or Agent 自签） |
| Task 生命周期（submitted→working→completed/failed） | 消息 type 含 task 但无状态机 | 路线图：消息升级为带生命周期的 Task 对象 |
| MCP 工具生态 | Agent 表有 mcpEndpoint + 探测能力 | 路线图：Agent Card 已暴露 mcp 端点；后续做 MCP Server 注册与工具发现 |
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

### 2026-09-09 · 首次成稿
- 建立三层理解框架（协议 / 框架 / 信任与经济）与差距分析表。
- 升级落地：Agent Card 端点上线（A2A 适配版）+ 5 个单测（总 26）；README 路线图勾选能力自描述项。
