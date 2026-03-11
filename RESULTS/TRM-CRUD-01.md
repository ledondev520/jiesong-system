# TRM-CRUD-01

## 产出
- 后端补齐 4 组税退模块 CRUD 入口：
  - `/api/v1/customs-declarations`
  - `/api/v1/forex-verifications`
  - `/api/v1/tax-refunds`
  - `/api/v1/tax-rates`
- 前端补齐登录后退税工作台：
  - `/dashboard/tax-refunds`
  - `/dashboard/tax-refunds/create`
  - `/dashboard/tax-refunds/[id]`
  - `/dashboard/tax-refunds/[id]/edit`
- 根布局移除 Google Fonts 外网依赖，改为本地字体栈，恢复 `next build` 在当前环境的稳定性。

## 验证
- `cd backend && node --test src/services/customsDeclarationService.test.js src/services/forexVerificationService.test.js src/services/taxRateService.test.js src/services/taxRefundService.test.js src/routes/taxModules.test.js src/controllers/taxRefundController.test.js`
  - 结果：`28/28` 通过
- `cd frontend && npm test -- src/services/taxRefund.service.test.ts src/app/dashboard/tax-refunds/page.test.tsx src/app/dashboard/tax-refunds/create/page.test.tsx 'src/app/dashboard/tax-refunds/[id]/page.test.tsx' 'src/app/dashboard/tax-refunds/[id]/edit/page.test.tsx' src/components/layout/Sidebar.test.tsx`
  - 结果：`18/18` 通过
- `cd frontend && npm run lint -- src/services/taxRefund.service.ts src/services/taxRefund.service.test.ts src/components/layout/Sidebar.tsx src/components/layout/Sidebar.test.tsx src/types/index.ts src/app/layout.tsx src/app/dashboard/tax-refunds/page.tsx src/app/dashboard/tax-refunds/page.test.tsx src/app/dashboard/tax-refunds/create/page.tsx src/app/dashboard/tax-refunds/create/page.test.tsx 'src/app/dashboard/tax-refunds/[id]/page.tsx' 'src/app/dashboard/tax-refunds/[id]/page.test.tsx' 'src/app/dashboard/tax-refunds/[id]/edit/page.tsx' 'src/app/dashboard/tax-refunds/[id]/edit/page.test.tsx' src/app/dashboard/tax-refunds/components/TaxRefundStatusBadge.tsx src/app/dashboard/tax-refunds/components/TaxRefundForm.tsx src/app/dashboard/tax-refunds/components/TaxRefundListPageContent.tsx src/app/dashboard/tax-refunds/components/TaxRefundDetailPageContent.tsx`
  - 结果：通过
- `cd frontend && npm run build`
  - 结果：通过

## 结论
- 退税模块已具备“后端 CRUD API + 前端登录后 CRUD 工作台 + 生产构建通过”的交付基线。
- 当前工作区还存在并行中的自动草稿生成/HSCode live import 改动；这些不在本结果的完成口径内。
