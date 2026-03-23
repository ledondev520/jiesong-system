# 2026-03-23 Frontend E2E Stabilization Round 8

## Goal
- Fix the remaining pre-commit Playwright failures.
- Re-run the full backend/frontend verification stack on fresh production output.

## Scope
- Eliminate the dashboard-shell hydration mismatch that surfaced as production `React error #418`.
- Bring E2E mocks back in line with the current frontend contracts and IA.
- Rebuild the frontend, restart a clean preview, and rerun the full E2E suite.

## Main Changes
- `src/app/dashboard/layout.tsx`
  - Switched persisted-auth hydration to `useSyncExternalStore`.
- `src/components/layout/Header.tsx`
  - Made the date label SSR-safe.
- `src/app/dashboard/purchase/create/components/CreatePurchasePageContent.tsx`
  - Delayed `signedAt` initialization until client mount.
- `src/app/dashboard/sales/create/page.tsx`
  - Delayed `signedAt` initialization until client mount.
- `e2e/helpers.ts`
  - Added missing mocks for procurement-template stores, AI token/history endpoints, paginated import history, and purchase file APIs.
- `e2e/smoke.spec.ts`
  - Updated stale assertions to current labels, routes, and dashboard shortcuts.
- `e2e/button-coverage.spec.ts`
  - Removed the deleted `/dashboard/logs` route from coverage.
- `src/services/dataImportService.ts`
  - Accepts both array and paginated import-history responses.

## Verification
- `cd backend && npm run test:all`
  - passed: `233` unit tests + `3` DB integration tests
- `cd frontend && npm run test`
  - passed: `110` files / `356` tests
- `cd frontend && npm run lint`
  - passed
- `cd frontend && npm run build`
  - passed
- `cd frontend && npm run test:e2e`
  - passed: `57/57`

## Outcome
- The repo is no longer in a “feature-complete but gate-red” state.
- Frontend commit gating is green again on a fresh production preview.
