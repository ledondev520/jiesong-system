# Security Playbook

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
