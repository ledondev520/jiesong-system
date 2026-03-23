# Risk Register

| ID | Trigger | Impact | Mitigation | Rollback Point | Status |
| --- | --- | --- | --- | --- | --- |

| R28 | The dashboard shell can render a different first frame on the server and client under production preview hydration | Playwright fails across multiple dashboard pages with production `React error #418`, blocking commit even when feature work is functionally done | Move persisted-auth hydration and time-based shell rendering to SSR-safe patterns, then rerun the full suite on a fresh preview | Revert `src/app/dashboard/layout.tsx`, `src/app/dashboard/layout.test.tsx`, `src/components/layout/Header.tsx`, `src/app/dashboard/purchase/create/components/CreatePurchasePageContent.tsx`, and `src/app/dashboard/sales/create/page.tsx` | Open |
| R29 | E2E mocks and smoke/button assertions can drift away from the current IA and service contracts after the March frontend refactors | Import/settings/store-recommend flows show false failures, masking real regressions and preventing a trustworthy pre-commit gate | Update mocks and assertions together, add service compatibility where contracts legitimately widened, and rerun the entire Playwright suite instead of trusting focused subsets | Revert `e2e/helpers.ts`, `e2e/smoke.spec.ts`, `e2e/button-coverage.spec.ts`, and `src/services/dataImportService.ts` | Open |

## Round 19 Status Update

- `R28`: Reduced. The dashboard shell and header time rendering are now hydration-safe, and the production `React error #418` no longer reproduces in the full suite.
- `R29`: Reduced. E2E mocks/assertions now match the current IA and service contracts, and the fresh full Playwright suite passed `57/57`.

| R26 | Module-home differentiation can turn into misleading KPI cards if the new procurement/export summaries are not derived from reliable existing fields | The pages look more intentional, but operators lose trust in the first-screen numbers | Derive the new cards only from already-loaded contract statuses and box counts, then lock the visible overview sections with page tests | Revert `src/app/dashboard/contracts/components/ContractsPageContent.tsx`, `src/app/dashboard/contracts/page.test.tsx`, `src/app/dashboard/sales/page.tsx`, and `src/app/dashboard/sales/page.test.tsx` | Open |
| R27 | Visual-regression gating can stay flaky if it reuses conflicting local ports or if finance-page mocks are incomplete | The team will treat screenshot tests as noise and stop trusting them as a structure-drift gate | Run Playwright against a dedicated production preview port, backfill the missing finance mocks, and prove finance first before rerunning the whole suite | Revert `playwright.config.ts`, `e2e/helpers.ts`, and `e2e/visual.spec.ts` | Open |

## Round 18 Status Update

- `R26`: Reduced. Procurement/export overviews now derive from existing contract state and box-count data, and page-level regressions lock the new first-screen sections.
- `R27`: Reduced. The visual gate now runs against a dedicated production preview, finance mocks are complete, and all five screenshots passed.

| R25 | AI assistant noise reduction changes both mount conditions and surface shape in one pass | The app can end up with duplicate AI entry points on AI pages or regress the assistant interactions while chasing a calmer UI | Add tests for mount exclusion on `/dashboard/ai/*` and for the quieter trigger plus right-side panel semantics before touching the implementation | Revert `src/components/ai/LazyAIAssistantMount.*` and `src/components/ai/AIAssistant.*` | Open |

## Round 17 Status Update

- `R25`: Reduced. AI workspace duplication is gone, the assistant now opens from a quieter trigger into a right-side panel, and focused tests plus build are green.

| R24 | `Header` decomposition and search-service refactor land in the same batch | Search interaction, mobile nav, and account-menu regressions can be introduced while the structure looks cleaner | Put red tests around `Header` search delegation and staged search first; keep `Header` as shell orchestration only and move query logic to one service file | Revert `src/components/layout/Header*.tsx` and `src/services/dashboardSearch.service.*` | Open |

## Round 16 Status Update

- `R24`: Reduced. `Header` is now split into focused child components, staged search lives in `dashboardSearch.service.ts`, and fresh `Header`/service tests plus `build` are green.

| R21 | State-system cleanup touches several high-traffic pages at once, while each page previously owned its own bespoke loading / empty / error blocks | Without a shared primitive layer, state copy and retry affordances will drift again and future page work will keep reintroducing inconsistency | Add one shared `data-state` UI layer first, then adopt it in only five high-value pages with page-level regression coverage | Revert `src/components/ui/data-state.tsx` and the page-level wiring in `finance`, `reports`, `payments`, `containers`, and `inventory-container` | Open |
| R22 | Long-running parallel worker sessions can disappear and return `not_found` before results are integrated | Task boards can falsely claim work is still `DOING`, causing the next resume pass to branch from a fake checkpoint | Only promote task status from evidence; if worker status is missing, reset the task to `TODO` and re-dispatch rather than carrying over stale execution state | Revert task status changes only and rebuild the queue from verified artifacts | Open |

