# Financial Statements Split Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split `frontend/src/app/dashboard/finance/statements/page.tsx` into a route shell, a stateful data container, and extracted chart/detail/dialog sections without changing user-visible behavior.

**Architecture:** Keep the route entrypoint thin and move all fetch/state/effect logic into one client container component. Extract the large render regions into presentational components that receive already-derived props, so the fetch flow and cache invalidation stay centralized while charts, detail tables, and the upload dialog become independently readable and testable.

**Tech Stack:** Next.js App Router, React client components, shadcn/ui, Recharts, Vitest, Testing Library

---

### Task 1: Establish regression coverage for the current page behavior

**Files:**
- Create: `frontend/src/app/dashboard/finance/statements/page.test.tsx`
- Reference: `frontend/src/app/dashboard/finance/statements/page.tsx`
- Reference: `frontend/src/services/financialStatements.service.ts`

**Step 1: Write the failing test**
- Cover the behavior that must survive the refactor:
  - initial load renders page title and four tab labels after analytics/list resolve
  - switching the selected period triggers detail fetch for the new year/month
  - clicking `扫描导入全部` calls the batch import path and reloads data
  - upload dialog opens and `解析并导入` calls the file import path with the chosen file/year/month

**Step 2: Run test to verify it fails**
- Run: `cd frontend && npm run test -- src/app/dashboard/finance/statements/page.test.tsx`
- Expected: FAIL because the new regression file does not exist yet

**Step 3: Write the minimal test scaffolding**
- Mock:
  - `@/services/financialStatements.service`
  - `@/lib/api-cache`
  - `sonner`
  - `recharts`
- Provide a compact analytics/list/detail fixture that exercises all four tabs and the history alert block.

**Step 4: Re-run the test**
- Run: `cd frontend && npm run test -- src/app/dashboard/finance/statements/page.test.tsx`
- Expected: PASS on current behavior before refactor

### Task 2: Split route shell from the data container

**Files:**
- Modify: `frontend/src/app/dashboard/finance/statements/page.tsx`
- Create: `frontend/src/app/dashboard/finance/statements/components/FinancialStatementsPageContainer.tsx`

**Step 1: Move fetch/state/effect logic**
- Keep `page.tsx` as the route entry that renders the container.
- Move page-owned state, `loadData`, `loadDetail`, import handlers, current-period derivation, and chart color constants into the container.

**Step 2: Keep behavior stable**
- Preserve:
  - initial analytics/list fetch
  - selected-period auto-detail fetch
  - cache invalidation and reload flow after import
  - current-period fallback behavior

**Step 3: Re-run regression test**
- Run: `cd frontend && npm run test -- src/app/dashboard/finance/statements/page.test.tsx`
- Expected: PASS

### Task 3: Extract visual sections from the container

**Files:**
- Create: `frontend/src/app/dashboard/finance/statements/components/FinancialStatementsOverview.tsx`
- Create: `frontend/src/app/dashboard/finance/statements/components/FinancialStatementsChartTabs.tsx`
- Create: `frontend/src/app/dashboard/finance/statements/components/FinancialStatementsDetailSection.tsx`
- Create: `frontend/src/app/dashboard/finance/statements/components/FinancialStatementsUploadDialog.tsx`
- Optionally create: `frontend/src/app/dashboard/finance/statements/components/FinancialStatementsShared.tsx`
- Modify: `frontend/src/app/dashboard/finance/statements/components/FinancialStatementsPageContainer.tsx`

**Step 1: Extract overview region**
- Include page header actions, empty state, alert banner(s), KPI cards, and working-capital card.

**Step 2: Extract chart/detail/dialog regions**
- `FinancialStatementsChartTabs`: trends/expenses/balance/detail tabs and their charts
- `FinancialStatementsDetailSection`: current-detail balance sheet + income statement blocks
- `FinancialStatementsUploadDialog`: file picker and period inputs

**Step 3: Keep state ownership minimal**
- Presentational sections receive derived props and callback props only.
- The container remains the only owner of async actions and `useEffect`.

**Step 4: Re-run regression test**
- Run: `cd frontend && npm run test -- src/app/dashboard/finance/statements/page.test.tsx`
- Expected: PASS

### Task 4: Verify the refactor and refresh checkpoints

**Files:**
- Modify: `PLAN.md`
- Modify: `TASKS.md`
- Modify: `RISKS.md`
- Modify: `METRICS.md`
- Modify: `frontend/PLAN.md`
- Modify: `frontend/TASKS.md`
- Modify: `frontend/RISKS.md`
- Modify: `frontend/METRICS.md`
- Create: `frontend/logs/task-fe-split-01.md`
- Create: `frontend/RESULTS/FE-SPLIT-01.md`
- Create: `frontend/PATCHES/FE-SPLIT-01.diff`

**Step 1: Run focused verification**
- `cd frontend && npm run test -- src/app/dashboard/finance/statements/page.test.tsx`
- `cd frontend && npm run lint -- src/app/dashboard/finance/statements/page.tsx src/app/dashboard/finance/statements/components/*.tsx src/app/dashboard/finance/statements/page.test.tsx`
- `cd frontend && npm run build`

**Step 2: Update artifacts**
- Mark `FE-SPLIT-01` as `DONE`
- Record risks from state/effect extraction
- Store summary and patch diff artifacts for resumeability
