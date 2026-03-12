# 2026-03-12 Round 8: Global shadcn/ui visual baseline unification

## Goal
- Re-align the frontend's shared visual system with the shadcn/ui baseline across the whole app, not just `/dashboard`.
- Reduce design drift by moving global tokens, layout chrome, and shared primitives back to a neutral shadcn-style shell.
- Keep future theme/palette work cheap by concentrating appearance in semantic CSS variables and shared UI primitives.

## Execution Outcome
- Reworked the shared theme surface in `src/app/globals.css` so cards, borders, muted backgrounds, sidebar, auth pages, and body background all use a simpler shadcn-style neutral palette.
- Refined the shared primitive layer in `src/components/ui/*` (`button`, `card`, `input`, `table`) to remove the heavier custom gloss and match the flatter shadcn interaction model.
- Updated the global shell in `src/app/dashboard/layout.tsx`, `src/components/layout/Header.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/layout/PageHeader.tsx`, and `src/components/layout/ThemeToggle.tsx`.
- Pulled the highest-traffic surfaces back into the same system: `src/app/dashboard/page.tsx`, `src/components/dashboard/DataDashboard.tsx`, `src/components/tools/ProductTracker.tsx`, and `src/components/ai/AIGreeting.tsx`.
- Cleared unrelated build blockers discovered during verification in:
  - `src/app/(auth)/login/page.tsx`
  - `src/app/customs-declarations/components/CustomsDeclarationForm.tsx`
  - `src/app/dashboard/inventory/page.tsx`
  - `src/components/dialog/GenerateThreeFormsDialog.tsx`

## Verification
- `npm test -- src/components/layout/Header.test.tsx src/components/layout/Sidebar.test.tsx src/components/layout/ThemeToggle.test.tsx src/app/dashboard/layout.test.tsx src/app/page.test.tsx src/app/dashboard/page.test.tsx src/components/dashboard/DataDashboard.test.tsx src/components/tools/ProductTracker.test.tsx src/components/ai/AIGreeting.test.tsx`
- `npm test -- src/app/dashboard/inventory/page.test.tsx`
- `npm run lint -- src/components/ui/button.tsx src/components/ui/card.tsx src/components/ui/input.tsx src/components/ui/table.tsx src/components/layout/Sidebar.tsx src/components/layout/Header.tsx src/components/layout/ThemeToggle.tsx src/components/layout/PageHeader.tsx src/app/dashboard/layout.tsx src/app/dashboard/page.tsx src/components/dashboard/DataDashboard.tsx src/components/tools/ProductTracker.tsx src/components/ai/AIGreeting.tsx src/components/layout/Sidebar.test.tsx src/app/(auth)/login/page.tsx`
- `npm run build`

## Phase Boundary
- This round establishes the global shadcn-style baseline and fixes the production build blockers uncovered by verification.
- Follow-up work should focus on page-by-page cleanup where older feature slices still layer custom one-off styling on top of the shared shell.

## 2026-03-12 Round 9: Blue shadcn/ui enforcement on remaining outlier pages

### Goal
- Finish the next cleanup pass for pages still visually drifting from the shadcn/ui baseline.
- Lock the frontend onto a blue shadcn-style theme instead of the temporary neutral baseline.

### Execution Outcome
- Switched the shadcn registry metadata to blue in `components.json` and updated `src/app/globals.css` token values to a blue-led palette for light and dark themes.
- Reworked shared semantic helpers in `src/components/ui/semantic-badge.tsx` and `src/components/ui/amount-text.tsx` to rely on standard shadcn-style semantic surfaces.
- Simplified the public service layout in `src/components/public/service-page.tsx` and removed route-level decorative overrides from:
  - `src/app/forex-verifications/page.tsx`
  - `src/app/tax-refunds/page.tsx`
- Pulled the most divergent operational pages closer to shadcn primitives:
  - `src/app/dashboard/store-recommend/page.tsx`
  - `src/app/dashboard/import/components/DataImportPageContent.tsx`

