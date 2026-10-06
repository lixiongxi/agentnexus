# 个人端改造设计方案（注册登记 → 发布个人 Agent → 需求匹配）

> 版本 v1.0 · 2026-10-07 · 状态：待确认后实施
> 关联：`docs/DESIGN-SKILL-MARKET.md`（技能撮合网络，本方案为其「个人端」收敛版）

---

## 0. 结论摘要

**改造本质**：把平台从「企业内部 Agent 通讯录 + 协作」转为**「个人 AI 能力交易网络」** —— 个人用户注册登记后，
发布一个承载自身能力的 Agent（写清"我能提供什么服务"），当他人发布需求时，系统按**已完成案例 + 能力标签**排序撮合。
原企业端能力（组织架构、企业助理知识库 FAQ/产品库、自主巡航、企业认证）**整体下线**；
技术底座（HMAC 签名身份、Agent Card、消息、实时通道、任务状态机、备份体系）**全部复用**。

**三个核心变化**：
1. **主体**：企业 → 个人（字段从「公司/职务/行业」改为「昵称/擅长领域/个人简介」）
2. **Agent 语义**：企业客服（知识库应答）→ **个人能力名片**（服务清单 + 案例墙）
3. **匹配逻辑**：标签相似 → **案例优先**（已完成案例的数量、质量、与需求的同类相关性决定排序）

---

## 1. 改造范围：四色清单

### 1.1 删除（企业端专属，下线）

| 对象 | 位置 | 处理 |
| --- | --- | --- |
| 企业组织字段 | `Owner.org`（必填）、`Owner.title` | 删除字段，改为个人向字段（§5.1） |
| 企业行业/认证语义 | `Agent.industry`、`Agent.verified`（企业认证白名单） | 移除 `verified` 的「企业认证」语义；`industry` 改为「擅长领域」（自由标签） |
| 企业助理知识库 | `modules/assistants/*`、`AssistantProfile`、`FaqEntry`、`ProductEntry` | 整体下线（个人端不做 FAQ/产品库；能力由「服务项 + 案例」表达） |
| 自主巡航 | `modules/autopilot/*`、`AgentSetting`、`AutopilotLog` | 整体下线（企业 AI 运营功能，个人端无意义） |
| 企业群协作 | `modules/groups/*`、`AgentGroup*` 系列表 | 下线（个人端撮合为 1v1 订单制，不做多企业群） |
| 管理后台企业视图 | `modules/admin`（企业审核/企业统计） | 收敛为最小运维端点（备份/健康），删除企业审核逻辑 |
| Web 页面 | `FactoryPage`（工厂/企业助理配置）、`GroupsPage`、`GroupChatPage`、`ContactsPage`（企业通讯录语义） | 删除或改造为个人端等价页 |
| 交付文档 | README/FAQ 中企业向描述 | 同步改写为个人端 |

### 1.2 保留复用（技术底座，零改动或极小改动）

| 能力 | 复用方式 |
| --- | --- |
| Agent 签名身份（HMAC + Ed25519 名片 + JWKS） | 原样保留（个人身份同样需要可验证） |
| Agent Card / 名片页 | 字段语义改写为个人能力名片 |
| 单聊消息 + 实时通道（WS 票据） | 原样保留（需求沟通主通道） |
| 连接（Connection） | 保留为「已建立合作/已接洽」关系 |
| 任务状态机（`TASK_TRANSITIONS`） | **复用为订单状态机**（open→working→done/failed） |
| 每日快照 + 启动自愈 + 管理备份端点 | 原样保留 |
| 小程序 / Flutter 客户端 | 复用，调整入口与文案 |
| LLM 配置（LlmConfig） | 复用（能力/需求文本结构化抽取） |

### 1.3 改造（保留骨架，语义替换）

| 对象 | 改造 |
| --- | --- |
| `Owner` | 个人登记信息：`displayName`（昵称）、`email`、`city`、`bio`；删除 `org/title` |
| `Agent` | 个人 Agent：`ownerId` 1:1（一人一 Agent，个人端收敛）、`services`（服务清单）、`cases`（案例） |
| 广场（Square） | 从「企业 Agent 发现」→ **「人才/能力广场」**（按能力标签检索个人 Agent） |
| 动态（Moments） | 语义从「企业动态」→ **「案例/接单动态」**（完成订单自动生成案例动态） |
| 名片页 | 从「企业名片」→ **「个人能力名片」**（服务项 + 案例墙 + 评价） |

### 1.4 新增（个人端核心）

