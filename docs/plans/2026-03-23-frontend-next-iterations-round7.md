# 2026-03-23 Frontend Next Iterations Round 7

## Scope
- `FE-MODULE-01`
- `FE-QA-01`

## Goal
- Complete the remaining scope in `docs/frontend-next-iterations-2026-03.md`.
- Differentiate module-home first screens and add screenshot-regression coverage for key entry pages.

## Changes
- Procurement module:
  - Added a `采购执行概览` section to the contracts home.
  - Surfaced cards for active follow-up contracts, producing contracts, shipped pending receipt, and active stores.
- Export module:
  - Added a `出口出运概览` section to the sales home.
  - Surfaced cards for preparing contracts, in-transit containers, arrived pending close, and total box count.
- Visual QA gate:
  - Added `frontend/e2e/visual.spec.ts`.
  - Added snapshot baselines for login, dashboard, procurement, finance, and mobile dashboard first screen.
  - Switched Playwright to a dedicated production-preview port (`3004`) to avoid conflicts with the backend and existing local `next dev`.
  - Added finance mocks for exchange rate, payment trends, and overdue receivables.

## Verification
- `cd frontend && npm run test -- src/app/dashboard/contracts/page.test.tsx src/app/dashboard/sales/page.test.tsx src/app/dashboard/finance/page.test.tsx`
- `cd frontend && npm run lint -- src/app/dashboard/contracts/components/ContractsPageContent.tsx src/app/dashboard/contracts/page.test.tsx src/app/dashboard/sales/page.tsx src/app/dashboard/sales/page.test.tsx src/app/dashboard/finance/page.tsx src/app/dashboard/finance/page.test.tsx`
- `cd frontend && npm run test:e2e -- e2e/visual.spec.ts --grep visual-finance --update-snapshots`
- `cd frontend && npm run test:e2e -- e2e/visual.spec.ts`
- `cd frontend && npm run build`

## Outcome
- The March frontend-iteration report is now fully executed (`10/10`).
- Procurement/export home screens are no longer the same template with different headings.
- The repo now has a working screenshot-regression gate for the highest-signal pages.
