# 开发计划：MCP Server 注册与工具发现 → Task 状态机

> 来源：`docs/AGENT-LANDSCAPE.md` 差距分析表 2026-09-21 两项 P1 上调（周报第 3 期）。
> 编制日期：2026-09-21。状态：**已评审通过**（决策 D1–D5 定稿）· 阶段 1 / A1 已启动，受阻于下方「§零 前置阻塞」。
> 约束：不执行 `git push`；阶段完成后由用户确认再进入下一阶段。

---

## 零、阶段 0 前置阻塞（2026-09-21 发现 → **当日已解除**）

**诊断：仓库曾处于「SQLite 迁移做到一半」的中间态，数据库操作全部失败。该阻塞与 A1 新增模型无关。**

### 事实与证据（留存备查）

1. **工作区存在上一轮未提交改动**（`git status`）：`server/prisma/schema.prisma`、`server/src/index.ts`、`server/src/lib/knowledge.ts`、`server/src/modules/admin/routes.ts` 为 M，`server/src/lib/backup.ts` 为未跟踪新文件。
2. **`schema.prisma` 的未提交改动把 provider 从 `postgresql` 改为 `sqlite`**：`git diff` 显示 `-provider = "postgresql"` / `+provider = "sqlite"`，同时把 `FaqEntry.keywords` / `ProductEntry.keywords` 由 PG 原生 `String[]` 改为 `String`（JSON 字符串）。
3. **但 `.env` 仍指向 Neon 云 PostgreSQL**：`DATABASE_URL="postgresql://neondb_owner:***@ep-red-lab-...neon.tech/neondb?sslmode=require"`。provider 与 URL 协议不匹配。
4. **实测报错**（只读命令，未触库）：
   ```
   $ node node_modules/prisma/build/index.js validate --schema prisma/schema.prisma
   Error: P1012  Error validating datasource `db`: the URL must start with the protocol `file:`.
   -->  prisma\schema.prisma:25   provider = "sqlite" / url = env("DATABASE_URL")
   ```
5. **连带影响**：`prisma db push` / `prisma generate` / 依赖数据库的测试与服务启动**当前均不可用**；`core/config.ts` 会 `dotenv.config()` 加载该 `.env`，因此 `tests/pg-integration.test.ts` 一旦条件成立会**直连云库写入**（该用例会创建/删除 Owner 记录）——在未确认前**禁止运行全量测试**。

### 裁决结果（2026-09-21）：**方案 1 已执行，阻塞解除**

用户选择方案 1（本地开发用 SQLite）。执行中发现**部署侧本就是 SQLite**（`docker-compose.yml` 设 `DATABASE_URL: "file:/data/agenthub.db"`，`server/Dockerfile` 的 CMD 为 `npx prisma db push && npx tsx src/index.ts`），故 `provider = "sqlite"` 正是本项目的规范配置，**无需引入 `prisma.config.ts` 或双 schema**；PostgreSQL 仅保留为 DEPLOY.md §1 描述的横向扩展可选路径。

| 动作 | 结果 |
| --- | --- |
| `.env` 的 `DATABASE_URL` 改为 `file:./dev.db` | 已完成；原 Neon PG 连接串以注释保留（供可选扩展路径使用），凭证未丢失 |
| `prisma validate` | ✅ 通过（原 P1012 错误消失） |
| 迁移前风险核查 | 本地 `dev.db` 已是**含数据的演示库**（21 表、Owner=32、Agent=27、GroupTask=2，创建于 2026-09-11）；`Owner.email` **无重复值**，故新增唯一约束安全 |
| 备份 | `prisma/dev.db.bak-20260921`（360448 字节，与源一致） |
| `prisma db push --accept-data-loss` | ✅ `Your database is now in sync`；新增 4 表、**0 表删除**（McpServer / McpTool + 本地库缺失的 FaqEntry / ProductEntry） |
| `prisma generate` | ✅ Prisma Client v6.19.3 重新生成 |
| 全量测试 | ✅ **49 通过 / 2 跳过 / 0 失败**（`pg-integration` 因 DATABASE_URL 非 PG 而按设计跳过） |
| `tsc --noEmit` | ✅ 0 错误 |

> 遗留提醒：本地库中的 `dev.db.bak-20260921` 为一次性备份，确认无恙后可删除；`.env` 已不再指向云库，`tests/pg-integration.test.ts` 默认跳过。

### 原待裁决选项（已按方案 1 决策，保留备查）

