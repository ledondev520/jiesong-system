# Public Finance Service Pages Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build two public informational service pages for forex verification and tax refund workflows.

**Architecture:** Use one reusable presentational component under `src/components` and keep the route files as thin wrappers in `src/app`. Test shared behavior first, then add wrapper tests for route-level guarantees.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, shadcn/ui, Tailwind CSS 4, Vitest, Testing Library

---

### Task 1: Route and shared-component tests

**Files:**
- Create: `src/components/public/service-page.test.tsx`
- Create: `src/app/forex-verifications/page.test.tsx`
- Create: `src/app/tax-refunds/page.test.tsx`

**Step 1: Write the failing test**

- Assert the shared component renders hero copy, KPI cards, process steps, document checklist, FAQ items, and CTA links from config.
- Assert each route renders its own unique title and support copy.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/components/public/service-page.test.tsx src/app/forex-verifications/page.test.tsx src/app/tax-refunds/page.test.tsx`

Expected: FAIL because the files or exports do not exist yet.

**Step 3: Write minimal implementation**

- Create `src/components/public/service-page.tsx` with shadcn/ui cards, badges, buttons, and config-driven sections.
- Create route wrapper pages for `/forex-verifications` and `/tax-refunds`.

**Step 4: Run test to verify it passes**

Run the same Vitest command and confirm PASS.

### Task 2: Validation and handoff artifacts

**Files:**
- Modify: `PLAN.md`
- Modify: `TASKS.md`
- Modify: `METRICS.md`
- Create: `logs/task-wu-001.md`
- Create: `RESULTS/WU-003.md`
- Create: `PATCHES/WU-003.diff`

**Step 1: Run validation**

- `npm run lint`
- `npm run test -- src/components/public/service-page.test.tsx src/app/forex-verifications/page.test.tsx src/app/tax-refunds/page.test.tsx`
- `npm run test:coverage -- --coverage.include='src/components/public/service-page.tsx'`

**Step 2: Record outputs**

- Update metrics and task states.
- Save a concise result summary and patch artifact.
