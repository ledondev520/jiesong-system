# Frontend Next Iterations Round 3

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 完成 `FE-STATE-01`，统一高频 dashboard 页面中的 loading / empty / error 状态呈现。

**Architecture:** 新增共享 `data-state` UI 层，提供 page-level loading/error 与 table-level state row，再先接入五个高流量页面：`finance`、`reports`、`payments`、`containers`、`inventory-container`。不改接口合同，不扩大业务逻辑，只收口状态展示和回归测试。

**Tech Stack:** Next.js 16, React 19, shadcn/ui, Vitest, ESLint

---

### Task 1: 锁定统一状态组件接口

**Files:**
- Create: `frontend/src/components/ui/data-state.tsx`
- Test: `frontend/src/components/ui/data-state.test.tsx`

**Step 1: Write the failing test**
- 补 `LoadingState`、`ErrorState`、`TableStateRow` 的基础渲染测试。

**Step 2: Run test to verify it fails**
- Run: `cd frontend && npm run test -- src/components/ui/data-state.test.tsx`

**Step 3: Write minimal implementation**
- 提供共享 loading / error / table row 状态组件，复用现有 `EmptyState`。

**Step 4: Run test to verify it passes**
- Run: `cd frontend && npm run test -- src/components/ui/data-state.test.tsx`

### Task 2: 接入高频页面并补回归

**Files:**
- Modify: `frontend/src/app/dashboard/finance/page.tsx`
- Modify: `frontend/src/app/dashboard/reports/page.tsx`
- Modify: `frontend/src/app/dashboard/payments/page.tsx`
- Modify: `frontend/src/app/dashboard/containers/page.tsx`
- Modify: `frontend/src/app/dashboard/inventory-container/page.tsx`
- Test: `frontend/src/app/dashboard/finance/page.test.tsx`
- Test: `frontend/src/app/dashboard/reports/page.test.tsx`
- Test: `frontend/src/app/dashboard/payments/page.test.tsx`
- Test: `frontend/src/app/dashboard/containers/page.test.tsx`
- Test: `frontend/src/app/dashboard/inventory-container/page.test.tsx`

**Step 1: Write the failing tests**
- 为 reports / containers / inventory-container / payments 补错误态或空态断言。

**Step 2: Run test to verify it fails**
- Run: `cd frontend && npm run test -- src/components/ui/data-state.test.tsx src/app/dashboard/finance/page.test.tsx src/app/dashboard/reports/page.test.tsx src/app/dashboard/containers/page.test.tsx src/app/dashboard/inventory-container/page.test.tsx src/app/dashboard/payments/page.test.tsx`

**Step 3: Write minimal implementation**
- 用共享状态组件替换手写 loading / empty / error block。
- 保持现有文案主标题兼容，避免无意义回归。

**Step 4: Run test to verify it passes**
- Run: 同上测试命令

### Task 3: 收口验证与 checkpoint

**Files:**
- Modify: `PLAN.md`
- Modify: `TASKS.md`
- Modify: `RISKS.md`
- Modify: `METRICS.md`
- Modify: `frontend/PLAN.md`
- Modify: `frontend/TASKS.md`
- Modify: `frontend/RISKS.md`
- Modify: `frontend/METRICS.md`
- Create: `frontend/logs/task-fe-state-01.md`
- Create: `frontend/RESULTS/FE-STATE-01.md`
- Create: `frontend/PATCHES/FE-STATE-01.diff`

**Step 1: Run lint**
- Run: `cd frontend && npm run lint -- src/components/ui/data-state.tsx src/components/ui/data-state.test.tsx src/app/dashboard/finance/page.tsx src/app/dashboard/finance/page.test.tsx src/app/dashboard/reports/page.tsx src/app/dashboard/reports/page.test.tsx src/app/dashboard/containers/page.tsx src/app/dashboard/containers/page.test.tsx src/app/dashboard/inventory-container/page.tsx src/app/dashboard/inventory-container/page.test.tsx src/app/dashboard/payments/page.tsx src/app/dashboard/payments/page.test.tsx`

**Step 2: Run build**
- Run: `cd frontend && npm run build`

**Step 3: Write artifacts**
- 同步计划、任务、风险、指标、日志、结果、patch。

**Step 4: Mark done**
- `FE-STATE-01` → `DONE`
- 丢失执行上下文的并行任务恢复为真实待执行状态，避免错误续跑。
