# HSCode Frontend Integration Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add frontend HSCode lookup APIs and product-form smart matching so users can search by product name and auto-fill HS code and tax rate.

**Architecture:** Keep the integration thin: add a dedicated `hsCode.service.ts`, wire the smart-match UX into the existing product dialog, and verify behavior with focused Vitest service/component tests. Use product-name search for suggestions, then resolve the selected code with a detail request before filling the form.

**Tech Stack:** Next.js App Router, React Hook Form, Zod, Axios wrapper, Vitest, Testing Library

---

### Task 1: Add failing HSCode service tests

**Files:**
- Create: `frontend/src/services/hsCode.service.test.ts`
- Create: `frontend/src/services/hsCode.service.ts`

**Step 1: Write the failing test**

Add tests that expect:
- `searchByProductName('瓷砖')` to call `GET /hs-codes/search` with `keyword`
- `searchByHsCode('69072190')` to call `GET /hs-codes/69072190`

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/services/hsCode.service.test.ts`
Expected: FAIL because the service file does not exist yet.

**Step 3: Write minimal implementation**

Create `hsCode.service.ts` with the two API methods and shared response typing.

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/services/hsCode.service.test.ts`
Expected: PASS

### Task 2: Add failing smart-match dialog test

**Files:**
- Create: `frontend/src/app/dashboard/products/components/ProductDialog.test.tsx`
- Modify: `frontend/src/app/dashboard/products/components/ProductDialog.tsx`

**Step 1: Write the failing test**

Add a component test that:
- types a product name into the smart-match input
- sees recommended HSCode options
- selects an option
- verifies `hsCode` and `taxRate` are auto-filled

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/app/dashboard/products/components/ProductDialog.test.tsx`
Expected: FAIL because the smart-match UI does not exist yet.

**Step 3: Write minimal implementation**

Add the smart-match section, debounce product-name lookup, render recommendations, and resolve the selected code before filling form fields.

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/app/dashboard/products/components/ProductDialog.test.tsx`
Expected: PASS

### Task 3: Verify and checkpoint

**Files:**
- Modify: `frontend/PLAN.md`
- Modify: `frontend/TASKS.md`
- Modify: `frontend/METRICS.md`
- Modify: `frontend/RISKS.md`
- Create: `frontend/logs/task-hs-01.md`
- Create: `frontend/RESULTS/HS-01.md`
- Create: `frontend/PATCHES/HS-01.diff`

**Step 1: Run focused verification**

Run: `npm run test -- src/services/hsCode.service.test.ts src/app/dashboard/products/components/ProductDialog.test.tsx src/app/dashboard/products/page.test.tsx`

**Step 2: Run lint for touched files**

Run: `npm run lint -- src/services/hsCode.service.ts src/services/hsCode.service.test.ts src/app/dashboard/products/components/ProductDialog.tsx src/app/dashboard/products/components/ProductDialog.test.tsx`

**Step 3: Update checkpoint files**

Record task status, risk notes, metrics, and result summary.
