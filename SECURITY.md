# Security Playbook

PR Review (`.github/workflows/pr-review.yml`) reports checks through Actions `GITHUB_STEP_SUMMARY` with `permissions: {}`; it does not need GitHub comment-write access. Failed/cancelled type or lint/format checks remain failed. The locked formatter uses full Git history and explicit PR SHAs, preserves literal NUL-separated paths and fails on missing history/file reads (`scripts/check-pr-format.cjs`).

## 5-Layer Defense Architecture

### 1) 访问控制与身份层（Identity & Access）
- `frontend/src/lib/auth-session.ts` distinguishes missing tab-local tokens from expired tokens for login messaging only; both require authentication, and tokens remain in sessionStorage.
- Enforce explicit身份校验 (JWT + role checks) for all sensitive routes.
- Treat Agent / Service Account credentials as independent machine identities; never reuse employee passwords or browser sessions for automation.
- Keep authentication middleware as single entry for route groups and validate user context before业务处理.
- `backend/src/middleware/bossReadOnly.js` gates BOSS after database-backed authentication: explicit business GET/HEAD queries only, with own-password and own-notification-read exceptions. Business writes, AI/MCP calls and artifact-generating GETs fail closed; both `authService.updateUser` and `userController.update` invalidate cached roles. `financialStatementsController.js` omits ledger rows and source metadata before querying for BOSS; existing ADMIN/FINANCE evidence limits remain.
- `backend/src/services/purchaseReceiptService.js` stores Confidential arrivals and immutable inspection evidence atomically, enforces per-item ordered limits and request-content idempotency, and admits only accepted increments to stock. `backend/src/routes/purchases.js` limits these writes to authenticated human ADMIN/PURCHASE/WAREHOUSE; FIFO/rollback in `inventorySnapshot.js` retain inspection provenance. Pending/reinspection stock is unavailable; there is no return operation. Legacy records receive no invented evidence; finalized historical imports require active ADMIN plus explicit confirmation in `purchaseImportExportService.js`.
- `backend/src/routes/procurementTemplate.js` must authenticate all procurement-template reads before parsing historical store/purchase data; these records are Confidential.
- Use least-privilege账号 and role-to-resource mapping for every service boundary.
- Disable默认凭证 and rotate all secrets periodically.

### 2) 运行时与执行环境层（Host & Runtime）
- Keep `.env` permissions tight; warn in非生产 and block in生产 for misconfigured permissions.
- Run Node进程 with最小权限 (non-root, locked-down directories) and mount config with read-only policy where possible.
- Keep upload/storage directories explicitly created and scoped to应用用户.
- Contract evidence written by `backend/src/services/fileService.js` must use `0700` directories and `0600` files; permission tightening must succeed before the database record is created.
- Procurement attachment handlers in `backend/src/controllers/purchaseController.js` must reuse that file service for persistence and resolve downloads against `UPLOAD_DIR`, so legacy routes cannot bypass protected storage or lose uploaded files.
- SQLite backup directories must use `0700` and backup database files must use `0600`; `backend/scripts/db-backup.js` is the enforcement point.
- Carrier packing-list originals are Restricted evidence: `packingListCheckService.js` must archive them through `fileService.js`, persist only structured comparison results (never raw extracted PDF text), and prevent deletion while a check record references the file.
- Add startup checks for config file accessibility and permission drift.

### 3) 网络与应用边界层（Application & Network）
- Apply CORS whitelist (`CORS_ORIGIN`) and avoid `*` in生产 environments.
- Enforce request size limits, rate limiting at API网关 (or reverse proxy), and strict MIME/type checks on uploads.
- AI requests in `backend/src/services/aiService.js` and `anthropicCompatService.js` use the same full-response deadline, disable SDK automatic retry/logging, and obtain usage from the response stream; `KIMI_REQUEST_TIMEOUT_MS` defaults to 30000ms (explicit 500–30000ms), while greetings retain a separate 300ms budget via `KIMI_GREETING_TIMEOUT_MS`.
- `backend/src/services/hsciqService.js` bounds connection and response-body waits with `HSCIQ_TIMEOUT_MS` (default 10000ms, clamped to 1000–30000ms), shares identical pending queries and reserves their quota; upstream response bodies are never embedded in errors or logs.
- Keep internal errors server-side; expose only最小化错误码 to clients.
- Require HTTPS in external endpoints and internal服务间连接。