| 方案 | 做法 | 代价 / 风险 |
| --- | --- | --- |
| **方案 1（已采用）本地开发用 SQLite** | `.env` 的 `DATABASE_URL` 改为 `file:./dev.db`，保持 provider=`sqlite`；本地零依赖开发 | 已确认与容器部署一致，无 provider 双态问题 |
| 方案 2 回退为 PostgreSQL | `provider` 改回 `postgresql`，对 Neon 库执行增量 `db push` | 未采用：本地直连云库延迟高；测试会命中真实库 |

---

## 一、现状核实（计划的事实基础）

编码前已核对仓库真实实现，以下结论决定了「哪些是新建、哪些是复用」：

### 1.1 MCP 侧：**已有一半地基，缺「持久化与发现」**

| 已有能力 | 位置 | 说明 |
| --- | --- | --- |
| Agent 可声明 MCP 端点 | `Agent.mcpEndpoint`（Prisma）+ `registerAgentSchema` / `updateAgentSchema`（zod，url ≤ 300） | 字段与入参校验已就绪 |
| **MCP Client 探测** | `POST /api/mcp/probe` → `system/service.ts: probeMcpServer()` | 基于 `@modelcontextprotocol/sdk` 的 `StreamableHTTPClientTransport`，可拉取 `listTools()` / `listResources()` |
| SSRF 防护 | `assertSafeProbeUrl()` | 协议白名单 http/https；生产环境拒绝 localhost 与 RFC1918 内网段 |
| 卡片暴露 MCP 端点 | `lib/agent-card.ts` → `endpoints.mcp` | mcpEndpoint 存在时自动写入 |

**缺口（本次要补的）**：探测结果**用完即弃**——无 `McpServer` 表、无工具持久化、无跨 Server 的发现/检索接口、无工具调用授权模型、无健康度与重探测生命周期、审计仅有 `mcp.probe`。

### 1.2 Task 侧：**已有可复用的状态机雏形，缺「平台级 Task 对象」**

| 已有能力 | 位置 | 说明 |
| --- | --- | --- |
| **迁移表已存在** | `groups/service.ts:275` `TASK_TRANSITIONS` | `open → [working, done, failed]`；`working → [done, failed]`；`done` / `failed` 为终态 |
| 状态流转接口 | `PATCH /api/groups/:gid/tasks/:taskId`，zod enum `["open","working","done","failed"]` | 鉴权：仅创建者或被指派人；写审计 `group.task.status` |
| 群内任务分派 | `groups/service.ts` 群消息解析 + `GroupTask`（`taskCode` 唯一） | 已有真实业务入口 |
| 消息类型含 task | `MESSAGE_TYPES = ["chat","task","event"]` | 但**无生命周期**，`type=task` 只是一条普通消息 |

**缺口**：① 状态集与 A2A 不一致（缺 `submitted / input-required / auth-required / canceled / rejected`）；② 无状态事件时间线；③ 无 `contextId` 归组；④ Agent Card 已对外声明 `capabilities.stateTransitionHistory: true`，但 1:1 会话任务**尚未兑现该承诺**（对外声明与实现存在不一致，属需要收敛的隐患）。

### 1.3 A2A v1.1 的 Task 口径（字段设计依据）

- **状态 8 态**：`submitted` → `working` → `completed` / `failed` / `canceled` / `rejected`，其间可暂停为 `input-required` / `auth-required`（等待外部输入或授权）。
- **终态集合**：`completed` / `failed` / `canceled` / `rejected` —— 终态不可重启，续做须以**同一 contextId** 发新消息。
- **事件模型**：`TaskStatusUpdateEvent`（首事件为 Task、末事件 `final: true`）与 `TaskArtifactUpdateEvent`（支持 `append` / `lastChunk` 分块）。
- **v1.1 演进重点**：task timeline 规范细化、事件过滤标准化、working 态收到消息的处理指引 —— 故本计划的字段必须**预留兼容位**。

---

## 二、执行顺序与依赖关系

**结论：MCP 先行，Task 后置；两条工作流的真正耦合点只有一个 —— Task 若需引用「具体 MCP 工具」作为执行手段，则需等 A3 产出工具标识约定。核心 Task 状态机本身不依赖 MCP。**

```
阶段 1（MCP 主干，串行关键路径）
  A1 数据模型 ──► A2 注册管理 API ──► A3 工具发现与检索
                                          │
阶段 2（并行）                             │ 产出「工具标识约定」
  A4 权限与审计 ──┐                       │
  B1 状态枚举与迁移函数 ──► B2 Task/事件模型 ◄──┘（仅 metadata 扩展位依赖）
                                          │
阶段 3（Task 主干，串行）                  │
  B3 Task API ──► B4 事件流广播 ──► B5 兼容收敛 ──► B6 回归验收
                                          │
阶段 4（统一验收）                          ▼
  A5 + B6 联合演练：一次真实「发现工具 → 派发任务 → 状态流转 → 事件回放」闭环
```

