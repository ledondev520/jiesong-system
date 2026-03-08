# task-HSCODE-LIVE-01

- Scope: import live HSCode JSON into the formal database and add automatic tax-refund draft generation.
- Plan: `/Users/helena/Cursor/jiesong_system/docs/plans/2026-03-08-hscode-live-import-refund-drafts.md`
- Key actions:
  - Extended `HsCode` storage to keep normalized rates, declaration text, and the full serialized payload.
  - Added `backend/scripts/import-hscode-live.js` and imported live JSON into `hs_codes`.
  - Added `backend/src/services/taxRefundDraftService.js` plus `POST /tax-refunds/auto-drafts`.
  - Added the tax-refunds dashboard trigger button and typed frontend client.
- Fresh verification:
  - `cd backend && node --test scripts/import-hscode-live.test.js src/services/taxRefundDraftService.test.js src/controllers/taxRefundController.test.js src/routes/taxModules.test.js src/services/hsCodeService.test.js src/routes/hsCodes.test.js`
  - `cd backend && node scripts/import-hscode-live.js`
  - `cd frontend && npm test -- src/services/taxRefund.service.test.ts src/app/dashboard/tax-refunds/page.test.tsx`
  - `cd frontend && npm run lint -- src/services/taxRefund.service.ts src/services/taxRefund.service.test.ts src/app/dashboard/tax-refunds/page.tsx src/app/dashboard/tax-refunds/page.test.tsx src/app/dashboard/tax-refunds/components/TaxRefundListPageContent.tsx src/types/index.ts`
  - `cd frontend && npm run build`
