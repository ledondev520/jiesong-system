# HSCode Session 1 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 完成 HSCode 表迁移与 100 条示例种子数据落库，确保 Prisma schema、migration、seed 脚本三者一致。

**Architecture:** 以现有 SQLite Prisma 项目为约束，沿用 `String/Float/DateTime` 模型风格；种子脚本通过可导出的静态样例数组 + `upsert` 实现幂等导入；验证链路覆盖数据样例约束、schema 校验、迁移执行、client 生成和落库执行。

**Tech Stack:** Node.js、Prisma、SQLite、node:test

---

### Task 1: 为 HSCode 种子脚本建立失败测试

**Files:**
- Create: `backend/scripts/seed-hscodes.test.js`
- Create: `backend/scripts/seed-hscodes.js`

**Step 1: Write the failing test**

```js
const { sampleHsCodes } = require('./seed-hscodes');

assert.equal(sampleHsCodes.length, 100);
assert.equal(new Set(sampleHsCodes.map((item) => item.hsCode)).size, 100);
```

**Step 2: Run test to verify it fails**

Run: `node --test scripts/seed-hscodes.test.js`
Expected: FAIL with `Cannot find module './seed-hscodes'`

**Step 3: Write minimal implementation**

```js
module.exports = { sampleHsCodes, seedHsCodes, main };
```

**Step 4: Run test to verify it passes**

Run: `node --test scripts/seed-hscodes.test.js`
Expected: PASS

### Task 2: 对齐 Prisma schema 与 migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Verify: `backend/prisma/migrations/20260308035256_add_hs_codes_table/migration.sql`

**Step 1: Verify schema shape**

确认字段 `id/hsCode/productName/taxRate/unit/note/effectiveDate` 与索引 `hsCode/productName` 对齐。

**Step 2: Run validation**

Run: `npx prisma validate`
Expected: PASS

**Step 3: Run migration**

Run: `npx prisma migrate dev --name add_hs_codes_table`
Expected: PASS or apply existing pending migration without reset

**Step 4: Generate client**

Run: `npx prisma generate`
Expected: PASS

### Task 3: 导入示例数据并更新台账

**Files:**
- Modify: `backend/PLAN.md`
- Modify: `backend/TASKS.md`
- Modify: `backend/RISKS.md`
- Modify: `backend/METRICS.md`
- Create: `backend/logs/task-HSCODE-01.md`
- Create: `backend/RESULTS/HSCODE-01.md`
- Create: `backend/PATCHES/HSCODE-01.diff`

**Step 1: Run seed script**

Run: `node scripts/seed-hscodes.js`
Expected: PASS with inserted/upserted count output

**Step 2: Record evidence**

记录验证命令结果、迁移状态、种子数据数量与已知限制（SQLite 无全文索引）。

**Step 3: Final verification**

Run:
- `node --test scripts/seed-hscodes.test.js`
- `npx prisma validate`
- `npx prisma migrate dev --name add_hs_codes_table`
- `npx prisma generate`
- `node scripts/seed-hscodes.js`

Expected: all PASS
