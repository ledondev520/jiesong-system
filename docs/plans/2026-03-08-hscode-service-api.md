# HSCode Service API Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the backend HSCode service and API endpoints for keyword search, code lookup, and tax-rate lookup with unit coverage.

**Architecture:** Add a thin service layer over `prisma.hsCode`, expose a focused Express router under `/hs-codes`, and keep tests lightweight with mocked Prisma delegates plus router registration checks. The implementation should normalize inputs, clamp the search limit, and preserve the repo's existing Node `--test` pattern.

**Tech Stack:** Node.js, Express, Prisma, node:test, assert/strict

---

### Task 1: Checkpoint And Red Tests

**Files:**
- Modify: `PLAN.md`
- Modify: `TASKS.md`
- Modify: `backend/PLAN.md`
- Modify: `backend/TASKS.md`
- Test: `backend/src/services/hsCodeService.test.js`
- Test: `backend/src/routes/hsCodes.test.js`

**Step 1: Register the work in checkpoint files**

Update the root and backend task boards so `HSCODE-02` is the active item for this session.

**Step 2: Run the failing tests**

Run: `cd backend && node --test src/services/hsCodeService.test.js src/routes/hsCodes.test.js`

Expected: FAIL because `./hsCodeService` and `./hsCodes` do not exist yet.

### Task 2: Service Implementation

**Files:**
- Create: `backend/src/services/hsCodeService.js`
- Test: `backend/src/services/hsCodeService.test.js`

**Step 1: Implement `searchByProductName(keyword, limit)`**

Use `prisma.hsCode.findMany` with:
- `where.productName.contains = keyword`
- `orderBy = [{ effectiveDate: 'desc' }, { hsCode: 'asc' }]`
- `take = normalized limit`

**Step 2: Implement `searchByHsCode(code)`**

Use `prisma.hsCode.findFirst` with:
- exact `hsCode`
- latest `effectiveDate`

**Step 3: Implement `getTaxRate(hsCode)`**

Return the matched record's `taxRate`, otherwise `null`.

**Step 4: Run service tests**

Run: `cd backend && node --test src/services/hsCodeService.test.js`

Expected: PASS

### Task 3: Route Implementation

**Files:**
- Create: `backend/src/routes/hsCodes.js`
- Modify: `backend/src/routes/index.js`
- Test: `backend/src/routes/hsCodes.test.js`

**Step 1: Add `GET /search`**

Validate:
- `q` required and trimmed
- `limit` optional integer 1-50

Response body should use the repo's standard `{ code, message, data }` format.

**Step 2: Add `GET /:code`**

Lookup by HSCode and return `404` when no record exists.

**Step 3: Mount the router**

Mount `/hs-codes` in `backend/src/routes/index.js`.

**Step 4: Run route tests**

Run: `cd backend && node --test src/routes/hsCodes.test.js`

Expected: PASS

### Task 4: Verification And Artifacts

**Files:**
- Modify: `PLAN.md`
- Modify: `TASKS.md`
- Modify: `backend/PLAN.md`
- Modify: `backend/TASKS.md`
- Modify: `backend/RISKS.md`
- Modify: `backend/METRICS.md`
- Create: `backend/logs/task-HSCODE-02.md`
- Create: `backend/RESULTS/HSCODE-02.md`
- Create: `backend/PATCHES/HSCODE-02.diff`

**Step 1: Run final verification**

Run: `cd backend && node --test src/services/hsCodeService.test.js src/routes/hsCodes.test.js`

Expected: PASS

**Step 2: Record outputs**

Capture what was built, what was verified, and the final patch diff.
