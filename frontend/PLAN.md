# Customs Declaration Management

## Goal
- Deliver protected Next.js App Router pages for customs declaration list, detail, create, and edit flows at `/customs-declarations`.
- Reuse existing dashboard shell, shadcn/ui primitives, and `products`-style data/service patterns.

## Milestones
- M1: Define domain model, service contract, and reusable page components.
- M2: Implement list/detail/create/edit routes with shared form and status presentation.
- M3: Verify with focused unit tests, lint, build, and coverage reporting.

## Risks
- Backend payload shape for `/customs-declarations` is not discoverable from the frontend repo.
- Top-level protected route must reuse dashboard auth/layout cleanly without breaking navigation highlighting.
- Coverage needs to stay above 80% for the new feature slice.

## Mitigations
- Keep the client contract minimal and CRUD-aligned: standard list/get/create/update endpoints plus optional declaration items.
- Reuse the existing dashboard layout component in a dedicated route layout.
- Add focused Vitest coverage for list, detail, create, edit, and form normalization flows.

## Public Finance Service Pages
- Goal: deliver public informational routes at `/forex-verifications` and `/tax-refunds` with shadcn/ui primitives and the existing visual language.
- Milestones:
  - PF-1: add route and shared-component failing tests.
  - PF-2: implement a reusable public service-page component and route-specific wrappers.
  - PF-3: verify with targeted lint, tests, and coverage above 80% for the new feature slice.
- Risks:
  - Public routes could drift away from the current design system.
  - Repo-wide historical coverage is below the requested threshold, so verification must stay targeted to new files.
- Mitigations:
  - Reuse current CSS variables and shadcn/ui primitives instead of creating a separate landing-page system.
  - Record the exact targeted coverage command and results in `METRICS.md`.

## HSCode Frontend Integration
- Goal: deliver HSCode search APIs in the frontend and add smart matching to the product management flow at `/dashboard/products`.
- Milestones:
  - HS-01: add failing service/component tests for HSCode lookup and smart-fill behavior.
  - HS-02: implement `hsCode.service.ts` plus product-dialog smart matching and auto-fill for `hsCode` and `taxRate`.
  - HS-03: run focused tests/lint and checkpoint plan, tasks, metrics, risks, results, and patch artifacts.
- Risks:
  - Backend route implementation is not present in this checkout, so the frontend must target the route contract inferred from backend tests.
  - Product persistence currently does not include `taxRate`, so the frontend can only guarantee form auto-fill, not durable backend storage.
- Mitigations:
  - Bind the service to the tested backend contract `GET /hs-codes/search` and `GET /hs-codes/:code`.
  - Surface tax rate clearly in the form and pass it through submit payload without coupling the UI to backend schema changes.

## 2026-03-08 Round 4: Customs Declarations Closeout + Frontend Build Debt Cleanup

### Goal
- Close out the existing `/customs-declarations` frontend CRUD slice with fresh verification evidence.
- Restore `next build` by fixing the unrelated but blocking frontend type/config regressions uncovered during closeout.

### Execution Outcome
- Confirmed the customs declarations list/detail/create/edit flows and service layer were already implemented, then closed the gap between implementation and repo checkpoints.
- Added top-level `Suspense` wrappers for `/customs-declarations` and `/dashboard/tax-refunds` so `useSearchParams()` no longer breaks Next 16 prerendering.
- Restored the frontend build by:
  - installing `@sentry/nextjs` and trimming unsupported replay config from `sentry.client.config.ts`,
  - tightening `createCrudService` typings for the default all-methods-enabled case,
  - normalizing container/supplier form payload boundaries,
  - normalizing finance/config service payloads,
  - fixing purchase parser typing and purchase status badge completeness,
  - tightening `useApi` generic execution typing.