### 依赖矩阵

| 任务 | 强依赖（阻塞） | 弱依赖（可并行但需约定） | 阻塞下游 |
| --- | --- | --- | --- |
| A1 数据模型 | 无 | — | A2 / A3 / A4 |
| A2 注册管理 API | A1 | — | A3 |
| A3 工具发现与检索 | A2 | — | B2（工具标识） |
| A4 权限与审计 | A1 / A2 | — | A5 |
| B1 状态枚举与迁移函数 | 无（**可与阶段 1 并行**） | — | B2 / B3 |
| B2 Task / TaskEvent 模型 | B1 | A3（工具引用字段） | B3 / B4 |
| B3 Task API | B2 | — | B4 / B5 |
| B4 事件流广播 | B3 + 现有 realtime 通道 | — | B6 |
| B5 GroupTask 兼容收敛 | B3 | — | B6 |
| B6 回归验收 | A5 / B4 / B5 | — | 阶段 4 |

**关键路径**：`A1 → A2 → A3 → B3 → B4 → B6`。B1/B2 若在阶段 1 期间并行开发，可压缩整体串联长度。

---

## 三、范围定义

### 3.1 工作流 A —— MCP Server 注册与工具发现（P1）

**前置条件已就绪的核验结论**：MCP Client 探测、SSRF 防护、Agent.mcpEndpoint 字段与卡片暴露均已存在，本次为「在既有地基上补持久化与发现层」，无需引入新依赖。

| 编号 | 范围 | 交付物 | 工作量 |
| --- | --- | --- | --- |
| **A1** | 数据模型：新增 `McpServer`（`agentSlug` + `shared` + url、transport、加密鉴权头、status、lastProbeAt / lastProbeOk / lastError、toolCount、时间戳）与 `McpTool`（serverId、name、description、inputSchema、enabled、discoveredAt）；`Agent.mcpServers` 反向关系；仅用跨库通用类型（不引入 PG 原生数组） | 迁移 + `DATABASE.md` 增补 | S |
| **A2** | 注册与管理 API：`POST /api/mcp/servers`（复用 `assertSafeProbeUrl` 与 `probeMcpServer` 做接入前连通性自检）、`GET /api/mcp/servers`、`GET /:id`、`PATCH`、`DELETE`（软删）、`POST /:id/refresh`（重探测 + 工具 upsert 去重）；鉴权复用 `assertCanManageAgent` 三身份语义（Agent 本人 / 主人 / 管理员） | 路由 + 服务 + schema | M |
| **A3** | 工具发现与检索：`GET /api/mcp/tools?q=&serverId=&agent=&page=`（支持模糊检索，复用 `listAgents` 的 `and/or` 组装范式）；工具入参 schema 摘要化返回；Agent Card 只暴露 `endpoints.mcpServers` 与工具**计数**，不暴露入参 schema（防能力侧信息泄露）；**产出「工具标识约定」交付给 B2** | 路由 + 服务 + `agent-card.ts` 扩展 | M |
| **A4** | 权限与审计：工具可见性/可调用性模型（默认仅所属 Agent 可调用，跨 Agent 调用留二期）、审计 action 规范化为 `mcp.server.create / .refresh / .delete`、`mcp.tool.list` | 权限判定 + 审计埋点 | S |
| **A5** | 测试与验收：SSRF 拒绝、重复注册幂等、探测失败降级（`lastProbeOk=false` 不影响已注册数据）、工具 upsert 去重、卡片含 `mcpServers` 计数 | `tests/mcp-registry.test.ts` | M |

**明确不做（范围外）**：① 平台侧**代理执行** MCP 工具调用（二期）；② 实现 MCP Server（我们是 Client 侧，非 Server）；③ OAuth 2.1 动态注册与 PKCE（二期，本期支持静态鉴权头）；④ MCP Resources 的持久化（本期只持久化 tools）。

### 3.2 工作流 B —— Task 状态机（P1，按 A2A v1.1 草案设计字段）

**设计原则：不推翻已有的 `TASK_TRANSITIONS`，而是把它泛化为平台级 Task 状态机，并补齐 A2A 语义。** `GroupTask` 保留原接口（向后兼容），平台级 `Task` 承担 1:1 会话与 A2A 入站任务。

