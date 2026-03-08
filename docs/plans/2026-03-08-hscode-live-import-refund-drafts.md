# HSCode Live Import And Refund Drafts Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Import the cleaned live HSCode JSON snapshot into the formal `hs_codes` database table while preserving important source data, then generate draft tax-refund records automatically from customs declarations.

**Architecture:** Extend the `HsCode` Prisma model to hold both normalized query fields and a full serialized source payload, add a deterministic import script that reads `backend/data/hscode-live/records/*.json`, and add a backend draft-generation service that derives refundable amounts from customs declaration items by matching live HSCode refund rates. Expose the draft-generation flow through a dedicated backend endpoint and a minimal frontend action on the tax-refunds list page.

**Tech Stack:** Prisma, SQLite, Node.js test runner, Express, React/Next.js, Vitest

---

### Task 1: Extend HSCode storage for live data

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create/Modify: `backend/prisma/migrations/*`
- Test: `backend/scripts/import-hscode-live.test.js`

**Step 1: Write the failing test**

- Assert that normalized live records preserve:
  - `hsCode`
  - `productName`
  - `declarationElements`
  - `unit`
  - `refundRate`
  - serialized raw payload

**Step 2: Run the red test**

Run: `cd backend && node --test scripts/import-hscode-live.test.js`

Expected: FAIL because the importer does not exist yet.

**Step 3: Implement the schema**

- Add normalized retention fields for live HSCode data.
- Keep the table query-friendly for `hsCode` and `productName`.
- Preserve the full original record in a serialized field so no visible source section is lost.

### Task 2: Import live HSCode snapshot into `hs_codes`

**Files:**
- Create: `backend/scripts/import-hscode-live.js`
- Test: `backend/scripts/import-hscode-live.test.js`

**Step 1: Implement normalization**

- Read every JSON file from `backend/data/hscode-live/records`.
- Map source sections to DB fields.
- Parse percentage strings into numeric rates where possible.
- Flatten declaration elements into a searchable string while retaining raw payload JSON.

**Step 2: Implement deterministic import**

- Upsert by `hsCode`.
- Default to replacing existing example seed rows with live records for matching codes.
- Print processed/imported counts.

**Step 3: Verify**

Run: `cd backend && node --test scripts/import-hscode-live.test.js`

### Task 3: Generate tax-refund drafts automatically

**Files:**
- Create: `backend/src/services/taxRefundDraftService.js`
- Create: `backend/src/services/taxRefundDraftService.test.js`
- Modify: `backend/src/controllers/taxRefundController.js`
- Modify: `backend/src/routes/taxRefunds.js`
- Create/Modify: `backend/src/controllers/taxRefundController.test.js`

**Step 1: Write the failing service test**

- Cover:
  - picks eligible customs declarations
  - matches item `hsCode` to live `HsCode.refundRate`
  - sums refundable amount from item totals
  - associates the latest forex verification when available
  - skips declarations that already have a refund draft unless explicitly replacing

**Step 2: Run the red test**

Run: `cd backend && node --test src/services/taxRefundDraftService.test.js`

Expected: FAIL because the draft-generation service does not exist yet.

**Step 3: Implement the service**

- Generate one draft per customs declaration.
- Use a deterministic auto number format.
- Store traceability details in `note`.

**Step 4: Expose the endpoint**

- Add a dedicated POST route such as `/tax-refunds/auto-drafts`.
- Return created/skipped counts and generated IDs.

### Task 4: Add minimal frontend trigger

**Files:**
- Modify: `frontend/src/services/taxRefund.service.ts`
- Create/Modify: `frontend/src/services/taxRefund.service.test.ts`
- Modify: `frontend/src/app/dashboard/tax-refunds/components/TaxRefundListPageContent.tsx`
- Create/Modify: `frontend/src/app/dashboard/tax-refunds/page.test.tsx`

**Step 1: Write the failing frontend tests**

- Add a service test for the auto-draft endpoint.
- Add a page test asserting the button triggers generation and reloads the list.

**Step 2: Run the red tests**

Run: `cd frontend && npm test -- src/services/taxRefund.service.test.ts src/app/dashboard/tax-refunds/page.test.tsx`

Expected: FAIL because the new endpoint action does not exist yet.

**Step 3: Implement the minimal UI**

- Add one button on the tax-refunds list page.
- Show success/error toast with created/skipped counts.
- Reload the list after success.

### Task 5: Verify and checkpoint

**Files:**
- Modify: `PLAN.md`
- Modify: `TASKS.md`
- Modify: `RISKS.md`
- Modify: `METRICS.md`
- Modify: `frontend/PLAN.md`
- Modify: `frontend/TASKS.md`
- Modify: `frontend/RISKS.md`
- Modify: `frontend/METRICS.md`
- Create: `logs/task-HSCODE-LIVE-01.md`
- Create: `RESULTS/HSCODE-LIVE-01.md`
- Create: `PATCHES/HSCODE-LIVE-01.diff`

**Verification:**
- `cd backend && node --test scripts/import-hscode-live.test.js src/services/taxRefundDraftService.test.js src/controllers/taxRefundController.test.js src/services/hsCodeService.test.js src/routes/hsCodes.test.js`
- `cd backend && npx prisma migrate dev --name extend_hs_codes_for_live_import`
- `cd backend && node scripts/import-hscode-live.js`
- `cd frontend && npm test -- src/services/taxRefund.service.test.ts src/app/dashboard/tax-refunds/page.test.tsx`
- `cd frontend && npm run lint -- src/services/taxRefund.service.ts src/services/taxRefund.service.test.ts src/app/dashboard/tax-refunds/components/TaxRefundListPageContent.tsx src/app/dashboard/tax-refunds/page.test.tsx`
