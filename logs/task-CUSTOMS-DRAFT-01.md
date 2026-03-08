# task-CUSTOMS-DRAFT-01

- Scope: auto-generate customs declaration drafts from existing sales contracts and packing items, then expose the trigger in the customs declarations list page.
- Key findings:
  - Real DB had `36` sales contracts and `237` packing items, with `192` packing items already carrying price data.
  - Real DB had `0` customs declarations before this round, so refund-draft automation lacked upstream documents.
- Implemented:
  - `backend/src/services/customsDeclarationDraftService.js`
  - `POST /customs-declarations/auto-drafts`
  - `frontend` customs-declarations auto-draft button + reload flow
- Real execution:
  - Created `35` customs declaration drafts
  - Skipped `1` sales contract with `no_packing_items`
  - Follow-up tax refund draft run created `9` and skipped `9` due to `no_rate_data`
- Verification:
  - `cd backend && node --test src/services/customsDeclarationDraftService.test.js src/controllers/customsDeclarationController.test.js src/routes/taxModules.test.js`
  - `cd frontend && npm test -- src/services/customsDeclaration.service.test.ts src/app/customs-declarations/page.test.tsx`
  - `cd frontend && npm run lint -- src/services/customsDeclaration.service.ts src/services/customsDeclaration.service.test.ts src/app/customs-declarations/components/CustomsDeclarationListPageContent.tsx src/app/customs-declarations/page.test.tsx`
  - `cd frontend && npm run build`
