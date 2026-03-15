# Ops Execution Center Plan

## Status
- [x] Phase 1: Confirm current capability gaps
- [x] Phase 2: Define implementation work units
- [x] Phase 3: Ship ops center entry + unshipped worklist v1
- [x] Phase 4: Start purchase checklist module foundation
- [x] Phase 5: Start task reminder engine foundation

## Goal
- Deliver a real "经营执行中台" entry point and make the unshipped-worklist module usable first.

## Scope
- In scope now:
  - dashboard entry page for ops execution
  - backend unshipped aggregation API
  - assignee distribution for unshipped rows
- Deferred to next phases:
  - store-type/opening-stage purchase checklist templates
  - natural-language task creation and reminder scheduling

## Deliverables
- `docs/plans/2026-03-15-ops-execution-center.md`
- `frontend/src/app/dashboard/ops-execution/page.tsx`
- `frontend/src/services/opsExecution.service.ts`
- `backend/src/controllers/opsExecutionController.js`
- `backend/src/routes/opsExecution.js`

## Current Notes
- Current repo already has store recommendation but not purchase template management.
- Current repo has notifications but no task/reminder domain model.
- First shipped slice will persist unshipped assignees via `SystemConfig` JSON to avoid blocking on Prisma migration.
- `OPS-EXEC-01` verification passed on 2026-03-15:
  - backend tests `4/4`
  - frontend tests `3/3`
  - frontend targeted lint passed
- `OPS-EXEC-02` / `OPS-EXEC-03` verification passed on 2026-03-15:
  - backend tests `17/17`
  - frontend tests `5/5`
  - frontend targeted lint passed

# HSCode Live Capture Plan

## Status
- [x] Phase 1: Verify live source availability
- [x] Phase 2: Add parser/scraper tests
- [x] Phase 3: Implement resumable raw-data scraper
- [x] Phase 4: Execute live capture and record artifacts

## Goal
- First capture all currently reachable HSCode detail information from `hsbianma.com` into local raw files.
- Defer cleaning, schema mapping, and database import until after the raw snapshot is complete.

## Scope
- Source discovery: chapter keyword search pages (`01`-`99`)
- Detail capture: per-code pages under `/Code/<10-digit>.html`
- Output: structured JSON records plus run manifest for resume/retry

## Deliverables
- `backend/scripts/scrape_hscode_raw.py`
- `backend/scripts/test_scrape_hscode_raw.py`
- `backend/scripts/export_hscode_csv.py`
- `backend/scripts/test_export_hscode_csv.py`
- `backend/data/hscode-live/records/*.json`
- `backend/data/hscode-live/manifest.json`
- `backend/data/hscode-live/hscode-live.csv`

## Current Notes
- Live site verified on 2026-03-08: search pages return 200, detail pages use 10-digit codes.
- Existing repo HSCode seed data is sample-only and not sufficient for direct business use.
- Current raw snapshot count: 908 records under `backend/data/hscode-live/records`.
- Current CSV output: `backend/data/hscode-live/hscode-live.csv`.
