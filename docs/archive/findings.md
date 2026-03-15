# Findings

## 2026-03-15 Ops Execution Center
- Existing `store-recommend` module is analytics/recommendation only; it does not support store type, opening stage, templates, or export.
- Existing `inventory` and `inventory-container` pages expose status flow, but no dedicated unshipped aggregation or assignee distribution.
- Existing `system/notifications` is a notification inbox, not a task/reminder engine.
- `users` API is admin-only, so the first unshipped assignment UI should not depend on global user lookup for non-admin roles.
- Lowest-risk first slice: add a new ops center page and persist assignee mappings under `SystemConfig`.
- `OPS-EXEC-01` is now shipped:
  - sidebar entry: `经营执行`
  - page path: `/dashboard/ops-execution`
  - backend read/write endpoints: `/api/v1/ops-execution/unshipped*`
- `OPS-EXEC-02` now ships template-backed purchase checklist generation with CSV export.
- `OPS-EXEC-03` now ships natural-language task creation plus a background reminder processor that emits notifications for matching users.

## Technical Stack Change
- **Documented**: Next.js Fullstack (API Routes).
- **Actual**: Frontend (Next.js) + Backend (Express/Prisma) separation.
- **Action**: Creating `frontend` directory for Next.js app. Backend exists in `backend`.

## Backend Alignment
- Backend is using Express + Prisma.
- Database is SQLite.
- API alignment will be crucial. I will assume standard RESTful patterns based on Prisma Schema.

## 2026-03-08 HSCode Live Source
- `https://www.hsbianma.com/Search/<page>?keywords=<chapter>` is reachable and returns HTML search results.
- Detail pages currently use 10-digit codes, for example `/Code/6904100000.html`.
- Detail pages expose these sections in HTML:
  - `基本信息`
  - `税率信息`
  - `申报要素`
  - `监管条件`
  - `检验检疫类别`
  - `协定税率`
  - `RCEP税率`
  - `所属章节`
  - `CIQ代码(13位海关编码)`
- User clarified scope: capture raw information first, postpone cleaning/import.
- Current raw snapshot path: `backend/data/hscode-live`.
- Current captured chapter prefixes: `01`、`02`、`03`、`04`、`05`、`69`.
- Exported consolidated CSV: `backend/data/hscode-live/hscode-live.csv`.