### 4) 数据与隐私层（Data Protection）
- Classify data by tier per `data-classification.json` and apply处理规则 in code and documents.
- Treat supplier bank routing fields, company bank statements and transaction identifiers, signed/generated contract artifacts, carrier packing lists, and their review records as Restricted data; persist only masked company account identifiers with structured bank rows, and do not include production values in logs, engineering memory, or test fixtures.
- Store secrets in `.env` only, never in repository tracked text.
- Treat system-configured API keys as write-only: encrypt at rest, never return the complete value from any HTTP response, and render only a configured/masked status in administrator pages.
- Environment-key fallback in `backend/src/controllers/system/configController.js` must use the same response masking as database keys; absent database configuration never permits returning the complete environment key.
- Main AI provider selection lives in `backend/src/config/index.js`: DeepSeek uses its own environment key or encrypted `deepseekApiKey` override in `aiService.js`; `configController.js` masks only the active provider's key for the UI. Never reuse a Kimi credential for DeepSeek, and validate file permissions before reading `.env`.
- `openAgentService.loadSdk` sets the public Agent retry limit to zero and `aiController.anthropicCompatMessage` sends `x-should-retry: false`; this prevents nested SDK retries from repeating provider requests after a bounded failure. Existing per-request deadlines remain in force.
- Redact PII/敏感字段 in logs and exports; avoid writing raw identifiers to audit channels unless authorized.
- HTTP request logs must record only route, timing, and request shape (field names/count/content length); never persist request body/query values, AI prompts, tool schemas, or user messages.
- Monthly statements, account balances, and general-ledger rows are Confidential: parse uploaded workbooks in memory, persist only structured rows and source metadata/hash, and never copy raw workbooks into ordinary attachment storage or logs.
- Payroll, social-security, tax-return, voucher, and journal evidence rows are Confidential: parse source workbooks in memory, redact personal identifiers before persistence, never archive the source workbook, and restrict row-level reads to ADMIN/FINANCE.
- Use prepared statements/ORM boundaries and strict参数校验 before persistence.

### 5) 监控与响应层（Detection & Response）
- Maintain security-related日志 for permission checks, auth failures, privilege changes, and config load incidents.
- Define owner for every security alert and keep rollback checkpoints in `PLAN.md` / `TASKS.md` where相关.
- Perform periodic review for依赖更新、权限变更、以及配置基线漂移.
- For incident response: isolate影响面 -> rollback可行方案 ->修复 -> 验证 -> 事后复盘.

## Operational controls
- Security-related changes should be documented in this file and reflected in `AGENTS.md` and `data-classification.json`.
- `.brv/context-tree/` is for Internal engineering memory only. Do not store Restricted secrets, Confidential business figures, customer/contact details, signed contract data, or raw operational ledgers in ByteRover memory.
- ByteRover runtime/provider state is local-only under `state/byterover-home/` and must stay ignored from source control.
- Agent credentials must be stored hashed-at-rest, shown only once at issuance, and revocable without affecting human users.
- Temporary test credentials (for example default admin passwords) must be explicitly labeled as non-production and replaced via environment variables before deployment.
- Any runtime permission tightening should include a clear validation path and migration plan for existing environments.
- Security failures on启动应优先阻断（尤其生产）而不是继续运行.

- 商品档案导航归入采购模块（`frontend/src/components/layout/navigation.config.ts`），修复采购员已有建档权限但前台不可达的问题；API读写角色限制仍由 `backend/src/routes/products.js` 执行。