| 新增 | 说明 |
| --- | --- |
| 注册登记页 | 首次进入的引导页（个人向字段） |
| 发布 Agent 页 | 描述「我能提供什么服务」（服务项 + 能力标签 + 案例 + 报价/交付方式） |
| 需求发布页 | 需求方填写「我需要什么」（需求描述 + 所需能力标签 + 预算 + 期限） |
| 需求大厅 | 需求列表（个人 Agent 视角：可接的需求） |
| 匹配结果页 | 需求方视角：按案例与能力排序的候选 Agent 列表（含排序理由） |
| 订单页 | 应征/邀请 → 建单 → 状态流转 → 交付确认 |
| 评价与案例沉淀 | 完成后互评 → 自动沉淀为「已完成案例」→ 反哺排序权重 |
| 案例表 `ServiceCase` | 已完结合同沉淀的案例（含能力标签、评分、时间） |

---

## 2. 完整功能流程（端到端闭环）

```
┌──────────────────────────────────────────────────────────────────────┐
│ 阶段 1：注册登记（一次性，门禁式引导）                                  │
│   打开站点 → 未登记 → 强制跳转「注册登记页」                            │
│   填写：昵称 / 邮箱 / 城市 / 擅长领域（多选标签）/ 一句话简介             │
│   → 提交 → 创建个人账号（Owner）+ 自动生成 Agent 骨架（未发布状态）        │
└───────────────────────────┬──────────────────────────────────────────┘
                            ↓ 自动跳转
┌──────────────────────────────────────────────────────────────────────┐
│ 阶段 2：发布个人 Agent（能力声明）                                      │
│   填写：Agent 名称 / 头像 emoji / 一句话定位                            │
│        服务清单（服务名 + 能力标签 + 交付物 + 报价区间 + 交付周期）        │
│        历史案例（可选，可后补）：案例标题 + 关联能力 + 简述 + 时间         │
│   → 发布 → Agent 状态 draft → published；广场/能力检索可见               │
└───────────────────────────┬──────────────────────────────────────────┘
                            ↓
        ┌───────────────────┴────────────────────┐
        ↓                                        ↓
┌──────────────────────────┐        ┌──────────────────────────────┐
│ A 供给方视角（我是个人 Agent）│        │ B 需求方视角（我有活要外包）      │
│  · 需求大厅：浏览可接需求     │        │  · 发布需求（描述+所需能力标签+  │
│  · 我的能力表现：案例/评价    │        │    预算+期限）→ 落库             │
│  · 主动应征（apply）        │        │  · 系统即时匹配 → 匹配结果页      │
└───────────┬──────────────┘        │    （按案例+能力排序，含理由）     │
            │                        └───────────┬──────────────────┘
            │                                    │
            │                                    ↓
            │                    ┌──────────────────────────────┐
            │                    │ 匹配结果页：Top-N 候选 Agent    │
            │                    │ 展示：案例数/评分/同类案例/理由  │
            │                    │ 操作：邀请（invite）           │
            │                    └───────────┬──────────────────┘
            ↓                                    ↓
┌──────────────────────────────────────────────────────────────────────┐
│ 阶段 3：撮合成交                                                       │
│   应征 / 邀请 → 需求方确认 → 建订单（Order: active）                    │
│   → 自动建立 Connection + 打开单聊（需求沟通）                          │
└───────────────────────────┬──────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────────┐
│ 阶段 4：交付与确认                                                     │
│   订单状态机：active → delivered（供给方提交交付物）→ done（需求方确认）  │
│   复用现有 TASK_TRANSITIONS：open→working→done/failed                  │
└───────────────────────────┬──────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────────┐
│ 阶段 5：评价与案例沉淀（反哺排序的关键环节）                             │
│   双方互评（1-5 星 + 评语，双盲）                                       │
│   → 自动写入 ServiceCase（案例 = 完成订单的能力标签 + 评分 + 摘要）       │
│   → 更新 Agent 统计：completedCases / avgCaseRating / 各标签案例数      │
│   → 下次匹配时案例质量因子直接提升 → 「越做越多单」的正循环              │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. 页面结构与跳转逻辑

### 3.1 页面清单（个人端）

| # | 页面 | 路由 | 门禁 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 注册登记 | `/register` | 未登记必进 | 昵称/邮箱/城市/擅长领域/简介 |
| 2 | 发布 Agent | `/publish` | 已登记且未发布 | 服务清单 + 能力标签 + 案例 + 报价 |
| 3 | 能力广场 | `/square` | 已发布 | 检索个人 Agent（按能力标签） |
| 4 | 需求大厅 | `/demands` | 已发布 | 需求列表 + 筛选（能力/预算/期限） |
| 5 | 发布需求 | `/demands/new` | 已登记 | 描述需求 + 所需能力 + 预算 + 期限 |
| 6 | 匹配结果 | `/demands/:id/matches` | 需求方 | Top-N 候选 + 排序理由 + 邀请 |
| 7 | 我的订单 | `/orders` | 已登录 | 需求方/供给方双视角 |
| 8 | 订单详情 | `/orders/:id` | 双方 | 状态流转 + 交付确认 + 评价入口 |
| 9 | 个人能力名片 | `/card/:slug` | 公开 | 服务项 + 案例墙 + 评价 |
| 10 | 我的 | `/me` | 已登录 | 资料编辑 / Agent 编辑 / 退出 |

### 3.2 跳转逻辑（含门禁）

```
首次访问
  └─ /register（注册登记）
       └─ 提交成功
            └─ /publish（发布 Agent）
                 ├─ 发布成功 → /square（能力广场）
                 └─ 暂不发布 → /square（只读浏览，操作时提示先发布）

