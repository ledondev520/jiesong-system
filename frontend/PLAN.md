# 2026-03-23 Round 19: Frontend E2E stabilization before commit

## Goal
- Clear the last pre-commit Playwright failures and turn the frontend into a truly commit-ready state.
- Re-verify backend/frontend gates on fresh production output instead of relying on earlier partial green runs.

## Planned Execution
- Remove the production hydration mismatch in the dashboard shell.
- Update stale E2E mocks and assertions for current IA, import contracts, AI stats/history, and purchase file endpoints.
- Rebuild the frontend, run against a fresh preview on `127.0.0.1:3004`, and rerun the full E2E suite.
- Re-run the backend/frontend verification stack before commit.

## Verification Plan
- `npm run test`
- `npm run lint`
- `npm run build`
- `npm run test:e2e`

## Execution Outcome
- `src/app/dashboard/layout.tsx` now uses `useSyncExternalStore` for persisted-auth hydration, fixing the production shell mismatch that surfaced as `React error #418`.
- `src/components/layout/Header.tsx` now renders its date string through an SSR-safe subscription pattern rather than render-time clock reads.
- `src/app/dashboard/purchase/create/components/CreatePurchasePageContent.tsx` and `src/app/dashboard/sales/create/page.tsx` now initialize `signedAt` client-side after mount.
- `e2e/helpers.ts` now includes the missing mocks for procurement-template store routes, AI token/history endpoints, paginated import history, and purchase file APIs.
- `e2e/smoke.spec.ts` now matches the current dashboard/settings IA and no longer depends on removed tabs or labels.
- `e2e/button-coverage.spec.ts` no longer scans the removed `/dashboard/logs` route.
- `src/services/dataImportService.ts` now accepts both array and paginated import-history payloads, with regression coverage in `src/services/dataImportService.test.ts`.

## Verification
- `npm run test` => `110` files / `356` tests passed.
- `npm run lint` => passed.
- `npm run build` => passed.
- `npm run test:e2e` => `57/57` passed.

## Phase Boundary
- This round is successful only if the prior “feature-complete but not commit-ready” state is eliminated, the full Playwright suite passes on a fresh production preview, and the frontend can be committed without known gate failures.

# 2026-03-23 Round 18: Frontend next iterations round 7

## Goal
- Finish the remaining `docs/frontend-next-iterations-2026-03.md` scope with `FE-MODULE-01` and `FE-QA-01`.
- Differentiate procurement/export module homes and add screenshot-regression coverage for the highest-signal pages.

## Planned Execution
- Add a procurement overview band to `src/app/dashboard/contracts/components/ContractsPageContent.tsx`.
- Add an export-shipping overview band to `src/app/dashboard/sales/page.tsx`.
- Add Playwright visual coverage in `e2e/visual.spec.ts` for:
  - login
  - dashboard
  - procurement
  - finance
  - mobile dashboard first screen
- Stabilize the visual gate by running against a dedicated production preview port and by filling the missing finance mocks in `e2e/helpers.ts`.

## Verification Plan
- `npm run test -- src/app/dashboard/contracts/page.test.tsx src/app/dashboard/sales/page.test.tsx src/app/dashboard/finance/page.test.tsx`
- `npm run lint -- src/app/dashboard/contracts/components/ContractsPageContent.tsx src/app/dashboard/contracts/page.test.tsx src/app/dashboard/sales/page.tsx src/app/dashboard/sales/page.test.tsx src/app/dashboard/finance/page.tsx src/app/dashboard/finance/page.test.tsx`
- `npm run test:e2e -- e2e/visual.spec.ts`
- `npm run build`

## Execution Outcome
- Procurement now has a dedicated top-of-page overview section summarizing:
  - active follow-up contracts
  - producing contracts
  - shipped-but-not-received contracts
  - active stores
- Export now has a dedicated shipment overview section summarizing:
  - contracts preparing for loading
  - in-transit containers
  - arrived-but-not-closed contracts
  - total box count
- Added `e2e/visual.spec.ts` and generated snapshot baselines for:
  - login
  - dashboard
  - procurement
  - finance
  - mobile dashboard first screen