- Shipment tax-refund preparations: `backend/src/routes/taxRefunds.js` limits invoice-row preparation, confirmation and exports to ADMIN/FINANCE; `backend/src/controllers/fileController.js` enforces the same roles for generated confirmation attachments so the generic download/delete endpoints cannot bypass this boundary. `taxRefundShipmentService.js` rechecks the material version before confirmation, reuses protected `fileService.js` archiving, and does not set official submission state.

- Workflow automation in `backend/src/services/openAgentService.js` directly executes only the four internal draft tools (purchase, customs, forex verification, tax refund) on request. Tool-role checks and operation logs remain mandatory; executed actions stay in replay metadata but never appear again as pending confirmation cards. Physical/financial/configuration writes retain confirmation. Export status execution reuses `salesService.updateSalesStatus` so state checks and inventory effects remain shared with the normal API.

- `backend/src/services/customsDeclarationDraftService.js` replaces only DRAFT records atomically while retaining identity; released declarations fail with 409 instead of being deleted. Shipment allocation in `inventorySnapshot.js` uses owned packing rows and their purchase/unit provenance. `taxRefundShipmentService.js` excludes technical creation/update timestamps from confirmation versions while retaining business facts and evidence.

- `backend/src/services/openAgentService.js` inspects SDK query termination for both normal and streamed requests. Upstream errors propagate as 503/SSE error before success persistence; the SDK prompt convenience method drops the failure subtype and must not be used here.

- `frontend/src/lib/api-base-url.ts` and `frontend/next.config.ts` share base-address parsing so login/AI requests and protected file downloads reach the same API. Bare backend origins gain `/api/v1`; explicit API paths remain intact. Existing environment values and credentials are unchanged.

- `inventoryStateMachine.js` denies manual transitions for purchase/inspection-sourced inventory; `inventoryController.js` and `openAgentService.js` load provenance before checking, and Agent confirmation revalidates before writing. Conditional updates check the current status. Same-status requests preserve FIFO timestamps; business workflows retain their transactional inventory writes.

### VPS 发布验证
- `.github/workflows/deploy.yml` 在 SSH 内启用失败即停止，并固定触发提交 SHA，防止失败被后续命令掩盖或发布版本漂移。
- `scripts/verify-vps-runtime.cjs` 只输出校验结论，拒绝 PM2 仍指向旧目录、公网 BUILD_ID 不匹配、后端健康失败或未认证 API 返回非 401；不得记录完整 PM2 环境、响应正文或凭据。
- VPS 运行目录迁移保留现有数据库与附件的绝对路径；`/opt/jiesong_system/deploy-backups/` 中的环境配置和 SQLite 快照属于 Restricted，目录 0700、文件 0600。

## 邮箱注册边界
- RBAC 源码扫描明确列举公开的 `POST /auth/email-code` 与 `POST /auth/email-register`，并检查限流及校验；管理员创建账号的 `POST /auth/register` 继续要求认证和ADMIN。此豁免只反映现有公开注册设计，不授予业务访问权。
- `backend/src/services/emailService.js` 复用阿里云杭州 DirectMail；仅私有环境配置 `ALIBABA_CLOUD_ACCESS_KEY_ID`、`ALIBABA_CLOUD_ACCESS_KEY_SECRET`、`JIESONG_EMAIL_FROM`，可选 STS token。密钥不返回浏览器，部分配置在启动时拒绝，`backend/src/config/index.js` 在读取环境密钥前先验证文件权限。
- `backend/src/services/emailRegistrationService.js` 持久保存带密钥验证码哈希，10分钟有效、最多5次验证；60秒重发冷却、每邮箱每小时5次、全站每小时60次，失败发信仍计数且旧码失效。成功注册与消费验证码在同一事务，角色固定SALES且未激活，管理员审核后方可访问业务。
- 注册邮箱作为用户名，登录兼容原用户名；管理员创建用户仍需ADMIN。邮件正文、验证码与云服务响应正文不得进入日志。验证码记录超过24小时后在下一次发码时清理。
- `frontend/src/app/dashboard/users/components/UserDialog.tsx` 提供管理员账号开通开关；两套用户更新入口更新状态或角色后立即清除认证缓存，避免停用/改权延迟。