### Verification
- `npm run lint -- src/components/ui/semantic-badge.tsx src/components/ui/amount-text.tsx src/components/public/service-page.tsx src/app/forex-verifications/page.tsx src/app/tax-refunds/page.tsx src/app/dashboard/store-recommend/page.tsx src/app/dashboard/import/components/DataImportPageContent.tsx`
- `npm test -- src/components/public/service-page.test.tsx src/app/forex-verifications/page.test.tsx src/app/tax-refunds/page.test.tsx src/app/dashboard/store-recommend/page.test.tsx src/app/dashboard/import/page.test.tsx`
- `npm run build`

### Visual Evidence
- `frontend/qa-artifacts-ui-blue-login.png`
- `frontend/qa-artifacts-ui-blue-forex.png`

### Phase Boundary
- This round locks the app onto blue shadcn tokens and cleans the most visible remaining outliers.
- Remaining work should target deeper feature-detail pages that still use older chart-heavy page-local styling.

## 2026-03-12 Round 10: Final blue-token convergence for auth and finance surfaces

### Goal
- Finish another cleanup slice on pages that still exposed older accent classes or non-semantic color usage after the blue migration.
- Reduce reliance on legacy `text-chart-*` usages by converging them onto blue token families or standard shadcn semantic classes.

### Execution Outcome
- Tightened the remaining shared color drift in:
  - `src/components/layout/Header.tsx`
  - `src/components/dashboard/DataDashboard.tsx`
  - `src/app/globals.css`
- Simplified auth page headings and success states in:
  - `src/app/(auth)/login/page.tsx`
  - `src/app/(auth)/register/page.tsx`
  - `src/app/(auth)/forgot-password/page.tsx`
- Cleaned finance-oriented pages so their emphasis uses the blue baseline instead of mixed legacy chart colors:
  - `src/app/dashboard/finance/page.tsx`
  - `src/app/dashboard/payments/page.tsx`
- Finished the remaining visible import-page cleanup in `src/app/dashboard/import/components/DataImportPageContent.tsx`.
- Updated affected tests for the new semantic helper output:
  - `src/components/ui/amount-text.test.tsx`
  - `src/components/ui/semantic-badge.test.tsx`

### Verification
- `npm run lint -- src/app/(auth)/login/page.tsx src/app/(auth)/register/page.tsx src/app/(auth)/forgot-password/page.tsx src/components/layout/Header.tsx src/components/dashboard/DataDashboard.tsx src/app/dashboard/finance/page.tsx src/app/dashboard/payments/page.tsx src/app/dashboard/import/components/DataImportPageContent.tsx src/components/ui/amount-text.tsx src/components/ui/amount-text.test.tsx src/components/ui/semantic-badge.tsx src/components/ui/semantic-badge.test.tsx`
- `npm test -- src/components/ui/amount-text.test.tsx src/components/ui/semantic-badge.test.tsx src/app/(auth)/login/page.test.tsx src/app/(auth)/register/page.test.tsx src/app/(auth)/forgot-password/page.test.tsx src/app/dashboard/finance/page.test.tsx src/app/dashboard/payments/page.test.tsx`
- `npm run build`

### Phase Boundary
- This round completes the current cleanup pass for the most user-visible shells and finance/auth surfaces.
- The remaining backlog, if any, is limited to low-level feature detail polish rather than the global theme baseline.

## 2026-03-12 Round 11: Residual detail cleanup + local persistent frontend startup

### Goal
- Remove the last visible legacy color/gradient leftovers in detail and admin surfaces.
- Start the frontend locally in a persistent background process for immediate review.

