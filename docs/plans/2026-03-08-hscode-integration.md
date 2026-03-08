# HSCode Local Database Integration Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为商品管理页接入本地 HSCode 数据库、查询服务、API 与前端智能匹配流程，支持按商品名称推荐 HSCode 并展示退税率。

**Architecture:** 在 `backend/prisma` 新增 `HsCode` 表并通过种子脚本写入本地基础数据；后端增加独立 `hsCodeService` 与 `hsCodes` 路由，对外提供名称搜索和编码详情查询；前端在商品弹窗中增加“HSCode 智能匹配”入口，调用新服务并将匹配结果回填到商品表单，同时展示推荐税率作为辅助信息，不扩展现有 `Product` 持久模型。

**Tech Stack:** Prisma + SQLite、Express、Node test、Next.js、React Hook Form、Vitest

---

### Task 1: 数据模型与迁移

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/*_add_hs_codes_table/migration.sql`
- Test: `backend/src/services/hsCodeService.test.js`

**Step 1: Write the failing test**

- 新增 `backend/src/services/hsCodeService.test.js`
- 先约束 `searchByProductName` / `searchByHsCode` / `getTaxRate` 三个接口返回行为与排序规则

**Step 2: Run test to verify it fails**

Run: `cd backend && node --test src/services/hsCodeService.test.js`

Expected: FAIL，因为 `hsCodeService.js` 尚不存在

**Step 3: Write minimal schema and migration**

- 在 Prisma schema 中新增 `HsCode` 模型：
  - `id`
  - `hsCode`
  - `productName`
  - `taxRate`
  - `unit`
  - `note`
  - `effectiveDate`
- 添加 `hsCode` 唯一约束/索引，`productName` 普通索引
- 执行迁移命令生成 `add_hs_codes_table`

**Step 4: Run schema verification**

Run: `cd backend && npx prisma migrate dev --name add_hs_codes_table`

Expected: migration 生成成功，Prisma Client 更新成功

**Step 5: Commit**

略，本轮不自动提交

### Task 2: 种子数据、服务层、API

**Files:**
- Create: `backend/scripts/seed-hscodes.js`
- Create: `backend/src/services/hsCodeService.js`
- Create: `backend/src/routes/hsCodes.js`
- Modify: `backend/src/routes/index.js`
- Test: `backend/src/services/hsCodeService.test.js`
- Test: `backend/src/routes/hsCodes.test.js`

**Step 1: Write the failing route test**

- 新增 `backend/src/routes/hsCodes.test.js`
- 断言路由模块可加载，且暴露 `/search` 和 `/:code`

**Step 2: Run tests to verify they fail**

Run: `cd backend && node --test src/services/hsCodeService.test.js src/routes/hsCodes.test.js`

Expected: FAIL，因为实现文件缺失

**Step 3: Write minimal implementation**

- `seed-hscodes.js` 写入 100 条常见商品数据，支持重复执行时幂等更新
- `hsCodeService.js` 实现：
  - `searchByProductName(keyword)`
  - `searchByHsCode(code)`
  - `getTaxRate(code)`
- `hsCodes.js` 提供：
  - `GET /api/v1/hs-codes/search?keyword=...`
  - `GET /api/v1/hs-codes/:code`
- 在路由聚合中注册新模块

**Step 4: Run tests to verify they pass**

Run: `cd backend && node --test src/services/hsCodeService.test.js src/routes/hsCodes.test.js`

Expected: PASS

**Step 5: Seed verification**

Run: `cd backend && node scripts/seed-hscodes.js`

Expected: 成功写入或更新 100 条 HSCode 数据

### Task 3: 前端智能匹配集成

**Files:**
- Create: `frontend/src/services/hsCode.service.ts`
- Create: `frontend/src/services/hsCode.service.test.ts`
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/app/dashboard/products/components/ProductDialog.tsx`
- Modify: `frontend/src/app/dashboard/products/page.test.tsx`

**Step 1: Write the failing front-end tests**

- 服务层测试覆盖 `search` / `getByCode`
- 页面/弹窗测试覆盖“点击智能匹配 -> 拉取候选 -> 选择后回填 HSCode 并显示税率”

**Step 2: Run tests to verify they fail**

Run: `cd frontend && npm run test -- src/services/hsCode.service.test.ts src/app/dashboard/products/page.test.tsx`

Expected: FAIL，因为前端服务与交互尚不存在

**Step 3: Write minimal implementation**

- 新增 HSCode 前端服务
- 在商品弹窗加入匹配入口、候选列表、选中回填逻辑
- 将推荐税率展示为只读辅助字段，不写入 `Product` 持久模型

**Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test -- src/services/hsCode.service.test.ts src/app/dashboard/products/page.test.tsx`

Expected: PASS

### Task 4: 轮次收口与台账

**Files:**
- Modify: `PLAN.md`
- Modify: `TASKS.md`
- Modify: `RISKS.md`
- Modify: `METRICS.md`
- Create: `backend/logs/task-HSCODE-01.md`
- Create: `backend/RESULTS/HSCODE-01.md`
- Create: `backend/PATCHES/HSCODE-01.diff`

**Step 1: Update checkpoints**

- 记录本轮目标、风险、验证结果、剩余问题

**Step 2: Run final verification**

Run:
- `cd backend && node --test src/services/hsCodeService.test.js src/routes/hsCodes.test.js`
- `cd frontend && npm run test -- src/services/hsCode.service.test.ts src/app/dashboard/products/page.test.tsx`

Expected: 全部通过