### Verification
- `npm test -- src/sentry.config.test.ts src/services/customsDeclaration.service.test.ts src/app/customs-declarations/page.test.tsx src/app/customs-declarations/create/page.test.tsx 'src/app/customs-declarations/[id]/page.test.tsx' 'src/app/customs-declarations/[id]/edit/page.test.tsx' src/app/dashboard/tax-refunds/page.test.tsx src/services/container.service.test.ts src/services/crudService.test.ts src/services/purchase.service.test.ts src/lib/hooks/useApi.test.ts`
- `npm run lint -- src/sentry.config.test.ts sentry.client.config.ts sentry.server.config.ts sentry.edge.config.ts src/services/customsDeclaration.service.ts src/services/customsDeclaration.service.test.ts src/app/customs-declarations/layout.tsx src/app/customs-declarations/layout.test.tsx src/app/customs-declarations/page.tsx src/app/customs-declarations/page.test.tsx src/app/customs-declarations/create/page.tsx src/app/customs-declarations/create/page.test.tsx 'src/app/customs-declarations/[id]/page.tsx' 'src/app/customs-declarations/[id]/page.test.tsx' 'src/app/customs-declarations/[id]/edit/page.tsx' 'src/app/customs-declarations/[id]/edit/page.test.tsx' src/app/customs-declarations/components/CustomsDeclarationForm.tsx src/app/customs-declarations/components/CustomsDeclarationListPageContent.tsx src/app/customs-declarations/components/CustomsDeclarationDetailPageContent.tsx src/app/customs-declarations/components/CustomsDeclarationStatusBadge.tsx src/app/dashboard/tax-refunds/page.tsx src/app/dashboard/tax-refunds/page.test.tsx src/services/container.service.ts src/services/container.service.test.ts src/services/crudService.ts src/services/crudService.test.ts src/services/purchase.service.ts src/services/purchase.service.test.ts src/lib/hooks/useApi.ts src/lib/hooks/useApi.test.ts src/services/config.service.ts src/app/dashboard/containers/page.tsx src/app/dashboard/containers/components/ContainerDialog.tsx src/app/dashboard/finance/payable/page.tsx src/app/dashboard/finance/receivable/page.tsx src/app/dashboard/payments/page.tsx src/app/dashboard/purchase/page.tsx src/app/dashboard/suppliers/page.tsx src/app/dashboard/suppliers/components/SupplierDialog.tsx src/services/supplier.service.ts`
- `npm run build`
- `npm run test -- --coverage src/services/customsDeclaration.service.test.ts src/app/customs-declarations/layout.test.tsx src/app/customs-declarations/page.test.tsx src/app/customs-declarations/create/page.test.tsx 'src/app/customs-declarations/[id]/page.test.tsx' 'src/app/customs-declarations/[id]/edit/page.test.tsx'`

## 2026-03-08 Round 5: Tax Refund Auto Draft Trigger

### Goal
- Expose the backend auto-draft generation capability on `/dashboard/tax-refunds`.
- Keep the UI minimal: one action button, one success/error toast, one reload pass.

### Execution Outcome
- `src/services/taxRefund.service.ts` 新增 `generateDrafts` 调用，绑定 `POST /tax-refunds/auto-drafts`。
- `src/app/dashboard/tax-refunds/components/TaxRefundListPageContent.tsx` 新增“自动生成草稿”按钮与生成中的状态。
- `src/types/index.ts` 中 `HsCodeRecord` 已扩展为兼容 live HSCode 查询返回字段。

### Verification
- `npm test -- src/services/taxRefund.service.test.ts src/app/dashboard/tax-refunds/page.test.tsx`
- `npm run lint -- src/services/taxRefund.service.ts src/services/taxRefund.service.test.ts src/app/dashboard/tax-refunds/page.tsx src/app/dashboard/tax-refunds/page.test.tsx src/app/dashboard/tax-refunds/components/TaxRefundListPageContent.tsx src/types/index.ts`
- `npm run build`

## 2026-03-08 Round 6: Customs Declaration Auto Draft Trigger

### Goal
- Expose the backend customs auto-draft generation capability on `/customs-declarations`.

### Execution Outcome
- `src/services/customsDeclaration.service.ts` 新增 `generateDrafts` 调用，绑定 `POST /customs-declarations/auto-drafts`。
- `src/app/customs-declarations/components/CustomsDeclarationListPageContent.tsx` 新增“自动生成草稿”按钮与生成中的状态。

### Verification
- `npm test -- src/services/customsDeclaration.service.test.ts src/app/customs-declarations/page.test.tsx`
- `npm run lint -- src/services/customsDeclaration.service.ts src/services/customsDeclaration.service.test.ts src/app/customs-declarations/components/CustomsDeclarationListPageContent.tsx src/app/customs-declarations/page.test.tsx`
- `npm run build`
