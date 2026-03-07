# Tax Refund Migration Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the tax refund module tables to Prisma, generate a migration, and regenerate the Prisma client.

**Architecture:** Keep the current SQLite-compatible Prisma style. Model the tax refund workflow around `SalesContract` as the export container aggregate, `PackingItem` as declaration-line source data, and `Product` as the tax-rate owner.

**Tech Stack:** Prisma 5, SQLite, Node.js

---

### Task 1: Capture the failing precondition

**Files:**
- Modify: `prisma/schema.prisma`
- Test: command-only precheck

**Step 1: Verify new models do not already exist**

Run: `rg -n "model (CustomsDeclaration|CustomsDeclarationItem|ForexVerification|TaxRefund|TaxRate)" prisma/schema.prisma`
Expected: no matches

**Step 2: Add the minimal schema**

Create five new models and the required relation fields on existing models.

**Step 3: Run validation**

Run: `npx prisma validate`
Expected: schema valid

### Task 2: Generate migration artifacts

**Files:**
- Create: `prisma/migrations/*`

**Step 1: Run migration**

Run: `npx prisma migrate dev --name add_tax_refund_module`
Expected: migration directory created and database updated

**Step 2: Regenerate client**

Run: `npx prisma generate`
Expected: Prisma Client generated successfully

### Task 3: Record delivery

**Files:**
- Create: `logs/task-DB-TRM-01.md`
- Create: `RESULTS/DB-TRM-01.md`
- Create: `PATCHES/DB-TRM-01.diff`
- Modify: `PLAN.md`
- Modify: `TASKS.md`
- Modify: `RISKS.md`
- Modify: `METRICS.md`

**Step 1: Record verification output**

Write the commands executed and their results.

**Step 2: Mark task complete**

Update `TASKS.md` from `DOING` to `DONE` after verification succeeds.
