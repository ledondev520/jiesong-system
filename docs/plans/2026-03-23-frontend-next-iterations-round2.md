# Frontend Next Iterations Round 2 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split the oversized finance statements page into a thin route entry plus clearer content sections without changing user-visible behavior.

**Architecture:** Keep one stateful container for fetch/import side effects and derived state, then delegate presentation to overview, tabs, and upload-dialog components. Preserve the existing financial statements service contract and page copy so the change remains structural instead of behavioral.

**Tech Stack:** Next.js App Router, React client components, shadcn/ui, Recharts, Vitest, ESLint

---

### Task 1: Lock Page Behavior With Regression Tests

**Files:**
- Create: `frontend/src/app/dashboard/finance/statements/page.test.tsx`
- Modify: `frontend/src/app/dashboard/finance/statements/page.tsx`

**Step 1: Write the failing test**
- Add page-level regression coverage for:
  - initial page structure
  - period-switch detail reload
  - batch import flow
  - Excel upload flow
- Add structural assertions for split boundaries such as `data-testid` markers where useful.

**Step 2: Run test to verify it fails**

Run:
```bash
cd frontend && npm run test -- src/app/dashboard/finance/statements/page.test.tsx
```

Expected:
- red test because the pre-split page does not yet expose the new structure.

### Task 2: Split Route and Content Layers

**Files:**
- Modify: `frontend/src/app/dashboard/finance/statements/page.tsx`
- Create: `frontend/src/app/dashboard/finance/statements/components/FinancialStatementsPageContent.tsx`
- Create: `frontend/src/app/dashboard/finance/statements/components/FinancialStatementsOverview.tsx`
- Create: `frontend/src/app/dashboard/finance/statements/components/FinancialStatementsTabsSection.tsx`
- Create: `frontend/src/app/dashboard/finance/statements/components/FinancialStatementsUploadDialog.tsx`
- Create: `frontend/src/app/dashboard/finance/statements/components/financialStatementsFormatting.ts`

**Step 1: Make the route thin**
- Reduce `page.tsx` to a route shell that delegates to `FinancialStatementsPageContent`.

**Step 2: Move state and effects**
- Keep analytics/list/detail loading, selected-period state, and import flows inside `FinancialStatementsPageContent`.

**Step 3: Extract presentational sections**
- `FinancialStatementsOverview`: header actions, empty state, alerts, KPI cards, working-capital overview
- `FinancialStatementsTabsSection`: trend charts, balance charts, detail tab, historical alerts
- `FinancialStatementsUploadDialog`: file upload, period inputs, submit/cancel flow
- `financialStatementsFormatting.ts`: shared amount/percent formatting and profit coloring

### Task 3: Re-verify the Refactor

**Files:**
- Update checkpoint and result artifacts

**Step 1: Run tests**

```bash
cd frontend && npm run test -- src/app/dashboard/finance/statements/page.test.tsx
```

**Step 2: Run lint**

```bash
cd frontend && npm run lint -- src/app/dashboard/finance/statements/page.tsx src/app/dashboard/finance/statements/page.test.tsx src/app/dashboard/finance/statements/components/financialStatementsFormatting.ts src/app/dashboard/finance/statements/components/FinancialStatementsShared.tsx src/app/dashboard/finance/statements/components/FinancialStatementsOverview.tsx src/app/dashboard/finance/statements/components/FinancialStatementsUploadDialog.tsx src/app/dashboard/finance/statements/components/FinancialStatementsTabsSection.tsx src/app/dashboard/finance/statements/components/FinancialStatementsPageContent.tsx
```

**Step 3: Run production build**

```bash
cd frontend && npm run build
```

**Step 4: Update artifacts**
- Refresh `PLAN.md`, `TASKS.md`, `RISKS.md`, `METRICS.md`
- Write `frontend/logs/task-fe-split-01.md`
- Write `frontend/RESULTS/FE-SPLIT-01.md`
- Export `frontend/PATCHES/FE-SPLIT-01.diff`