| 编号 | 范围 | 交付物 | 工作量 |
| --- | --- | --- | --- |
| **B1** | 状态枚举与迁移函数（`lib/task-state.ts`）：A2A 8 态定名；`TERMINAL_STATES = {completed, failed, canceled, rejected}`；迁移表 `submitted → [working, canceled, rejected]`、`working → [completed, failed, canceled, input-required, auth-required]`、`input-required / auth-required → [working, canceled]`、终态 → `[]`；导出 `canTransition(from, to)` 与 `toA2aLegacy()`（`open→submitted`、`done→completed` 映射，供 GroupTask 复用） | 纯函数模块 + 单测 | S |
| **B2** | 数据模型：`Task`（taskCode、contextId、conversationId、creatorSlug、assigneeSlug、groupId?、title、status、statusMessage、source: chat / group / a2a、completedAt / canceledAt、metadata JSON —— 预留 A2A v1.1 兼容位与工具引用）与 `TaskEvent`（taskId、kind: `status-update` / `artifact-update`、state、message、final、**seq 单调序号**、createdAt）；`contextId` 与既有 `Message.conversationId` 复用同一归组语义 | 迁移 + 模型注释 | M |
| **B3** | Task API：`POST /api/tasks`（**升级路径**：`type=task` 的消息自动落一条 Task，保持既有调用方不破）、`GET /api/tasks/:id`（含事件时间线）、`GET /api/tasks?assignee=&status=&contextId=&page=`、`PATCH /api/tasks/:id/status`（校验走 B1 迁移表，非法流转报错文案沿用现网风格）、`POST /api/tasks/:id/cancel` | 路由 + 服务 + schema | M |
| **B4** | 事件流广播：复用现有 realtime（WebSocket / 一次性票据）通道，广播 `task-status-update` 与 `artifact-update`；事件序列契约保证「首事件即 Task、末事件 `final: true`」；同时兑现 Agent Card 中 `capabilities.stateTransitionHistory: true` 的对外声明 | 广播 + 事件契约测试 | M |
| **B5** | 兼容与收敛：`GroupTask` 与 `Task` 的关系裁决 —— 本期**并行**（`GroupTask` 保留，`Task` 作为平台级对象），并在 `DATABASE.md` 记录「二期是否将 GroupTask 收敛为 `Task` 的 `groupId` 视图」的待决项；确保群任务与 1:1 任务状态语义一致（共用 B1 迁移函数） | 决策记录 + 一致性改造 | S |
| **B6** | 测试与验收：非法流转拒绝、终态不可重启（须校验同 `contextId` 发新任务）、事件顺序与 `seq` 单调、审计 `task.create / task.status` 落地、既有群任务用例回归（`tests/groups.test.ts` 不得回归） | `tests/task-state-machine.test.ts` | M |

**明确不做（范围外）**：① SSE 完整替代 WebSocket（本期复用既有 realtime 通道，SSE 端点二期）；② `auth-required` 态的完整鉴权协商流程（本期只落状态位与事件，不做凭证协商）；③ 跨平台的 Task 委派（A2A 出站任务）；④ 前端 UI 改造（本期只交付 API 与事件契约，前端随二期）。

---

## 四、关键决策点（**已定稿** 2026-09-21）

> 用户已全部拍板，以下为冻结结论，编码以此为准：
> **D1 绑定 Agent + 可标记共享** · **D2 仅所属 Agent 可调用** · **D3 本期并行、二期收敛** · **D4 A2A 八态 + 内部兼容映射** · **D5 只暴露计数与端点**

| # | 决策 | 已定稿结论 | 落实位置 |
| --- | --- | --- | --- |
| D1 | MCP Server 归属 | **绑定 Agent + `shared` 可标记共享** | `McpServer.agentSlug`（FK）+ `McpServer.shared`；A2/A4 实现共享可见性 |
| D2 | 工具调用授权 | **仅所属 Agent 可调用**（跨 Agent 留二期） | A4 权限判定；`McpTool.enabled` 为开关位 |
| D3 | `GroupTask` 是否并入 `Task` | **本期并行、二期收敛** | B5 共用 B1 迁移函数，群任务接口不动 |
| D4 | 状态命名 | **直接用 A2A 八态**，内部以 `toA2aLegacy()` 兼容 `open`/`done` | B1 `lib/task-state.ts` |
| D5 | Agent Card 是否暴露工具清单 | **只暴露端点与工具计数**（不入参 schema） | A3 卡片扩展；`McpServer.toolCount` |

