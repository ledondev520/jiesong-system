# task-CD-01

- Scope: close out `/customs-declarations` frontend CRUD and bring `frontend` back to a passing `next build`.
- Plan: `/Users/helena/Cursor/jiesong_system/docs/plans/2026-03-08-customs-declarations-closeout.md`
- Key findings:
  - Customs declarations UI/service/tests were already implemented, but `frontend/TASKS.md` still showed `DOING/TODO`.
  - Fresh `next build` exposed unrelated blocking debt in Sentry config, CRUD service typings, form payload boundaries, finance/config services, and `useSearchParams()` pages.
- Actions taken:
  - Added `Suspense` wrappers to `/customs-declarations` and `/dashboard/tax-refunds`.
  - Installed `@sentry/nextjs` and aligned client config with the installed SDK exports.
  - Tightened default CRUD typings and normalized several page/service payload boundaries.
  - Re-ran tests, lint, build, and targeted coverage, then synchronized checkpoint files.
- Verification:
  - `cd frontend && npm test -- src/sentry.config.test.ts src/services/customsDeclaration.service.test.ts src/app/customs-declarations/page.test.tsx src/app/customs-declarations/create/page.test.tsx 'src/app/customs-declarations/[id]/page.test.tsx' 'src/app/customs-declarations/[id]/edit/page.test.tsx' src/app/dashboard/tax-refunds/page.test.tsx src/services/container.service.test.ts src/services/crudService.test.ts src/services/purchase.service.test.ts src/lib/hooks/useApi.test.ts`
  - `cd frontend && npm run lint -- <touched-files>`
  - `cd frontend && npm run build`
  - `cd frontend && npm run test -- --coverage src/services/customsDeclaration.service.test.ts src/app/customs-declarations/layout.test.tsx src/app/customs-declarations/page.test.tsx src/app/customs-declarations/create/page.test.tsx 'src/app/customs-declarations/[id]/page.test.tsx' 'src/app/customs-declarations/[id]/edit/page.test.tsx'`
