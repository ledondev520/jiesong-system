# Customs Declaration Management Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build protected list, detail, create, and edit pages for customs declarations at `/customs-declarations` using the existing dashboard shell and shadcn/ui components.

**Architecture:** Add a top-level protected route layout that reuses the dashboard frame, define a typed CRUD service for customs declarations, and share one form component between create/edit pages. Keep the list/detail pages read-oriented and align page structure, headers, tables, and toasts with the current `products`, `sales`, and `purchase` routes.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, shadcn/ui, react-hook-form, zod, Vitest, Testing Library.

---

### Task 1: Plan And Red Tests

**Files:**
- Create: `PLAN.md`
- Create: `TASKS.md`
- Create: `RISKS.md`
- Create: `METRICS.md`
- Create: `docs/plans/2026-03-07-customs-declarations.md`
- Create: `src/app/customs-declarations/page.test.tsx`
- Create: `src/app/customs-declarations/create/page.test.tsx`
- Create: `src/app/customs-declarations/[id]/page.test.tsx`
- Create: `src/app/customs-declarations/[id]/edit/page.test.tsx`

**Step 1: Write the failing tests**

Add route-level tests that assert:
- the list page loads declarations and supports search/filter navigation
- the create page loads and submits a normalized payload
- the detail page renders key summary data and line items
- the edit page loads an existing record and submits updates

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/app/customs-declarations/page.test.tsx src/app/customs-declarations/create/page.test.tsx src/app/customs-declarations/[id]/page.test.tsx src/app/customs-declarations/[id]/edit/page.test.tsx`

Expected: FAIL because the new routes and components do not exist yet.

### Task 2: Implement The Feature

**Files:**
- Create: `src/app/customs-declarations/layout.tsx`
- Create: `src/app/customs-declarations/page.tsx`
- Create: `src/app/customs-declarations/create/page.tsx`
- Create: `src/app/customs-declarations/[id]/page.tsx`
- Create: `src/app/customs-declarations/[id]/edit/page.tsx`
- Create: `src/app/customs-declarations/components/CustomsDeclarationForm.tsx`
- Create: `src/app/customs-declarations/components/CustomsDeclarationListPageContent.tsx`
- Create: `src/app/customs-declarations/components/CustomsDeclarationDetailPageContent.tsx`
- Create: `src/app/customs-declarations/components/CustomsDeclarationStatusBadge.tsx`
- Create: `src/services/customsDeclaration.service.ts`
- Modify: `src/types/index.ts`
- Modify: `src/components/layout/Sidebar.tsx`

**Step 1: Write the minimal implementation**

Implement:
- `CustomsDeclaration` and `CustomsDeclarationItem` types plus status enum
- CRUD service at `/customs-declarations`
- shared form with zod validation and payload normalization
- list/detail/create/edit pages with `PageHeader`, `Card`, `Table`, `Select`, `Input`, `Textarea`, and toast feedback
- sidebar entry for the new route

**Step 2: Run targeted tests**

Run: `npm run test -- src/app/customs-declarations/page.test.tsx src/app/customs-declarations/create/page.test.tsx src/app/customs-declarations/[id]/page.test.tsx src/app/customs-declarations/[id]/edit/page.test.tsx`

Expected: PASS

### Task 3: Verify And Record

**Files:**
- Modify: `PLAN.md`
- Modify: `TASKS.md`
- Modify: `RISKS.md`
- Modify: `METRICS.md`
- Create: `logs/task-cd-01.md`
- Create: `RESULTS/cd-01.md`
- Create: `PATCHES/cd-01.diff`

**Step 1: Run full validation**

Run:
- `npm run test -- --coverage`
- `npm run lint`
- `npm run build`

Expected: all pass, with the customs declarations slice covered above 80%.

**Step 2: Record status**

Update task board, metrics, risk status, and save a patch artifact summarizing the feature diff.