## Round 14 Status Update

- `R21`: Reduced. Shared `data-state` primitives now back five high-traffic pages, and focused regression tests cover their state wiring.
- `R22`: Active. Parallel worker sessions returned `not_found` again during this round, so the affected tasks were reset from `DOING` to `TODO` in the checkpoint files.

| R23 | The `store-recommend` route still combines template data, AI recommendations, store-specific history, and CSV export in one UX surface | A careless split could break store switching, template export, or tab rendering while making the structure look cleaner on paper | Keep a single `StoreRecommendPageContent` state owner, split only presentational sections, and add a store-switching page test before moving code | Revert `src/app/dashboard/store-recommend/components/*`, `src/app/dashboard/store-recommend/page.tsx`, and the supporting test/setup changes | Open |

## Round 15 Status Update

- `R23`: Reduced. The route now uses a thin wrapper plus one stateful content component and three presentational tab sections, with store-switching regression coverage in place.

| R1 | Backend expects different customs declaration fields | Create/update pages may submit incompatible payloads | Keep payload explicit, typed, and close to common trade/customs fields; isolate in one shared form component | Revert new service + form files only | Open |
| R2 | Reusing dashboard layout at top-level route causes navigation/auth regressions | `/customs-declarations` could render without shell or mis-handle redirects | Implement a dedicated route layout wrapper that composes the existing dashboard layout | Remove new route layout and move route under dashboard if required | Closed |
| R3 | Coverage below target after adding new files | Feature is incomplete by repo standard | Add page and component tests before implementation and measure targeted coverage | Trim untested helpers and add focused tests | Open |
| R4 | Public service pages diverge from current frontend language | New public pages feel detached from the rest of the product | Reuse existing theme tokens, typography, and shadcn/ui surfaces | Rework only `src/components/public/service-page.tsx` and route wrapper content | Closed |
| R5 | Repo-wide coverage obscures new-feature quality | Historical files keep global coverage below the requested threshold | Run targeted coverage against the three new feature files and record the command | Re-run coverage before final handoff | Closed |
| R6 | Backend `/hs-codes` implementation differs from tested contract or is not deployed | Smart match UI may request an endpoint that is unavailable at runtime | Bind to the route contract already asserted in backend tests and keep the service isolated in one file for quick endpoint correction | Revert `src/services/hsCode.service.ts` and the smart-match slice in `ProductDialog.tsx` | Open |
| R7 | Product backend currently ignores `taxRate` persistence | Auto-filled tax rate could disappear after save/reload | Present tax rate in the form immediately and pass it through submit payload while keeping frontend logic isolated from backend schema changes | Remove `taxRate` field from the dialog if backend scope is intentionally deferred | Open |
| R8 | Next 16 build now enforces stronger prerender/type checks than the older task plan assumed | Feature closeout can be blocked by unrelated frontend debt and delay delivery | Clear blocking build debt in the same round, but keep fixes minimal and verification-backed | Revert the build-debt fixes if a later dedicated cleanup supersedes them | Closed |
| R9 | 自动退税草稿依赖后端可用的 `hsCode + totalPrice + refundRate` 组合 | 用户点击“自动生成草稿”后可能只生成部分记录，或出现 skipped 提示 | 在 UI 中明确显示 created/skipped 数量；后端 note 中记录自动生成来源并对缺少税率的数据跳过 | 回退前端自动生成按钮，仅保留手工新建退税单入口 |
| R10 | 自动报关单草稿依赖现有装箱明细金额与商品申报信息质量 | 用户点击“自动生成草稿”后可能只生成部分报关单，或部分申报要素来自 HSCode 回退值 | 在 UI 中显示 created/skipped 数量；服务层对缺申报要素时先回退 live HSCode，再保留草稿 note 说明来源 | 回退前端自动生成按钮，仅保留手工新建报关单入口 |
| R11 | Full-suite Vitest and coverage runs can push high-interaction page tests beyond the default `5s` timeout | CI unit/coverage jobs fail with false negatives although isolated tests pass | Set `testTimeout: 20000` in `vitest.config.ts` and keep production code unchanged; verify with fresh full-suite `test` and `test:coverage` runs | Revert the `vitest.config.ts` timeout change only | Closed |
| R12 | Login/auth tests still assert the pre-security behavior (remembered password, old checkbox copy, direct password field label) while the page now stores username only and wraps the password input inside a visibility-toggle container | Coverage 98 work is blocked by stale red tests before threshold tightening can begin | Update the login tests to match the current security contract and accessible queries, then re-run the focused auth suite before touching coverage gates | Revert only the auth test updates if product/security requirements change again | Open |
| R13 | Several page-level interaction suites still exceed `20000ms` when run inside the full suite, so widening `coverage.include` to `src/app` will amplify timeout pressure immediately | Coverage expansion can look like a coverage problem while the real blocker is suite runtime instability | Isolate timeout-heavy files, reduce redundant waits/mocks, and prove they pass under focused and full-suite runs before expanding the coverage scope | Revert only the affected test refinements if they introduce behavior drift | Open |
| R14 | Older feature slices may still carry one-off visual overrides that partially fight the new shared shadcn baseline | Some pages can remain visually inconsistent even though the global shell and primitives are unified | Keep new styling centralized in `globals.css`, `ui/*`, and layout components first; audit outlier pages incrementally instead of reintroducing page-local style systems | Revert only the page-level overrides while preserving the shared primitive layer | Open |
| R15 | Some deep feature-detail pages still rely on legacy `chart-*` accents and bespoke decorative blocks even after the blue token migration | The app can look mostly shadcn-compliant at the shell level while a few detail screens still reveal the older visual language | Continue auditing pages surfaced by `rg "text-chart-|bg-chart-|bg-gradient|backdrop-blur"` and convert them to semantic helpers or shadcn primitives in slices | Revert only the page-local cleanup for the affected feature if business stakeholders prefer the older visualization density | Open |
| R16 | A few low-priority detail views may still use historical blue-toned `chart-*` classes even though those tokens now sit inside the global blue family | Visual variance becomes mostly density/layout related instead of theme related | Treat remaining work as detail-page polish, not a theme-system rewrite; keep using the shared blue token set as the source of truth | Revert only the specific detail-page polish if it conflicts with product expectations | Open |
| R17 | The persistent local dev server can become stale if the port is later reused or the process dies after a machine restart | User may assume the preview URL is alive when the process is no longer running | Persist PID/log files (`.next-dev.pid`, `.next-dev.log`) and verify with `lsof -nP -iTCP:3002 -sTCP:LISTEN` before relying on the URL | Kill the stored PID and restart the local dev server on the same port if needed | Open |
| R18 | Dashboard 首页需要用现有 analytics 数据推导“当前焦点/风险提醒”，但接口没有直接提供这两个语义字段 | 首屏层级会改善，但提醒质量可能先停留在前端启发式规则 | 第一轮先封装前端推导，不扩后端 API；若验证后仍弱，再单开 richer dashboard contract 任务 | Revert the new workspace derivation in `src/app/dashboard/page.tsx` and `src/components/dashboard/DataDashboard.tsx` |
| R19 | 导航注册表继续承载默认落点与重定向规则后，可能与现有 tab-memory 历史记忆冲突 | 模块首跳或布局初始跳转可能导向非预期子页 | 让 registry helper 兼容现有 `getModuleTabOrRoot` 逻辑，并用 `layout/sidebar` 定向测试锁定关键路径 | Revert only the new default-landing helpers in `src/components/layout/navigation.config.ts` and `src/app/dashboard/layout.tsx` |
| R20 | 财务报表页把加载、导入、图表、详情和上传弹窗同时拆开时，状态依赖可能散落到多个组件 | 账期切换、导入后重载或 detail loading 提示可能回归，拆分后反而更难维护 | 先保持单一 container 持有状态与副作用，只抽纯展示组件，并用页面级回归测试锁住导入/空态/详情流程 | Revert the extracted `src/app/dashboard/finance/statements/components/*` files and fold logic back into the route |

## Round 12 Status Update

- `R18`：本轮已按预案执行，使用现有 analytics 合同在前端推导焦点与风险；结果可用，但后续仍可升级为 richer dashboard contract。
- `R19`：本轮已通过 `navigation.config`、`layout`、`sidebar` 定向测试收敛；后续若模块新增更多深层路径，仍需继续扩前缀覆盖。

## Round 13 Status Update

- `R20`：本轮已收敛。财务报表页现在由轻路由入口 + 单一 `FinancialStatementsPageContent` 容器 + 展示分区组成，且页面级回归测试已覆盖账期切换、批量导入和上传导入链路。
