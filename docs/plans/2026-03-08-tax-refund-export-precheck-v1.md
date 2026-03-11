# Tax Refund Export Precheck V1 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为出口退税导出新增申报前校验 V1，阻断缺失/不一致数据导出，并仅导出 `match_status=passed` 记录。

**Architecture:** 在 `taxRefund` 模型补齐退税导出所需字段；后端新增独立导出校验服务，负责规范化、P0 阻断、P1 告警和导出数据构建；通过 `taxRefundController`/`taxRefunds` 路由暴露导出入口，并以 Node 原生单测覆盖关键红绿路径。

**Tech Stack:** Node.js、Express、Prisma、node:test

---

### Task 1: 退税导出校验失败测试

**Files:**
- Create: `backend/src/services/taxRefundExportService.test.js`
- Test: `backend/src/services/taxRefundExportService.test.js`

**Step 1: Write the failing test**

- 覆盖 `relation_no` 缺失 / `invoice_no` 缺失 / `vat_rate_type` 与采购合同税率不一致时，导出被阻断。
- 断言返回 `blocked=true`、失败原因列表存在、`match_status` 被更新为非 `passed`。

**Step 2: Run test to verify it fails**

Run: `cd backend && node --test src/services/taxRefundExportService.test.js`

Expected: FAIL，因为服务文件与实现尚不存在。

### Task 2: 导出成功测试

**Files:**
- Modify: `backend/src/services/taxRefundExportService.test.js`

**Step 1: Write the failing test**

- 覆盖规范化 `relation_no` / `invoice_no` 的空格与前导 0。
- 断言成功结果仅导出 `match_status=passed` 记录，且返回规范化后的导出行。

**Step 2: Run test to verify it fails**

Run: `cd backend && node --test src/services/taxRefundExportService.test.js`

Expected: FAIL，因为实现尚未完成。

### Task 3: 最小实现

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/services/taxRefundService.js`
- Create: `backend/src/services/taxRefundExportService.js`
- Modify: `backend/src/controllers/taxRefundController.js`
- Modify: `backend/src/routes/taxRefunds.js`
- Modify: `backend/src/controllers/taxRefundController.test.js`
- Modify: `backend/src/routes/taxModules.test.js`

**Step 1: Write minimal implementation**

- `TaxRefund` 模型新增 `relation_no`、`invoice_no`、`vat_rate_type`、`match_status`。
- `taxRefundService` 的创建/更新流程接收新增字段。
- `taxRefundExportService` 实现：
  - 标识符规范化
  - P0 阻断校验
  - P1 告警
  - 仅输出 `match_status=passed` 记录
- 控制器/路由新增退税导出接口。

**Step 2: Run targeted tests**

Run: `cd backend && node --test src/services/taxRefundService.test.js src/services/taxRefundExportService.test.js src/controllers/taxRefundController.test.js src/routes/taxModules.test.js`

Expected: PASS

### Task 4: 台账与结果收口

**Files:**
- Modify: `PLAN.md`
- Modify: `TASKS.md`
- Modify: `RISKS.md`
- Modify: `METRICS.md`
- Create: `logs/task-TAX-EXPORT-01.md`
- Create: `RESULTS/TAX-EXPORT-01.md`
- Create: `PATCHES/TAX-EXPORT-01.diff`

**Step 1: Update project tracking**

- 记录本轮目标、风险、验证命令与结果。

**Step 2: Final verification**

Run: `git diff -- backend/prisma/schema.prisma backend/src/services/taxRefundService.js backend/src/services/taxRefundExportService.js backend/src/controllers/taxRefundController.js backend/src/routes/taxRefunds.js backend/src/services/taxRefundExportService.test.js backend/src/controllers/taxRefundController.test.js backend/src/routes/taxModules.test.js PLAN.md TASKS.md RISKS.md METRICS.md`

Expected: 仅包含本轮相关变更。
