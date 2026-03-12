# Backend Coverage 98 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 先建立可信的 backend coverage 基线，再分批把 line/branch/function 覆盖率推进到 >=98%。

**Architecture:** 先清理会污染基线的测试退出/环境依赖问题，然后按“controller 薄层 -> 高 ROI services -> 重量级模块”的顺序补测试。优先用 handler 级与 service 级定向测试拿到大头覆盖率，避免一开始就陷入高耦合模块重构。

**Tech Stack:** Node.js test runner, Express, Prisma, CommonJS

---

### Task 1: 稳定 coverage 基线
**Files:**
- Modify: `backend/src/app.test.js`
- Modify: `backend/src/middleware/rateLimit.js`
- Create: `backend/src/middleware/rateLimit.init.test.js`

**Steps:**
1. 复现 `app.test` 的 socket 依赖问题与 `rateLimit` 的退出阻塞问题
2. 用测试替身隔离 `app.js` 装配测试，避免真实 socket / 路由树副作用
3. 让 `rateLimit` 顶层清理定时器 `unref()`
4. 跑：`cd backend && node --test src/app.test.js src/middleware/rateLimit.init.test.js src/middleware/rateLimit.test.js`

### Task 2: 建立全量基线
**Files:**
- Modify: `backend/METRICS.md`
- Modify: `backend/RISKS.md`
- Add: `docs/coverage-98-backend-report.md`

**Steps:**
1. 跑：`cd backend && npm test`
2. 跑：`cd backend && node --test --experimental-test-coverage`
3. 记录 lines/branches/functions 与低覆盖文件清单

### Task 3: Controller 批量补测
**Files:**
- Modify: `backend/src/controllers/**/*.test.js`

**Steps:**
1. 优先补当前只有“模块导出”级测试的 controllers
2. 统一使用 mock `req/res/next` 验证状态码、响应体和错误透传
3. 每一批后跑 coverage 复测

### Task 4: 高 ROI Service 批量补测
**Files:**
- Modify: `backend/src/services/**/*.test.js`

**Steps:**
1. 从 `export/pdf/finance/sales/container/taxRefundExport` 开始
2. 补边界分支、错误路径、格式化/计算逻辑
3. 每完成 2-3 个模块复跑 coverage

### Task 5: 收口重量级模块
**Files:**
- Modify: `backend/src/services/aiService.js`
- Modify: `backend/src/services/contractDocService.js`
- Modify: `backend/src/services/importService.js`
- Modify: 对应 `*.test.js`

**Steps:**
1. 仅在必要时做最小可测性重构
2. 优先提取纯函数，避免扩大行为改动
3. 最终跑：`cd backend && npm test && node --test --experimental-test-coverage`
