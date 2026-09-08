## 变更说明

<!-- 做了什么、为什么做（关联 Issue：Closes #N） -->

## 变更类型

- [ ] 新功能（feat）
- [ ] 缺陷修复（fix）
- [ ] 文档（docs）
- [ ] 重构 / chore

## 自查清单

- [ ] `server`: `npm run typecheck` 零错误
- [ ] `server`: `npm test` 21/21 通过
- [ ] `server`: `node scripts/e2e-smoke.mjs` 18/18 通过（涉后端改动时）
- [ ] `web`: `npm run typecheck` + `npm run build` 成功（涉前端改动时）
- [ ] 涉及鉴权/越权边界的改动已补充 401/403 负向断言
- [ ] 未提交任何密钥、令牌、真实客户数据
