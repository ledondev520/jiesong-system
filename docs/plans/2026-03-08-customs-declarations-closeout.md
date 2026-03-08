# Customs Declarations Frontend Closeout Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Verify and close out the existing customs declarations frontend CRUD flow so the tax-refund adjacent workflow is fully tracked and ready for commit.

**Architecture:** Reuse the already-implemented `/customs-declarations` route set, treat verification as the source of truth, and only touch production code if fresh tests or checks expose a real defect. The main work in this round is evidence gathering plus checkpoint synchronization across repo-level and frontend-level tracking files.

**Tech Stack:** Next.js App Router, React, Vitest, Testing Library, TypeScript, markdown checkpoint artifacts

---

### Task 1: Verify the existing customs declarations frontend slice

**Files:**
- Verify: `frontend/src/services/customsDeclaration.service.ts`
- Verify: `frontend/src/services/customsDeclaration.service.test.ts`
- Verify: `frontend/src/app/customs-declarations/page.tsx`
- Verify: `frontend/src/app/customs-declarations/page.test.tsx`
- Verify: `frontend/src/app/customs-declarations/create/page.tsx`
- Verify: `frontend/src/app/customs-declarations/create/page.test.tsx`
- Verify: `frontend/src/app/customs-declarations/[id]/page.tsx`
- Verify: `frontend/src/app/customs-declarations/[id]/page.test.tsx`
- Verify: `frontend/src/app/customs-declarations/[id]/edit/page.tsx`
- Verify: `frontend/src/app/customs-declarations/[id]/edit/page.test.tsx`

**Step 1: Run the focused tests**

Run: `cd frontend && npm test -- src/services/customsDeclaration.service.test.ts src/app/customs-declarations/page.test.tsx src/app/customs-declarations/create/page.test.tsx 'src/app/customs-declarations/[id]/page.test.tsx' 'src/app/customs-declarations/[id]/edit/page.test.tsx'`

Expected: PASS. If any test fails, treat that failure as the actual implementation task and fix it before continuing.

**Step 2: Run lint and build**

Run: `cd frontend && npm run lint -- src/services/customsDeclaration.service.ts src/services/customsDeclaration.service.test.ts src/app/customs-declarations/layout.tsx src/app/customs-declarations/layout.test.tsx src/app/customs-declarations/page.tsx src/app/customs-declarations/page.test.tsx src/app/customs-declarations/create/page.tsx src/app/customs-declarations/create/page.test.tsx 'src/app/customs-declarations/[id]/page.tsx' 'src/app/customs-declarations/[id]/page.test.tsx' 'src/app/customs-declarations/[id]/edit/page.tsx' 'src/app/customs-declarations/[id]/edit/page.test.tsx' src/app/customs-declarations/components/CustomsDeclarationForm.tsx src/app/customs-declarations/components/CustomsDeclarationListPageContent.tsx src/app/customs-declarations/components/CustomsDeclarationDetailPageContent.tsx src/app/customs-declarations/components/CustomsDeclarationStatusBadge.tsx`

Run: `cd frontend && npm run build`

Expected: both commands exit 0.

**Step 3: Measure targeted coverage**

Run: `cd frontend && npm run test -- --coverage src/services/customsDeclaration.service.test.ts src/app/customs-declarations/page.test.tsx src/app/customs-declarations/create/page.test.tsx 'src/app/customs-declarations/[id]/page.test.tsx' 'src/app/customs-declarations/[id]/edit/page.test.tsx' src/app/customs-declarations/layout.test.tsx`

Expected: PASS with coverage numbers captured for the new slice.

### Task 2: Synchronize project checkpoints and delivery artifacts

**Files:**
- Modify: `PLAN.md`
- Modify: `TASKS.md`
- Modify: `frontend/PLAN.md`
- Modify: `frontend/TASKS.md`
- Modify: `frontend/RISKS.md`
- Modify: `frontend/METRICS.md`
- Create: `logs/task-CD-01.md`
- Create: `RESULTS/CD-01.md`
- Create: `PATCHES/CD-01.diff`

**Step 1: Record verified outcome**

Mark the customs declarations frontend work as completed if verification is green. If verification is red, record the real blocker and do not mark done.

**Step 2: Record residual risks honestly**

Close risks that are now mitigated by verification evidence. Leave any genuine backend-contract or future-scope risk open.

**Step 3: Capture artifacts**

Summarize the delivered route set, service contract, and exact verification commands/results in the log and results files, then snapshot the git diff into `PATCHES/CD-01.diff`.

### Task 3: Commit the closeout

**Files:**
- Commit tracked documentation/artifact updates from this round

**Step 1: Re-run any command needed for evidence freshness**

Use the latest successful verification outputs as the basis for the completion claim.

**Step 2: Create a single commit**

Run: `git add docs/plans/2026-03-08-customs-declarations-closeout.md PLAN.md TASKS.md frontend/PLAN.md frontend/TASKS.md frontend/RISKS.md frontend/METRICS.md logs/task-CD-01.md RESULTS/CD-01.md PATCHES/CD-01.diff`

Run: `git commit -m "docs: close out customs declarations frontend"`

Expected: one commit containing the verified closeout and checkpoint artifacts.
