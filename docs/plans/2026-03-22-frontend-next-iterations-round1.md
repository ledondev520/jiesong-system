# Frontend Next Iterations Round 1 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver the first execution slice from `docs/frontend-next-iterations-2026-03.md` by redesigning the dashboard home workspace and deepening the navigation registry.

**Architecture:** Keep the current Next.js dashboard shell, but shift page structure from ad hoc page-local decisions into shared metadata. The dashboard home should become a four-zone workspace built from existing analytics data and existing high-frequency entry points, while route visibility, default landing, and redirect decisions move into `navigation.config.ts` so `layout` stays thinner.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vitest, shadcn/ui, lucide-react, recharts

---

### Task 1: FE-DASH-01 Dashboard Workspace Redesign

**Files:**
- Modify: `frontend/src/app/dashboard/page.tsx`
- Modify: `frontend/src/components/dashboard/DataDashboard.tsx`
- Modify: `frontend/src/app/dashboard/page.test.tsx`
- Modify: `frontend/src/components/dashboard/DataDashboard.test.tsx`

**Step 1: Write the failing test**

- Add page-level assertions for the four workspace headings:
  - `当前焦点`
  - `高频动作`
  - `风险提醒`
  - `关键趋势`
- Add interaction assertions for the retained and newly promoted high-frequency actions.
- Add component assertions for focus/risk/trend output and calm fallback states.

**Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- src/app/dashboard/page.test.tsx src/components/dashboard/DataDashboard.test.tsx`

Expected: the new assertions fail because the current page still renders `快速录入 + ProductTracker + legacy chart stack`.

**Step 3: Write minimal implementation**

- Rebuild `dashboard/page.tsx` into a workspace shell.
- Rework `DataDashboard.tsx` to derive:
  - one dominant focus summary
  - concise risk reminders
  - a reduced trend area
- Keep `ProductTracker` as a secondary tool below the first-screen workspace.

**Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- src/app/dashboard/page.test.tsx src/components/dashboard/DataDashboard.test.tsx`

Expected: all touched dashboard tests pass.

### Task 2: FE-NAV-02 Navigation Registry Deepening

**Files:**
- Modify: `frontend/src/components/layout/navigation.config.ts`
- Modify: `frontend/src/app/dashboard/layout.tsx`
- Modify: `frontend/src/app/dashboard/layout.test.tsx`
- Modify: `frontend/src/components/layout/Sidebar.test.tsx`

**Step 1: Write the failing test**

- Add tests for registry-driven visibility, default landing, and redirect behavior.
- Keep nested-route matching under test so module highlighting does not regress.

**Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- src/app/dashboard/layout.test.tsx src/components/layout/Sidebar.test.tsx`

Expected: the new assertions fail because default landing and redirect strategy are not yet modeled in the registry.

**Step 3: Write minimal implementation**

- Extend `navigation.config.ts` with module metadata for role visibility, default landing, and route aliases when needed.
- Move layout redirect reasoning into registry helpers instead of new layout-local branching.

**Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- src/app/dashboard/layout.test.tsx src/components/layout/Sidebar.test.tsx`

Expected: registry-driven layout and sidebar tests pass.

### Task 3: Verification + Checkpoint Refresh

**Files:**
- Modify: `frontend/PLAN.md`
- Modify: `frontend/TASKS.md`
- Modify: `frontend/RISKS.md`
- Modify: `frontend/METRICS.md`
- Modify: `PLAN.md`
- Modify: `TASKS.md`
- Modify: `RISKS.md`
- Modify: `METRICS.md`

**Step 1: Run focused verification**

Run: `cd frontend && npm run test -- src/app/dashboard/page.test.tsx src/components/dashboard/DataDashboard.test.tsx src/app/dashboard/layout.test.tsx src/components/layout/Sidebar.test.tsx src/components/layout/Header.test.tsx`

Run: `cd frontend && npm run lint -- src/app/dashboard/page.tsx src/components/dashboard/DataDashboard.tsx src/app/dashboard/page.test.tsx src/components/dashboard/DataDashboard.test.tsx src/components/layout/navigation.config.ts src/app/dashboard/layout.tsx src/app/dashboard/layout.test.tsx src/components/layout/Sidebar.test.tsx`

Run: `cd frontend && npm run build`

**Step 2: Update artifacts**

- Refresh checkpoint files with exact verification evidence.
- Emit `logs/`, `RESULTS/`, and `PATCHES/` artifacts before marking the round complete.
