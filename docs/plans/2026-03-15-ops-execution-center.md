# Ops Execution Center Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an initial "经营执行中台" with a real unshipped-worklist workflow, while planning the purchase-checklist and task-reminder modules as the next milestones.

**Architecture:** Reuse the existing `frontend` + `backend` split. The first shipped slice avoids database migrations by persisting unshipped assignee mappings inside `SystemConfig`, and computes the unshipped aggregate from existing `Inventory + SalesContract + Product` data. The frontend adds a new dashboard entry page with three tabs: one live module and two roadmap modules.

**Tech Stack:** Next.js 16, React 19, shadcn/ui, Express 4, Prisma 5, SQLite, Vitest, Node test runner

---

### Task 1: Planning And Checkpoint Files

**Files:**
- Create: `docs/plans/2026-03-15-ops-execution-center.md`
- Modify: `PLAN.md`
- Modify: `TASKS.md`
- Modify: `RISKS.md`
- Modify: `METRICS.md`
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

**Step 1: Record implementation assumptions**

- Scope the delivery into:
  - `OPS-EXEC-01`: 中台入口 + 未发货清单 v1
  - `OPS-EXEC-02`: 门店采购清单模板化基础
  - `OPS-EXEC-03`: 任务提醒引擎基础模型与 API
- Default assumptions:
  - First slice prioritizes actual utility over full schema expansion.
  - Assignee persistence for unshipped items can be stored in `SystemConfig` JSON to avoid blocking on Prisma migration.

**Step 2: Update project checkpoint files**

Run after edits:

```bash
git diff -- PLAN.md TASKS.md RISKS.md METRICS.md task_plan.md findings.md progress.md docs/plans/2026-03-15-ops-execution-center.md
```

Expected: all ops-execution planning artifacts are present.

### Task 2: Backend Unshipped Worklist API

**Files:**
- Create: `backend/src/controllers/opsExecutionController.js`
- Create: `backend/src/controllers/opsExecutionController.test.js`
- Create: `backend/src/routes/opsExecution.js`
- Create: `backend/src/routes/opsExecution.test.js`
- Modify: `backend/src/routes/index.js`

**Step 1: Write the failing controller tests**

Cover:
- aggregate non-`OUTBOUND` inventory by `salesContractId + productId + status`
- merge assignee info from `SystemConfig`
- save assignee mapping by key

Run:

```bash
cd backend && npm run test -- src/controllers/opsExecutionController.test.js src/routes/opsExecution.test.js
```

Expected: FAIL because module/route do not exist yet.

**Step 2: Write minimal implementation**

- Add `GET /api/v1/ops-execution/unshipped`
- Add `PUT /api/v1/ops-execution/unshipped/assign`
- Restrict write access with existing `roleAuth`
- Use `systemConfig` key `ops_execution_unshipped_assignments`

**Step 3: Re-run targeted backend tests**

```bash
cd backend && npm run test -- src/controllers/opsExecutionController.test.js src/routes/opsExecution.test.js
```

Expected: PASS

### Task 3: Frontend Ops Center Page

**Files:**
- Create: `frontend/src/services/opsExecution.service.ts`
- Create: `frontend/src/app/dashboard/ops-execution/page.tsx`
- Create: `frontend/src/app/dashboard/ops-execution/page.test.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`

**Step 1: Write the failing page test**

Cover:
- render heading and unshipped rows
- filter by status and re-request data
- assign assignee and show success feedback

Run:

```bash
cd frontend && npm run test -- src/app/dashboard/ops-execution/page.test.tsx
```

Expected: FAIL because page/service do not exist yet.

**Step 2: Write minimal implementation**

- Add sidebar entry `经营执行`
- Build tabs:
  - `未发货清单` (live)
  - `采购清单模块` (roadmap)
  - `任务提醒引擎` (roadmap)
- Use shadcn `Tabs`, `Card`, `Table`, `Input`, `Select`, `Button`

**Step 3: Re-run targeted frontend tests**

```bash
cd frontend && npm run test -- src/app/dashboard/ops-execution/page.test.tsx
```

Expected: PASS

### Task 4: Validation And Artifacts

**Files:**
- Create: `logs/task-OPS-EXEC-01.md`
- Create: `RESULTS/OPS-EXEC-01.md`
- Create: `PATCHES/OPS-EXEC-01.diff`
- Modify: `TASKS.md`
- Modify: `PLAN.md`
- Modify: `RISKS.md`
- Modify: `METRICS.md`

**Step 1: Run verification**

```bash
cd backend && npm run test -- src/controllers/opsExecutionController.test.js src/routes/opsExecution.test.js
cd frontend && npm run test -- src/app/dashboard/ops-execution/page.test.tsx
cd frontend && npm run lint -- src/app/dashboard/ops-execution/page.tsx src/app/dashboard/ops-execution/page.test.tsx src/services/opsExecution.service.ts src/components/layout/Sidebar.tsx
```

Expected: all targeted checks pass.

**Step 2: Capture result artifacts**

- Summarize shipped slice and remaining gaps in `RESULTS/OPS-EXEC-01.md`
- Export diff to `PATCHES/OPS-EXEC-01.diff`
- Mark task status in `TASKS.md`

