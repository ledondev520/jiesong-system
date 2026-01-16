# Findings

## Technical Stack Change
- **Documented**: Next.js Fullstack (API Routes).
- **Actual**: Frontend (Next.js) + Backend (Express/Prisma) separation.
- **Action**: Creating `frontend` directory for Next.js app. Backend exists in `backend`.

## Backend Alignment
- Backend is using Express + Prisma.
- Database is SQLite.
- API alignment will be crucial. I will assume standard RESTful patterns based on Prisma Schema.