---

## 五、风险与缓解

| 风险 | 影响 | 缓解措施 |
| --- | --- | --- |
| A2A v1.1 未正式发布，字段可能再变 | Task 字段返工 | B2 的 `metadata` 设计为 JSON 兼容位；事件模型只锁「首事件 / 末事件 / final」三条最小契约，不锁细节字段 |
| MCP 探测是 SSRF 面 | 安全事件 | 复用 `assertSafeProbeUrl` 并在 A2 强制前置；`refresh` 与首次注册走同一校验路径；鉴权头加密入库（复用 `lib/crypto.ts`） |
| `refresh` 探测超时（现为 12s）阻塞请求 | 接口响应劣化 | 一期保持同步探测 + 明确超时错误码；异步任务化列入二期待决项 |
| 100+ 市场 Server 的工具量导致检索变慢 | 发现体验 | `McpTool` 建 `(serverId, name)` 索引，检索走索引；分页上限 100（对齐 `listAgents`） |
| Agent Card 声明与实现不一致 | 生态可信度 | B4 完成后即兑现 `stateTransitionHistory`；若 B4 延后，须先从卡片声明中撤下该能力位 |
| 群任务回归被破坏 | 现网功能受损 | B5 强制共用 B1 迁移函数，B6 必跑 `tests/groups.test.ts` 全量回归 |

---

## 六、阶段完成标准（DoD）与验证证据

每个阶段收尾必须提交**可验证证据**，不接受口头完成：

| 阶段 | DoD | 验证证据 |
| --- | --- | --- |
| 阶段 1（A1–A3） | MCP Server 可注册、可刷新、可跨 Server 检索工具 | ① `npm run typecheck` 通过；② 新增单测通过；③ 真实探测一次公开 MCP Server 的 curl 输出（含工具数）；④ Agent Card 返回含 `endpoints.mcpServers` |
| 阶段 2（A4 + B1/B2） | 权限闭环 + 状态机纯函数 + Task/事件表落地 | ① 非法流转单测拒绝；② `db push` 成功且旧数据无损；③ 三身份鉴权矩阵手测记录 |
| 阶段 3（B3–B5） | Task API 全链路 + 事件流 + 群任务零回归 | ① 全量 `npm test`（现基线 31 用例）全绿；② 事件序列抓包（首事件/末事件/final）；③ `tests/groups.test.ts` 回归通过 |
| 阶段 4（A5 + B6） | 端到端闭环演练 | 一次完整演练：注册 MCP Server → 发现工具 → 派发 Task → 状态流转至终态 → 事件时间线回放 → 审计日志核对 |

---

## 七、提交与推进纪律

1. 分阶段提交，**commit 粒度 = 阶段内单任务**（A1/A2/A3…），便于回滚定位。
2. 每阶段结束后**暂停并汇报证据**，由用户确认后再进入下一阶段；`git push` 仅在用户明确指示后执行。
3. 文档同步：`docs/API.md`（新端点）、`docs/DATABASE.md`（新表）、`docs/AGENT-LANDSCAPE.md`（差距表两行状态由 P1 更新为已落地）。

---

## 八、执行进度

| 阶段 | 任务 | 状态 | 证据 / 备注 |
| --- | --- | --- | --- |
| 阶段 0 | 环境前置（provider 与 DATABASE_URL 对齐） | ✅ **已完成（方案 1）** | 见 §零；`.env` → `file:./dev.db`；validate 通过；备份 `dev.db.bak-20260921` |
| 阶段 1 | A1 数据模型 | ✅ **已完成** | `McpServer` / `McpTool` / `Agent.mcpServers` 已建表（新增 4 表、0 删除）；冒烟验证：写入读回 ✓、`(agentSlug,url)` 与 `(serverId,name)` 唯一键拒绝重复 ✓（P2002）、删 Agent 级联清空工具 ✓；全量测试 49 通过 / 0 失败；typecheck 0 错误 |
| 阶段 1 | A2 注册与管理 API | 未开始 | 下一步 |
| 阶段 1 | A3 工具发现与检索 | 未开始 | — |
| 阶段 2 | A4 权限与审计 | 未开始 | — |
| 阶段 2 | A5 测试与验收 | 未开始 | — |
| 阶段 2 | B1 状态机纯函数 | 未开始 | — |
| 阶段 2 | B2 Task 与事件模型 | 未开始 | — |
| 阶段 3 | B3 → B4 → B5 | 未开始 | — |
| 阶段 4 | B6 回归验收 + 联合演练 | 未开始 | — |
