# HSCODE-LIVE-01 Results

## Outcome
- `hs_codes` now uses cleaned live JSON imports as the system query source.
- Tax-refund drafts can now be generated automatically from customs declarations.

## Delivered
- Prisma migration: `backend/prisma/migrations/20260308124928_extend_hs_codes_for_live_import/migration.sql`
- Live import script: [import-hscode-live.js](/Users/helena/Cursor/jiesong_system/backend/scripts/import-hscode-live.js)
- Draft generator service: [taxRefundDraftService.js](/Users/helena/Cursor/jiesong_system/backend/src/services/taxRefundDraftService.js)
- Backend route: [taxRefunds.js](/Users/helena/Cursor/jiesong_system/backend/src/routes/taxRefunds.js)
- Frontend trigger: [TaxRefundListPageContent.tsx](/Users/helena/Cursor/jiesong_system/frontend/src/app/dashboard/tax-refunds/components/TaxRefundListPageContent.tsx)

## Data State
- Live HSCode import processed `908` JSON files and upserted `905` records.
- Current DB count for `hs_codes`: `905`.
- Full source payload is preserved in `rawPayloadJson`, alongside normalized fields like `productName`, `declarationElements`, `refundRate`, and `unit`.

## Verification
- Backend tests: `19/19` pass.
- Frontend tests: `9/9` pass.
- Frontend lint: pass.
- Frontend build: pass.
