# Sales Export And Import Tx Fixes Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复销售导出接口缺失合同时错误返回 500，以及 `dataImportService` 在事务路径下的 `tx.salesItem.create` 外键失败问题，并补齐可执行回归测试。

**Architecture:** 导出链路在 service 层统一抛出带 `statusCode=404` 的业务错误，路由层保持透传，确保最终 HTTP 状态码正确。导入链路把事务内的重复检测与创建统一绑定到同一个 Prisma client/transaction client，避免读写跨上下文导致的外键或重复判断失效。

**Tech Stack:** Node.js、Express、Prisma、node:test

---

### Task 1: 记录台账并建立红灯范围

**Files:**
- Modify: `backend/PLAN.md`
- Modify: `backend/TASKS.md`
- Test: `backend/src/routes/sales.test.js`
- Test: `backend/src/services/dataImportService.test.js`

**Step 1: 写导出 404 的失败测试**

为销售导出补一个 HTTP 级测试，覆盖缺失合同返回 404 而不是 500。

**Step 2: 写事务 client 的失败测试**

为 `dataImportService.importRecords` 补一个事务级测试，验证事务内 `findFirst/create/update` 走同一个 `tx` client。

**Step 3: 运行红灯测试**

Run: `cd backend && node --test src/routes/sales.test.js src/services/dataImportService.test.js src/services/exportService.test.js src/services/pdfExportService.test.js`

Expected: 现状下至少出现“导出缺失合同状态码错误”或“导入事务路径失败/断言失败”。

### Task 2: 修复导出错误映射

**Files:**
- Modify: `backend/src/services/exportService.js`
- Modify: `backend/src/services/pdfExportService.js`
- Test: `backend/src/services/exportService.test.js`
- Test: `backend/src/services/pdfExportService.test.js`
- Test: `backend/src/routes/sales.test.js`

**Step 1: 最小实现**

在导出服务中把“合同不存在”转换成 `createError(..., 404)`，保持路由层只负责 `next(err)`。

**Step 2: 运行导出相关测试**

Run: `cd backend && node --test src/routes/sales.test.js src/services/exportService.test.js src/services/pdfExportService.test.js`

Expected: 全部通过。

### Task 3: 修复导入事务路径

**Files:**
- Modify: `backend/src/services/dataImportService.js`
- Test: `backend/src/services/dataImportService.test.js`

**Step 1: 最小实现**

给事务内的 item 查重函数透传当前 Prisma client，使 `findFirst/create/update` 使用同一个 `tx`。

**Step 2: 运行导入相关测试**

Run: `cd backend && node --test src/services/dataImportService.test.js`

Expected: 全部通过。

### Task 4: 汇总验证与交付物

**Files:**
- Modify: `backend/METRICS.md`
- Modify: `backend/RISKS.md`
- Add: `backend/logs/task-SALES-EXP-404.md`
- Add: `backend/logs/task-IMPORT-TX-01.md`
- Add: `backend/RESULTS/SALES-EXP-404.md`
- Add: `backend/RESULTS/IMPORT-TX-01.md`
- Add: `backend/PATCHES/SALES-EXP-404.diff`
- Add: `backend/PATCHES/IMPORT-TX-01.diff`

**Step 1: 跑最终定向验证**

Run: `cd backend && node --test src/routes/sales.test.js src/services/exportService.test.js src/services/pdfExportService.test.js src/services/dataImportService.test.js`

**Step 2: 更新台账与结果**

写入验证结果、风险残留和补丁路径。