- `playwright.config.ts` now uses a dedicated production preview on `127.0.0.1:3004`.
- `e2e/helpers.ts` now includes the missing finance mocks for exchange rate, payment trends, and overdue receivables.

## Verification
- `npm run test -- src/app/dashboard/contracts/page.test.tsx src/app/dashboard/sales/page.test.tsx src/app/dashboard/finance/page.test.tsx`
- `npm run lint -- src/app/dashboard/contracts/components/ContractsPageContent.tsx src/app/dashboard/contracts/page.test.tsx src/app/dashboard/sales/page.tsx src/app/dashboard/sales/page.test.tsx src/app/dashboard/finance/page.tsx src/app/dashboard/finance/page.test.tsx`
- `npm run test:e2e -- e2e/visual.spec.ts --grep visual-finance --update-snapshots`
- `npm run test:e2e -- e2e/visual.spec.ts`
- `npm run build`

## Phase Boundary
- This round is successful only if procurement/export home surfaces are no longer generic clones, the five screenshot baselines are stable under Playwright, and the full March frontend-iteration plan is complete.

# 2026-03-23 Round 17: Frontend next iterations round 6

## Goal
- Continue `docs/frontend-next-iterations-2026-03.md` with `FE-AI-01`.
- Reduce the AI assistant from a high-attention floating surface into a quieter assistive entry.

## Planned Execution
- Keep the chat/image/SSE logic intact while changing presentation and mount rules.
- Update `LazyAIAssistantMount.tsx` so the dedicated AI workspace no longer also gets the global assistant.
- Update `AIAssistant.tsx` so the default entry is quieter and the conversation opens as a right-side panel.
- Add failing tests first for both mount boundary and panel semantics.

## Verification Plan
- `npm run test -- src/components/ai/AIAssistant.test.tsx src/components/ai/LazyAIAssistantMount.test.tsx`
- `npm run lint -- src/components/ai/AIAssistant.tsx src/components/ai/AIAssistant.test.tsx src/components/ai/LazyAIAssistantMount.tsx src/components/ai/LazyAIAssistantMount.test.tsx`
- `npm run build`

## Execution Outcome
- `LazyAIAssistantMount.tsx` now skips `/dashboard/ai/*`, preventing duplicate assistant presence in the dedicated AI workspace.
- `AIAssistant.tsx` now uses a lower-noise trigger instead of the large floating circular button.
- The assistant opens as a right-side panel with explicit `complementary` semantics.
- Existing chat, upload, paste, drag-drop, and SSE-response behavior stays covered by the refreshed tests.

## Verification
- `npm run test -- src/components/ai/AIAssistant.test.tsx src/components/ai/LazyAIAssistantMount.test.tsx`
- `npm run lint -- src/components/ai/AIAssistant.tsx src/components/ai/AIAssistant.test.tsx src/components/ai/LazyAIAssistantMount.tsx src/components/ai/LazyAIAssistantMount.test.tsx`
- `npm run build`

## Phase Boundary
- This round is successful only if the assistant is visibly less intrusive by default, AI workspace duplication is removed, and the existing assistant capabilities remain intact under focused verification.

# 2026-03-23 Round 16: Frontend next iterations round 5

## Goal
- Continue `docs/frontend-next-iterations-2026-03.md` with `FE-SHELL-01` and `FE-SEARCH-01`.
- Decompose the overloaded `Header` shell and move global search behind a thinner aggregation service.

## Planned Execution
- Reduce `src/components/layout/Header.tsx` to shell orchestration only.
- Extract focused child components:
  - `HeaderMobileNav`
  - `HeaderSearch`
  - `HeaderNotifications`
  - `HeaderUserMenu`
- Add `src/services/dashboardSearch.service.ts` so search no longer fans out across five endpoints directly inside `Header`.
- Add red tests first for staged search and Header search delegation before wiring the refactor.