Agent Runtime 仅加载锁定版本的已发布 SDK 构建，加载错误直接保留，不尝试开发机 `.tmp` 文件；两种请求入口显式使用本地 Anthropic 协议，保留关闭重试与上游失败不归档的回归检查。

## Nestlet incremental release boundary
- `scripts/nestlet-upgrade-schema4.sh` is a dedicated maintenance-only schema3-to-schema4 procedure. It is disabled until an exact reviewed release is pinned. Only the Nestlet Compose service and its existing volume may change.
- Before live migration, require isolated fresh-image smoke, a SQLite API recovery point with integrity verification, and a migration rehearsal on a separate restored copy. Recovery evidence is Restricted, private-mode, local-only and never logged or uploaded.
- A schema4 database must never be passed to the schema3 predecessor. Failure can restart the old image only after stopped live storage is verified still schema3; otherwise retain all live data and require forward repair or an explicitly approved separate recovery. No automatic DB restore, downgrade, volume removal or unrelated service restart.

## Nestlet same-schema4 update boundary
- `scripts/nestlet-update-schema4.sh` requires byte-identical persisted-data/auth/asset contracts and a separate candidate-to-prior-runtime recovery-copy rehearsal. Schema4 equality alone does not authorize rollback. Private database/original-file backups use the existing verified CLI and bounded native lock wait; no live restore, downgrade or asset deletion is performed.
- Only the release image-tag line and current pointer may change. The existing environment helper preserves all other bytes; no credentials, data contents or hashes are returned/logged. Actual YAML parsing and dispatch-trigger validation are required before publication.

## Nestlet schema5 email upgrade boundary
- `scripts/nestlet-upgrade-schema5.sh` is a separate disabled-until-pinned schema4-to-schema5 release, restricted to the dedicated maintenance branch and Nestlet service. Never substitute the old same-schema4 helper or merge its maintenance workflow into Jiesong main.
- Require private SQLite API + referenced-original backups, independent verification, additive migration and future-version refusal on separate copies. Preserve every existing schema object/row and original; only `NESTLET_IMAGE_TAG` and the verified release pointer may change. Ambient shell mail/provider values cannot override the private environment file.
- Once any candidate start is attempted, never automatically resume the schema4 image, restore live data or downgrade. Before candidate start, only the exact prior image on independently verified intact schema4 may resume. Schema5 snapshot recovery can revive old passwords or pending email actions and needs a separately approved manual security/data-loss review.
- New live public email/enrollment configuration flags must be true without exposing credentials; real inbox delivery and authenticated email flows require separate acceptance. All recovery evidence stays Restricted and local-only with 0700/0600 modes.
- `scripts/nestlet-verify-archive.py` permits only the pinned 4d predecessor after complete 315-file public archive and 31 literal runtime-copy verification, checked inherited maintenance lease, image/hardening/schema checks and generic-only pass/fail output. Unknown archive entries are retained and rejected before byte reads; generated frontend/dependency bytes are not claimed source-equivalent. The candidate remains Git-pinned. The upgrade route has no detailed inspection output.

## Nestlet provider-only mail proof
- `scripts/nestlet-mail-proof.py` runs one fixed, plain, no-action test inside the existing pinned schema4 container using its existing DirectMail environment. It never reads runtime.env, exports credentials, invokes account APIs, writes user data, or changes deployment/configuration. The official DirectMail endpoint is fixed and no automatic send retry exists.
- A root-owned 0600 exclusive attempt marker under the existing private shared directory is fsynced before the provider call and never reset. Repeated/uncertain attempts require inbox reconciliation, not rerunning or deleting the marker. Workflow output is allowlisted to provider-accepted/provider-unconfirmed; inbox receipt and signup/reset acceptance remain separate checks.
