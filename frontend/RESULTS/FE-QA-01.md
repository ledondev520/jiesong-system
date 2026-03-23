# FE-QA-01

## Scope
- Add screenshot-regression coverage for the highest-signal pages listed in `docs/frontend-next-iterations-2026-03.md`.

## Delivered
- Added [visual.spec.ts](/Users/helena/Cursor/jiesong_system/frontend/e2e/visual.spec.ts) with visual checks for:
  - login
  - dashboard
  - procurement
  - finance
  - mobile dashboard first screen
- Updated [playwright.config.ts](/Users/helena/Cursor/jiesong_system/frontend/playwright.config.ts) to run against a dedicated production preview on `127.0.0.1:3004`.
- Updated [helpers.ts](/Users/helena/Cursor/jiesong_system/frontend/e2e/helpers.ts) to include finance mocks for:
  - `/api/v1/system/exchange-rate`
  - `/api/v1/finance/payment-trends`
  - `/api/v1/finance/overdue-receivables`
- Generated snapshot baselines in `frontend/e2e/visual.spec.ts-snapshots/`:
  - `login-page-chromium-darwin.png`
  - `dashboard-page-chromium-darwin.png`
  - `procurement-page-chromium-darwin.png`
  - `finance-page-chromium-darwin.png`
  - `dashboard-mobile-first-screen-chromium-darwin.png`

## Verification
- `cd frontend && npm run test:e2e -- e2e/visual.spec.ts --grep visual-finance --update-snapshots`
- `cd frontend && npm run test:e2e -- e2e/visual.spec.ts`
- `cd frontend && npm run build`

## Result
- The repo now has a working screenshot-regression gate for the five target pages.
- The March report item `FE-QA-01` is complete and verified.