## Verification Plan
- `npm run test -- src/components/layout/Header.test.tsx src/services/dashboardSearch.service.test.ts`
- `npm run lint -- src/components/layout/Header.tsx src/components/layout/Header*.tsx src/services/dashboardSearch.service.ts src/services/dashboardSearch.service.test.ts`
- `npm run build`

## Execution Outcome
- `src/components/layout/Header.tsx` is now a shell orchestrator rather than the place where mobile navigation, search fanout, notifications, and user menu all coexist.
- Added focused child components:
  - `HeaderMobileNav`
  - `HeaderSearch`
  - `HeaderNotifications`
  - `HeaderUserMenu`
- Added `src/services/dashboardSearch.service.ts` with staged search:
  - `products + suppliers` first
  - `containers + purchases + sales` only when the first batch is insufficient
- Added focused regressions in:
  - `src/components/layout/Header.test.tsx`
  - `src/services/dashboardSearch.service.test.ts`

## Verification
- `npm run test -- src/components/layout/Header.test.tsx src/services/dashboardSearch.service.test.ts`
- `npm run lint -- src/components/layout/Header.tsx src/components/layout/Header*.tsx src/services/dashboardSearch.service.ts src/services/dashboardSearch.service.test.ts`
- `npm run build`

## Phase Boundary
- This round is successful only if Header responsibilities are materially clearer, search no longer lives as five direct requests in the component, and focused verification proves the user-facing search flow still works.

# 2026-03-23 Round 15: Frontend next iterations round 4

## Goal
- Continue `docs/frontend-next-iterations-2026-03.md` with `FE-SPLIT-02`.
- Decompose the oversized store recommendation route without changing its behavior.

## Planned Execution
- Keep `src/app/dashboard/store-recommend/page.tsx` as a thin route wrapper.
- Extract a single stateful content component to own AI/template/store selection state.
- Split the page into:
  - `StoreRecommendTemplateTab`
  - `StoreRecommendAITab`
  - `StoreRecommendStatsTab`
  - shared helpers for category mapping, priority badges, and CSV export
- Add or tighten page-level regression around store switching before the split.

## Verification Plan
- `npm run test -- src/app/dashboard/store-recommend/page.test.tsx`
- `npm run lint -- src/app/dashboard/store-recommend/page.tsx src/app/dashboard/store-recommend/page.test.tsx src/app/dashboard/store-recommend/components/*.tsx src/test/setup.ts`
- `npm run build`

## Execution Outcome
- `src/app/dashboard/store-recommend/page.tsx` is now a thin wrapper.
- The page logic is now split into:
  - `StoreRecommendPageContent`
  - `StoreRecommendTemplateTab`
  - `StoreRecommendAITab`
  - `StoreRecommendStatsTab`
  - `storeRecommendShared`
- Added a store-switching regression test and stabilized Radix Select interactions in `src/test/setup.ts`.

## Verification
- `npm run test -- src/app/dashboard/store-recommend/page.test.tsx`
- `npm run lint -- src/app/dashboard/store-recommend/page.tsx src/app/dashboard/store-recommend/page.test.tsx src/app/dashboard/store-recommend/components/*.tsx src/test/setup.ts`
- `npm run build`

## Phase Boundary
- This round is successful only if the route becomes materially easier to evolve while the store-switching/template/AI/stats behavior remains stable under tests and production build.

# 2026-03-23 Round 14: Frontend next iterations round 3

## Goal
- Continue `docs/frontend-next-iterations-2026-03.md` with `FE-STATE-01`.
- Unify loading / empty / error states across the highest-traffic dashboard pages without changing backend contracts.

## Planned Execution
- Add a shared state presentation layer in `src/components/ui/data-state.tsx`.
- Adopt it first in:
  - `src/app/dashboard/finance/page.tsx`
  - `src/app/dashboard/reports/page.tsx`
  - `src/app/dashboard/payments/page.tsx`
  - `src/app/dashboard/containers/page.tsx`
  - `src/app/dashboard/inventory-container/page.tsx`
- Add regression tests for shared state rendering and page-level state adoption before wiring the new components in.