### Execution Outcome
- Cleaned remaining legacy accent usage in:
  - `src/components/tools/ClaudeCostCalculator.tsx`
  - `src/app/dashboard/purchase/create/components/CreatePurchasePageContent.tsx`
  - `src/app/dashboard/settings/ports/page.tsx`
  - `src/app/dashboard/users/page.tsx`
  - `src/app/dashboard/suppliers/page.tsx`
  - `src/app/dashboard/finance/payable/page.tsx`
  - `src/app/dashboard/finance/receivable/page.tsx`
  - `src/app/dashboard/system/import-records/page.tsx`
  - `src/components/sales/ContractInfoEditor.tsx`
  - `src/app/dashboard/purchase/[id]/page.tsx`
  - `src/app/dashboard/containers/[id]/page.tsx`
  - `src/app/dashboard/sales/[id]/components/SalesDetailPageContent.tsx`
- Confirmed the remaining `text-brand-emphasis*` references are unused compatibility helpers in `globals.css`, not active page usage.
- Started the frontend with a persistent background process on port `3002`.
  - PID file: `frontend/.next-dev.pid`
  - Log file: `frontend/.next-dev.log`
  - URL: `http://localhost:3002`

### Verification
- `npm run lint -- src/components/tools/ClaudeCostCalculator.tsx src/app/dashboard/purchase/create/components/CreatePurchasePageContent.tsx src/app/dashboard/settings/ports/page.tsx src/app/dashboard/users/page.tsx src/app/dashboard/suppliers/page.tsx src/app/dashboard/finance/payable/page.tsx src/app/dashboard/finance/receivable/page.tsx src/app/dashboard/system/import-records/page.tsx src/components/sales/ContractInfoEditor.tsx src/app/dashboard/purchase/[id]/page.tsx src/app/dashboard/containers/[id]/page.tsx src/app/dashboard/sales/[id]/components/SalesDetailPageContent.tsx`
- `npm run build`
- `lsof -nP -iTCP:3002 -sTCP:LISTEN`

### Phase Boundary
- The app is now effectively on a blue shadcn/ui visual baseline end-to-end for normal user flows.
- Any follow-up would be optional polish, not required to complete the current UI unification goal.

# Customs Declaration Management

## 2026-03-12 Round 7: Frontend Coverage 98 Phase 1 Baseline

### Goal
- Build a trustworthy phase-1 baseline for the frontend `>=98%` coverage push before changing thresholds or widening coverage scope.

### Execution Outcome
- Confirmed the current Vitest coverage gate is still scoped to `src/components/**/*.ts(x)` plus `src/lib/**/*.ts`, with thresholds left at `10/10/20/20`.
- Counted the current covered scope versus the target scope:
  - Current configured scope: `79` files.
  - Target phase scope (`src/app`, `src/components`, `src/lib`, `src/services`): `243` files.
  - Immediate scope expansion delta: `+164` files.
- Replayed fresh full-suite commands and captured new blockers before coverage expansion:
  - `src/app/(auth)/login/page.test.tsx` is stale against the current security behavior and accessible-name structure.
  - High-interaction page tests are timing out under full-suite pressure in `customs-declarations`, `inventory-container`, and `sales/[id]`.

### Verification
- `npm run test`
- `npm run test:coverage`
- `npm run test -- src/app/'(auth)'/login/page.test.tsx`

### Phase Boundary
- Phase 1 is documentation and baseline only.
- No production code or test code was changed in this round.

## 2026-03-08 Round 6: Frontend Vitest Timeout Stabilization

### Goal
- Recover the frontend CI-equivalent Vitest gates without touching production code.

### Execution Outcome
- Reproduced the full-suite timeout failures in `customs-declarations/create`, `customs-declarations/[id]/edit`, and `dashboard/settings/ports`.
- Verified those tests pass in isolation, confirming the regression is timeout pressure under full-suite and coverage execution rather than broken UI behavior.
- Applied the minimal fix in `frontend/vitest.config.ts` by setting `testTimeout: 20000` and documenting the reason inline.

### Verification
- `npm run test`
- `npm run test:coverage`

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
