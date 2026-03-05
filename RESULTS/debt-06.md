# DEBT-06 交付结果

## 结论
- 已完成运行态占位引用清理（测试代码除外）。
- 已移除货柜域兼容链路，统一使用 `contractNo`。
- 已完成财务控制器服务化重构。
- 已新增后端付款幂等能力（`X-Idempotency-Key` + 唯一键重放）。

## 核心变更
- 新增: `backend/src/services/financeService.js`
- 新增: `backend/src/services/financeService.test.js`
- 重构: `backend/src/controllers/financeController.js`
- 幂等字段: `backend/prisma/schema.prisma` -> `Payment.idempotencyKey @unique`
- 兼容下线:
  - `backend/src/services/containerService.js`
  - `frontend/src/types/index.ts`
  - `frontend/src/app/dashboard/containers/*`
  - `frontend/src/services/container.service.ts`

## 验证结果
- 后端: `node --test src/services/shared/contractUtils.test.js src/services/containerService.test.js src/services/salesService.test.js src/services/financeService.test.js src/controllers/financeController.test.js`
  - 结果: 20/20 通过
- 前端: `npx vitest run src/app/dashboard/containers/page.test.tsx src/app/dashboard/containers/[id]/page.test.tsx`
  - 结果: 2 files / 6 tests 通过

## 注意事项
- 上线前需执行:
  - `cd backend && npm run db:generate`
  - `cd backend && npm run db:push`
  以同步 `Payment.idempotencyKey` 字段到数据库。
