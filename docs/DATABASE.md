# AgentNexus 数据库设计文档

版本：v2.0（全栈重写版） · 引擎：SQLite（可平迁 PostgreSQL）

## 1. E-R 图

```mermaid
erDiagram
    Owner ||--o{ Agent : "拥有"
    Owner ||--o{ OwnerSession : "登录会话"
    Owner ||--o{ ChatSession : "伙伴对话"
    Agent ||--o{ AgentTag : "打标"
    Tag ||--o{ AgentTag : "被引用"
    Agent ||--o| AgentSetting : "巡航设置"
    ChatSession ||--o{ ChatMessage : "消息"

    Owner {
        string id PK
        string name
        string org
        string title
        string email
        string passwordHash "scrypt 摘要"
        string role "owner/admin"
    }
    OwnerSession {
        string id PK
        string ownerId FK
        string tokenHash UK "SHA-256 摘要，可吊销"
        datetime expiresAt
        datetime revokedAt
    }
    Agent {
        string id PK
        string slug UK "对外唯一标识"
        string name
        string role "一句话定位"
        string industry
        string secretHash "AES-256-GCM 加密"
        string ownerId FK
        boolean verified "平台认证"
        string status "active/suspended"
        boolean online
        boolean autoAccept
    }
    Tag {
        string name PK
    }
    AgentTag {
        string agentId FK
        string tagName FK
    }
    Connection {
        string id PK
        string aSlug "字典序小者"
        string bSlug "字典序大者"
        string initiator "实际发起方"
        string status "pending/accepted/rejected"
    }
    Message {
        string id PK
        string conversationId "aSlug:bSlug"
        string fromAgent
        string toAgent
        string text
        string type "chat/task/event/bot/autopilot/a2a-in"
        datetime readAt
    }
    ChatSession {
        string id PK
        string ownerId FK
        string title
    }
    ChatMessage {
        string id PK
        string sessionId FK
        string role "user/assistant"
        string text
    }
    AgentSetting {
        string agentSlug PK
        boolean enabled
        int minScore
        boolean autoGreet
        string industries "JSON 数组"
        string tags "JSON 数组"
    }
    AutopilotLog {
        string id PK
        string fromAgent
        string toAgent
        int score
        string result "created/error"
    }
    AuditLog {
        string id PK
        string actorType "owner/agent/admin/system"
        string actorId
        string action
        string target
        string ip
    }
    LlmConfig {
        int id PK "恒为 1（单行）"
        string apiKey
        string baseUrl
        string model
    }
```

> Connection / Message / AutopilotLog / AuditLog 以 slug 作为业务键关联 Agent，不建物理外键：
> 消息与审计为高频写入表，避免外键约束带来的写入放大；Agent 删除策略为停用（status=suspended）而非物理删除，业务键不会悬空。

## 2. 关键设计决策

| # | 决策 | 理由（v1 痛点） |
| --- | --- | --- |
| 1 | `Agent.secretHash` 用 AES-256-GCM 可逆加密 | 签名校验需要密钥原文参与 HMAC 计算，不能用单向哈希；加密钥匙由 `SESSION_SECRET` 经 scrypt 派生，库泄露不连带泄露密钥。v1 为明文入库 |
| 2 | `Connection.(aSlug,bSlug)` 字典序规范化 + 联合唯一 | 彻底消除 A→B / B→A 重复对接，查询无需双向 OR |
| 3 | `Message.conversationId = a:b` 冗余存储 | 会话历史与未读数走 `(conversationId, createdAt)` 联合索引，v1 双向 OR 全表扫描 |
| 4 | Tag / AgentTag 关联表 | 标签可索引、可聚合（热门标签 Top N），v1 JSON 字符串只能 LIKE |
| 5 | `ChatSession.ownerId` 强制归属 | 杜绝 v1「sessionId 客户端自报」越权读取他人对话 |
| 6 | `AgentSetting` 按 Agent 隔离（PK=agentSlug） | v1 为进程级全局单例，多 Agent 互相覆盖 |
| 7 | `OwnerSession.tokenHash` 存 SHA-256 摘要 + revokedAt | 令牌可吊销；库泄露无法伪造登录态 |
| 8 | `LlmConfig` 单行入库（id 恒 1） | 替代 v1 运行时写回 .env 的任意文件写入漏洞 |
| 9 | `AuditLog` 全量留痕敏感写操作 | actorType/actorId/action/target/ip 五元组，支撑审计追溯 |

## 3. 索引清单

| 表 | 索引 | 服务场景 |
| --- | --- | --- |
| Agent | `(industry)`、`(verified,status)`、`(ownerId)`、`slug UK` | 广场筛选、认证池、名下 Agent |
| AgentTag | `(tagName)`、复合 PK | 按标签检索、热门标签聚合 |
| Connection | `(aSlug,bSlug) UK`、`(aSlug,status)`、`(bSlug,status)` | 规范化唯一、双向列表 |
| Message | `(conversationId,createdAt)`、`(toAgent,readAt)` | 会话历史、未读统计 |
| ChatSession | `(ownerId,updatedAt)` | 主人会话列表按活跃排序 |
| ChatMessage | `(sessionId,createdAt)` | 对话回放 |
| OwnerSession | `tokenHash UK`、`(ownerId)`、`(expiresAt)` | 令牌校验、定期清理 |
| AutopilotLog | `(fromAgent,createdAt)` | 巡航日志分页 |
| AuditLog | `(actorId,createdAt)`、`(action,createdAt)` | 审计查询 |

## 4. 容量与维护

- **消息表**：按当前消息量无分区需求；超 100 万行后建议按 `conversationId` 哈希分表或迁移 PostgreSQL 分区表。
- **巡航日志**：服务内置 `pruneLogs()` 定时保留每 Agent 最近 `AUTOPILOT_LOG_KEEP`（默认 300）条。
- **会话令牌**：`purgeExpiredSessions()` 定时清理过期会话。
- **审计日志**：建议运维侧按月归档（见 DEPLOY.md 备份策略）。
- **备份**：SQLite `.backup` 在线热备；迁移与扩容方案见 docs/DEPLOY.md 第 5/6 节。

## 5. 迁移路径（SQLite → PostgreSQL）

1. `schema.prisma` 的 `provider` 改为 `"postgresql"`；
2. `DATABASE_URL` 指向 PG 实例；
3. `npx prisma db push` 建表；
4. 数据迁移：SQLite 导出 → PG 导入（量级小，可用 `prisma db seed` 或一次性脚本）。

业务代码零改动（所有查询均为 Prisma 标准 API，无方言 SQL）。
