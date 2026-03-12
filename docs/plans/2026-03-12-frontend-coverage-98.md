# Frontend Coverage 98 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复前端现有失败测试，扩大前端覆盖率统计口径到 `app/services` 等关键目录，并把 Statements/Branches/Functions/Lines 全部拉到 `>=98%`。

**Architecture:** 先以全量 `vitest` 和 `coverage` 建立真实基线，避免在错误假设上修补。随后按“先红后绿”修复失败测试，再把 `vitest.config.ts` 的 `coverage.include` 扩到关键目录，并对新增进入统计口径的低覆盖文件补定向测试或做最小可测性重构，最后把每轮覆盖率结果持续写入台账和专项报告。

**Tech Stack:** Next.js 16、React 19、Vitest、Testing Library、TypeScript

---

### Task 1: 建立基线与锁定红灯

**Files:**
- Modify: `frontend/METRICS.md`
- Modify: `frontend/RISKS.md`
- Test: `frontend/package.json`
- Test: `frontend/vitest.config.ts`

**Step 1: 运行全量单测基线**

Run: `cd frontend && npm run test`

Expected: 记录当前失败测试、失败原因和是否为既有红灯。

**Step 2: 运行当前 coverage 基线**

Run: `cd frontend && npm run test:coverage`

Expected: 记录当前 coverage 统计口径、四项指标和低覆盖目录。

### Task 2: 修复失败测试

**Files:**
- Modify: `frontend/src/**/*.test.ts`
- Modify: `frontend/src/**/*.test.tsx`
- Modify: `frontend/src/**/*.ts`
- Modify: `frontend/src/**/*.tsx`

**Step 1: 先确认根因**

按失败日志定位是断言过期、mock 漏配、异步等待不足还是生产代码真实回归。

**Step 2: 让失败用例稳定复现**

Run: `cd frontend && npm run test -- <failing-test-files>`

Expected: 失败能稳定复现且原因明确。

**Step 3: 最小修复**

先补/调整失败断言，再补最小实现或最小测试修复，避免顺手重构。

**Step 4: 回归红灯范围**

Run: `cd frontend && npm run test -- <failing-test-files>`

Expected: 红灯文件恢复全绿。

### Task 3: 扩大 coverage 统计口径

**Files:**
- Modify: `frontend/vitest.config.ts`

**Step 1: 扩展 include**

把 `coverage.include` 从当前 `components/lib` 扩到关键目录，至少包含：
- `src/app/**/*.ts`
- `src/app/**/*.tsx`
- `src/components/**/*.ts`
- `src/components/**/*.tsx`
- `src/lib/**/*.ts`
- `src/lib/**/*.tsx`
- `src/services/**/*.ts`

**Step 2: 提升阈值到目标**

把四项 threshold 调整到 `98`，用真实门禁约束后续补测。

**Step 3: 重新跑 coverage**

Run: `cd frontend && npm run test:coverage`

Expected: 看到扩围后的真实缺口清单。

### Task 4: 补齐低覆盖文件

**Files:**
- Modify: `frontend/src/app/**/*.test.tsx`
- Modify: `frontend/src/services/**/*.test.ts`
- Modify: `frontend/src/components/**/*.test.tsx`
- Modify: `frontend/src/lib/**/*.test.ts`
- Modify: `frontend/src/**/*.ts`
- Modify: `frontend/src/**/*.tsx`

**Step 1: 先补失败的低覆盖文件测试**

优先覆盖 `app` 页面 wrapper、交互分支和 `services` 错误/边界路径。

**Step 2: 每批补完立即回归 coverage**

Run: `cd frontend && npm run test:coverage`

Expected: 四项指标逐步逼近并最终达到 `>=98%`。

**Step 3: 若单个文件难测，做最小可测性重构**

仅允许提炼纯函数、收紧依赖注入或拆分不可观察分支，不做无关重构。

### Task 5: 交付与证据

**Files:**
- Modify: `PLAN.md`
- Modify: `TASKS.md`
- Modify: `RISKS.md`
- Modify: `METRICS.md`
- Add: `logs/task-FE-COV-98.md`
- Add: `RESULTS/FE-COV-98.md`
- Add: `PATCHES/FE-COV-98.diff`
- Add: `docs/coverage-98-frontend-report.md`

**Step 1: 跑最终验证**

Run: `cd frontend && npm run test && npm run test:coverage`

Expected: 全量单测通过，coverage 四项都 `>=98%`。

**Step 2: 写报告与台账**

把每轮 coverage 结果、失败修复、统计口径变化、残余风险与验证命令写入专项报告和仓库台账。
