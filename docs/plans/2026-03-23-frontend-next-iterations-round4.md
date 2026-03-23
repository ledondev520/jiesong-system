# Frontend Next Iterations Round 4

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 完成 `FE-SPLIT-02`，拆分 `store-recommend/page.tsx`，降低超长页面维护成本。

**Architecture:** 保持 `page.tsx` 为薄入口，把数据编排下沉到 `StoreRecommendPageContent`，再按模板页、AI 建议页、统计页和共享 helper 继续分层。行为不变，只做结构拆分与测试护栏补强。

**Tech Stack:** Next.js 16, React 19, shadcn/ui, Vitest, ESLint

---

### Task 1: 锁住门店切换主路径

**Files:**
- Modify: `frontend/src/app/dashboard/store-recommend/page.test.tsx`
- Modify: `frontend/src/test/setup.ts`

**Step 1: Tighten page regression**
- 增加“切换到指定门店后展示历史采购明细”测试。

**Step 2: Fix test environment drift**
- 为 Radix Select 在 Vitest 环境补齐 pointer-capture / scrollIntoView polyfill。

**Step 3: Verify**
- `cd frontend && npm run test -- src/app/dashboard/store-recommend/page.test.tsx`

### Task 2: 拆 route / content / sections / shared helpers

**Files:**
- Modify: `frontend/src/app/dashboard/store-recommend/page.tsx`
- Create: `frontend/src/app/dashboard/store-recommend/components/StoreRecommendPageContent.tsx`
- Create: `frontend/src/app/dashboard/store-recommend/components/StoreRecommendTemplateTab.tsx`
- Create: `frontend/src/app/dashboard/store-recommend/components/StoreRecommendAITab.tsx`
- Create: `frontend/src/app/dashboard/store-recommend/components/StoreRecommendStatsTab.tsx`
- Create: `frontend/src/app/dashboard/store-recommend/components/storeRecommendShared.tsx`

**Step 1: Thin the route**
- `page.tsx` 只保留页面入口。

**Step 2: Extract stateful container**
- `StoreRecommendPageContent` 承接数据加载、门店切换与 tabs 组装。

**Step 3: Extract presentational sections**
- 模板 tab
- AI 建议 tab
- 统计 tab
- 共享优先级与导出 helper

### Task 3: Verify and checkpoint

**Files:**
- Modify: `PLAN.md`
- Modify: `TASKS.md`
- Modify: `RISKS.md`
- Modify: `METRICS.md`
- Modify: `frontend/PLAN.md`
- Modify: `frontend/TASKS.md`
- Modify: `frontend/RISKS.md`
- Modify: `frontend/METRICS.md`
- Create: `frontend/logs/task-fe-split-02.md`
- Create: `frontend/RESULTS/FE-SPLIT-02.md`
- Create: `frontend/PATCHES/FE-SPLIT-02.diff`

**Verification**
- `cd frontend && npm run test -- src/app/dashboard/store-recommend/page.test.tsx`
- `cd frontend && npm run lint -- src/app/dashboard/store-recommend/page.tsx src/app/dashboard/store-recommend/page.test.tsx src/app/dashboard/store-recommend/components/*.tsx src/test/setup.ts`
- `cd frontend && npm run build`
