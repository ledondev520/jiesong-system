# Findings

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