已登录用户
  ├─ /square ─→ /card/:slug（点开某人）
  ├─ /demands ─→ /demands/:id/matches（我发的需求看候选）
  │            └─ 邀请 → 生成 Order → /orders/:id
  ├─ /demands/new ─→ 提交 → /demands/:id/matches（立即出候选）
  └─ /orders/:id ─→ 交付/确认/评价 → 案例沉淀 → /card/:slug 可见

门禁规则（前端路由守卫 + 后端前置校验双保险）
  未登记（无 owner）→ 强制 /register
  已登记未发布 Agent → 允许浏览，禁止 应征/发布需求/发消息（提示先发布能力）
  已发布 → 全功能
```

---

## 4. 匹配排序规则（核心交付）

### 4.1 排序总分（案例优先）

```
Score = 100 × [ 0.40·案例质量 CaseScore
              + 0.30·能力匹配 SkillScore
              + 0.20·信誉信任 TrustScore
              + 0.10·活跃度 ActivityScore ]
```

> 与传统「标签相似度优先」的关键差异：**案例质量占最高权重（0.40）**，即「做过同类活且有口碑的人」排在「标签很像但没做过」的人前面。

### 4.2 因子定义

**① 案例质量 CaseScore（0.40，最高权重）**

```
CaseScore = 0.45 × 案例数量分  + 0.35 × 案例评分  + 0.20 × 案例相关性

案例数量分 = min(completedCases / 10, 1)          // 10 单封顶
案例评分   = avgCaseRating / 5                     // 0-5 星归一化
案例相关性 = 同能力标签案例数 / 总需求能力标签数      // ★「做过同类」的直接体现
             （例：需求要「AI视频 + 配音」；该 Agent 有 3 个 AI视频案例 → 相关性 = 1/2 = 0.5）
```

**② 能力匹配 SkillScore（0.30）**

```
SkillScore = 0.7 × 覆盖度 + 0.3 × 精确度
覆盖度 = |需求能力标签 ∩ Agent 能力标签| / |需求能力标签|     （同类目标签折算 0.6）
精确度 = |需求能力标签 ∩ Agent 能力标签| / |Agent 能力标签|
服务项交叉验证：需求能力命中 Agent 的「服务清单」时额外 ×1.1（封顶 1.0）
```

**③ 信誉信任 TrustScore（0.20）**

```
TrustScore = 0.6 × (reputation / 100)          // 平台信誉分（评价累计）
           + 0.4 × (1 - 取消率)                 // 1 - cancelled/(done+cancelled)
```

**④ 活跃度 ActivityScore（0.10）**

```
ActivityScore = exp(-daysSinceLastActive / 14)  // 14 天半衰期
```

### 4.3 冷启动与后置规则

| 规则 | 说明 |
| --- | --- |
| **新用户中性分** | `completedCases = 0` 时 `CaseScore = 0.45`（中性，不判死），避免「无案例永无曝光」 |
| **探索位** | Top-N 中固定 2 席给「案例 < 2 的新 Agent」（ε-greedy），保证新人可获得首批订单 |
| **认证与防刷** | 案例评分在「完成订单 ≥ 3」前仅展示、不参与权重计算（防互刷好评） |
| **硬过滤** | Agent 未发布 / 停接单 / 已被本需求拒绝 / 需求方本人 |
| **可解释** | 匹配结果页展示排序理由：「已交付 6 单同类案例 · 平均 4.8 星 · 能力匹配 100%」 |
| **同分打破** | 案例评分 → 完成时间近者 → 注册时间早者 |

### 4.4 排序示例（用于验收）

| Agent | 案例数 | 均分 | 同类案例 | 能力匹配 | 信誉 | 最终分 |
| --- | --- | --- | --- | --- | --- | --- |
| A（视频老手） | 12 | 4.8 | 3/3 全中 | 100% | 92 | **≈ 93.6** |
| B（标签相似新手） | 0 | — | 0 | 100% | 50（中性） | ≈ 55.4 |
| C（多面手） | 5 | 4.5 | 1/3 | 100% | 80 | ≈ 72.1 |

→ 排序 **A > C > B**：案例质量把「做过同类且口碑好」的 A 顶到最前，避免纯标签匹配把新手 B 排到前面。

---

## 5. 数据模型改造

### 5.1 个人向字段替换

```prisma
model Owner {                      // 个人用户（登记信息）
  id          String   @id @default(cuid())
  displayName String                 // 昵称（替代 name）
  // org / title 删除
  email       String?  @unique       // 保留唯一约束
  passwordHash String?
  city        String   @default("")  // 新增：所在城市
  bio         String   @default("")  // 新增：一句话简介
  domains     String   @default("[]")// 新增：擅长领域（JSON 数组，替代企业行业）
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  agent       Agent?                 // 个人端：一人一 Agent
}

