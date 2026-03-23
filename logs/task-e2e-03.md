# Task E2E-03 Log

- 时间: 2026-03-23 10:24:00 +0800
- 目标: 清掉提交前前端全量 E2E 红灯，并完成 fresh 全门禁验证。

## 执行步骤
1. 复现并定位 production preview 下的 E2E 失败。
2. 查明 `React error #418` 根因并修复 dashboard 壳层 hydration mismatch。
3. 收口导入页、采购建议页、AI 模块与采购附件相关 mock 契约。
4. 同步 smoke / button-coverage 到当前 IA、路由和文案。
5. fresh 重建前端 preview，跑完 backend/frontend 全量验证。
6. 更新 PLAN / TASKS / RISKS / METRICS 与结果产物。

## 关键修复
- `frontend/src/app/dashboard/layout.tsx`
  - 持久化鉴权 hydration 改为 `useSyncExternalStore`。
- `frontend/src/components/layout/Header.tsx`
  - 日期展示改为 SSR-safe 渲染。
- `frontend/src/app/dashboard/purchase/create/components/CreatePurchasePageContent.tsx`
  - `signedAt` 改为挂载后初始化。
- `frontend/src/app/dashboard/sales/create/page.tsx`
  - `signedAt` 改为挂载后初始化。
- `frontend/e2e/helpers.ts`
  - 补齐 procurement template stores、AI token/history、分页导入记录、采购附件 mock。
- `frontend/e2e/smoke.spec.ts`
  - 修正“门店采购指南”、系统配置入口与工作台快捷入口断言。
- `frontend/e2e/button-coverage.spec.ts`
  - 移除废弃 `/dashboard/logs` 页面巡检。
- `frontend/src/services/dataImportService.ts`
  - 兼容数组响应与分页响应。

## 验证命令
- `cd backend && npm run test:all`
- `cd frontend && npm run test`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`
- `cd frontend && npm run test:e2e`

## 结果
- backend: `236/236` 通过。
- frontend vitest: `110` 文件 / `356` 用例通过。
- frontend lint: 通过。
- frontend build: 通过。
- frontend Playwright: `57/57` 通过。