## Verification Plan
- `npm run test -- src/components/ui/data-state.test.tsx src/app/dashboard/finance/page.test.tsx src/app/dashboard/reports/page.test.tsx src/app/dashboard/containers/page.test.tsx src/app/dashboard/inventory-container/page.test.tsx src/app/dashboard/payments/page.test.tsx`
- `npm run lint -- src/components/ui/data-state.tsx src/components/ui/data-state.test.tsx src/app/dashboard/finance/page.tsx src/app/dashboard/finance/page.test.tsx src/app/dashboard/reports/page.tsx src/app/dashboard/reports/page.test.tsx src/app/dashboard/containers/page.tsx src/app/dashboard/containers/page.test.tsx src/app/dashboard/inventory-container/page.tsx src/app/dashboard/inventory-container/page.test.tsx src/app/dashboard/payments/page.tsx src/app/dashboard/payments/page.test.tsx`
- `npm run build`

## Execution Outcome
- Added `src/components/ui/data-state.tsx` with:
  - `LoadingState`
  - `ErrorState`
  - `TableStateRow`
- Added `src/components/ui/data-state.test.tsx` to lock the shared state primitives.
- Replaced bespoke state blocks in the five highest-traffic target pages with shared state components.
- Preserved the existing core titles (`加载中...`, `数据加载失败`, `暂无*`) while standardizing layout and retry affordances.

## Verification
- `npm run test -- src/components/ui/data-state.test.tsx src/app/dashboard/finance/page.test.tsx src/app/dashboard/reports/page.test.tsx src/app/dashboard/containers/page.test.tsx src/app/dashboard/inventory-container/page.test.tsx src/app/dashboard/payments/page.test.tsx`
- `npm run lint -- src/components/ui/data-state.tsx src/components/ui/data-state.test.tsx src/app/dashboard/finance/page.tsx src/app/dashboard/finance/page.test.tsx src/app/dashboard/reports/page.tsx src/app/dashboard/reports/page.test.tsx src/app/dashboard/containers/page.tsx src/app/dashboard/containers/page.test.tsx src/app/dashboard/inventory-container/page.tsx src/app/dashboard/inventory-container/page.test.tsx src/app/dashboard/payments/page.tsx src/app/dashboard/payments/page.test.tsx`
- `npm run build`

## Phase Boundary
- This round is successful only if shared state rendering exists, the five target pages use it, and verification proves the state-system cleanup did not break page behavior.

# 2026-03-23 Round 13: Frontend next iterations round 2

## Goal
- Continue `docs/frontend-next-iterations-2026-03.md` with `FE-SPLIT-01`.
- Decompose the oversized finance statements route into clearer page/container/section/dialog boundaries without changing behavior.

## Planned Execution
- Keep `src/app/dashboard/finance/statements/page.tsx` as a thin route entry.
- Extract a single stateful container for data loading, import flows, and derived view-model state.
- Extract presentational sections for:
  - loading shell
  - empty state
  - overview/KPI area
  - trends/balance/detail tabs
  - historical alerts
  - upload dialog
- Add page-level regression tests before moving render blocks.

## Verification Plan
- `npm run test -- src/app/dashboard/finance/statements/page.test.tsx`
- `npm run lint -- src/app/dashboard/finance/statements/page.tsx src/app/dashboard/finance/statements/page.test.tsx src/app/dashboard/finance/statements/components/*.tsx`
- `npm run build`

## Execution Outcome
- `src/app/dashboard/finance/statements/page.tsx` is now a thin route wrapper.
- The statements page is now split around the existing component boundaries:
  - `FinancialStatementsPageContent`: page state, effects, import flows, and derived view-model
  - `FinancialStatementsOverview`: header actions, empty state, alerts, KPI cards, working-capital overview
  - `FinancialStatementsTabsSection`: chart tabs, detail tab, and historical alerts
  - `FinancialStatementsUploadDialog`: file upload and period input dialog
- Added `src/app/dashboard/finance/statements/page.test.tsx` to lock the page-level behavior before and after the refactor.