model Agent {
  // 保留：slug / name / emoji / role / description / secretHash / online / autoAccept
  // 移除：industry（→ Domin + tags）、verified（企业认证语义）
  publishStatus String @default("draft")  // draft | published（新增门禁）
  serviceIntro  String @default("")       // 我能提供什么（自然语言）
  acceptingOrders Boolean @default(true)
  // 匹配统计（由 ServiceCase 汇总）
  completedCases Int   @default(0)
  avgCaseRating  Float @default(0)
  reputation     Float @default(0)
}

model AgentService {                 // 服务清单（替代企业产品库）
  id, agentSlug, title, tags(String JSON), deliverable, priceRange, cycleDays, sortOrder
}

model ServiceCase {                  // ★ 已完成案例（匹配排序的核心数据）
  id          String @id @default(cuid())
  agentSlug   String
  orderId     String?                 // 关联订单（平台内交付自动生成）
  title       String
  summary     String @default("")
  tags        String @default("[]")   // 案例能力标签（用于「同类案例」判定）
  rating      Int    @default(0)      // 需求方评分 1-5
  source      String @default("platform") // platform（订单沉淀）| manual（用户手动补充历史案例）
  completedAt DateTime @default(now())
  @@index([agentSlug])
}

model Demand {                       // 需求（替代原 Broadcast.demand）
  id, ownerSlug, title, content, tags(JSON), budget, deadline,
  status open|matched|closed, createdAt
}

model Order {                        // 订单（复用任务状态机语义）
  id, orderCode @unique, demandId?, demanderSlug, providerSlug,
  title, status active|delivered|done|cancelled, amount, createdAt, completedAt
}

model Review { id, orderId, fromSlug, toSlug, score, comment, createdAt
  @@unique([orderId, fromSlug]) }
```

### 5.2 待删除的表与模块

`AssistantProfile` / `FaqEntry` / `ProductEntry` / `AgentGroup` / `GroupMember` / `GroupMessage` / `GroupTask` / `AgentSetting` / `AutopilotLog` / `AgentMoment`+相关（动态视去留）→ 连同对应模块一并移除。

---

## 6. 实施分期

| 期 | 内容 | 验收 |
| --- | --- | --- |
| **P0-1** | 数据模型改造（个人向字段 + AgentService/ServiceCase/Demand/Order/Review）+ 删除企业端表与模块 | 迁移无损；`tsc` + 单测通过 |
| **P0-2** | **注册登记页 + 发布个人 Agent 页**（含后端接口） | 新用户走通「登记 → 发布 → 广场可见」 |
| **P0-3** | 需求发布 + 需求大厅 + 匹配引擎（四因子 + 案例优先） | 排序示例（§4.4）与实现一致 |
| **P0-4** | 订单闭环 + 评价 + 案例自动沉淀 | 端到端：发需求 → 匹配 → 成交 → 交付 → 评价 → 案例数 +1 → 排序提升 |
| P1 | 能力检索增强（关键词/领域筛选）、通知推送、名片案例墙 | — |
| P2 | 案例审核、认证徽章、语义匹配（embedding） | — |

---

## 7. 风险与对策

| 风险 | 对策 |
| --- | --- |
| 删除企业端造成数据丢失 | 迁移前全量快照（已有备份体系）；删除分两步（先下线入口 → 观测一版 → 再删表） |
| 存量企业数据（现有 36 个测试 Agent） | 提供一次性数据转换脚本：企业 Agent → 个人 Agent（org → displayName，industry → domains）或直接清库重来 |
| 无案例冷启动导致匹配无候选 | 新用户中性分 + 探索位；允许手动补充历史案例（source=manual） |
| 一人多 Agent 与一人一 Agent 的取舍 | 个人端默认一人一 Agent（简化门禁与匹配），数据模型保留 1:N 结构以便将来放开 |
