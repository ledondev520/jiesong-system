# FE-MODULE-01

## Scope
- Differentiate the procurement, export, and finance module-home first screens under `docs/frontend-next-iterations-2026-03.md`.

## Delivered
- Procurement home:
  - Added `采购执行概览` to [ContractsPageContent.tsx](/Users/helena/Cursor/jiesong_system/frontend/src/app/dashboard/contracts/components/ContractsPageContent.tsx)
  - Added cards for `待推进合同` / `生产中` / `已发货待收货` / `合作店铺`
- Export home:
  - Added `出口出运概览` to [page.tsx](/Users/helena/Cursor/jiesong_system/frontend/src/app/dashboard/sales/page.tsx)
  - Added cards for `待装柜合同` / `在途货柜` / `已到港待结清` / `总箱数`
- Regression coverage:
  - Updated [page.test.tsx](/Users/helena/Cursor/jiesong_system/frontend/src/app/dashboard/contracts/page.test.tsx)
  - Updated [page.test.tsx](/Users/helena/Cursor/jiesong_system/frontend/src/app/dashboard/sales/page.test.tsx)

## Verification
- `cd frontend && npm run test -- src/app/dashboard/contracts/page.test.tsx src/app/dashboard/sales/page.test.tsx src/app/dashboard/finance/page.test.tsx`
- `cd frontend && npm run lint -- src/app/dashboard/contracts/components/ContractsPageContent.tsx src/app/dashboard/contracts/page.test.tsx src/app/dashboard/sales/page.tsx src/app/dashboard/sales/page.test.tsx src/app/dashboard/finance/page.tsx src/app/dashboard/finance/page.test.tsx`
- `cd frontend && npm run build`

## Result
- Procurement/export home screens now expose module-specific first-screen summaries instead of staying as generic list pages.
- The March report item `FE-MODULE-01` is complete and verified.