## Verification
- `npm run test -- src/app/dashboard/finance/statements/page.test.tsx`
- `npm run lint -- src/app/dashboard/finance/statements/page.tsx src/app/dashboard/finance/statements/page.test.tsx src/app/dashboard/finance/statements/components/FinancialStatementsPageContent.tsx src/app/dashboard/finance/statements/components/FinancialStatementsOverview.tsx src/app/dashboard/finance/statements/components/FinancialStatementsTabsSection.tsx src/app/dashboard/finance/statements/components/FinancialStatementsUploadDialog.tsx src/app/dashboard/finance/statements/components/FinancialStatementsShared.tsx src/app/dashboard/finance/statements/components/financialStatementsFormatting.ts`
- `npm run build`

## Phase Boundary
- This round is successful only if the finance statements page becomes materially easier to evolve while preserving its current import, tab, and detail behavior.

# 2026-03-22 Round 12: Frontend next iterations round 1

## Goal
- Start executing `docs/frontend-next-iterations-2026-03.md` instead of leaving it as backlog only.
- Complete the first slice:
  - `FE-DASH-01` dashboard home redesign
  - `FE-NAV-02` deeper navigation registry behavior

## Planned Execution
- Reframe `src/app/dashboard/page.tsx` into a true workspace homepage.
- Rework `src/components/dashboard/DataDashboard.tsx` around:
  - 当前焦点
  - 高频动作
  - 风险提醒
  - 关键趋势
- Extend `src/components/layout/navigation.config.ts` with visibility/default-landing/redirect metadata.
- Keep the scope inside dashboard home + shell metadata. Large-page decomposition stays out of scope.

## Execution Outcome
- `FE-DASH-01`
  - Removed the old `快速录入 + ProductTracker + legacy chart stack` composition from `/dashboard`.
  - Promoted the homepage into a workspace with four visible zones:
    - 当前焦点
    - 高频动作
    - 风险提醒
    - 关键趋势
  - Demoted `ProductTracker` into a secondary `经营工具` section.
  - Reworked `DataDashboard.tsx` to derive focus/risk summaries from the existing analytics contract instead of widening backend scope.
- `FE-NAV-02`
  - Extended `navigation.config.ts` with `defaultHref`, `visibleRoles`, and helper functions for target resolution and active-route matching.
  - Hid the admin module for non-admin roles in shared registry consumers.
  - Unified sidebar/mobile navigation target resolution through the same registry helper.
  - Added layout-level fallback redirect from hidden dashboard modules back to the default visible dashboard landing.

## Verification Plan
- `npm run test -- src/app/dashboard/page.test.tsx src/components/dashboard/DataDashboard.test.tsx src/app/dashboard/layout.test.tsx src/components/layout/Sidebar.test.tsx src/components/layout/Header.test.tsx`
- `npm run lint -- src/app/dashboard/page.tsx src/components/dashboard/DataDashboard.tsx src/app/dashboard/page.test.tsx src/components/dashboard/DataDashboard.test.tsx src/components/layout/navigation.config.ts src/app/dashboard/layout.tsx src/app/dashboard/layout.test.tsx src/components/layout/Sidebar.test.tsx`
- `npm run build`

## Verification
- `npm run test -- src/app/dashboard/page.test.tsx src/components/dashboard/DataDashboard.test.tsx src/components/layout/navigation.config.test.ts src/app/dashboard/layout.test.tsx src/components/layout/Sidebar.test.tsx`
- `npm run lint -- src/app/dashboard/page.tsx src/app/dashboard/page.test.tsx src/components/dashboard/DataDashboard.tsx src/components/dashboard/DataDashboard.test.tsx src/components/layout/navigation.config.ts src/components/layout/navigation.config.test.ts src/components/layout/Sidebar.tsx src/components/layout/Sidebar.test.tsx src/components/layout/Header.tsx src/components/layout/ModuleTabHeader.tsx src/app/dashboard/layout.tsx src/app/dashboard/layout.test.tsx`
- `npm run build`

## Phase Boundary
- This round is successful only if the dashboard homepage meaningfully changes hierarchy and the shell derives more behavior from the registry without breaking existing navigation flows.

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
