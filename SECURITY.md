# Security Playbook

PR Review (`.github/workflows/pr-review.yml`) reports checks through Actions `GITHUB_STEP_SUMMARY` with `permissions: {}`; it does not need GitHub comment-write access. Failed/cancelled type or lint/format checks remain failed. The locked formatter uses full Git history and explicit PR SHAs, preserves literal NUL-separated paths and fails on missing history/file reads (`scripts/check-pr-format.cjs`).

## 5-Layer Defense Architecture

复核时效由 `scripts/check-review-freshness.cjs` 检查：仅信任 PR 作者或仓库 owner 创建的最新标记评论；PR 文件集合取 B0/H、B1/H 两对所有最佳共同祖先（`merge-base --all`）到 H 的 diff 文件并集，避免交叉合并漏掉文件；head 改变、base 后续文件交集、无效标记或历史/API 信息不足（含任一对没有共同祖先、Git 命令失败）均拒绝，以避免过期复核被沿用。`.github/workflows/review-freshness.yml` 仅使用 contents、pull-requests、issues 的 read 权限；合并前必须本地运行同一 CLI，因为 main 前进不会自动撤回已绿的检查。GitHub 强制拦截还需管理员将 `review-freshness` 设为必过检查。

### 1) 访问控制与身份层（Identity & Access）
- `frontend/src/lib/auth-session.ts` distinguishes absent credentials from expired sessions. Unchecked-login JWTs remain tab-scoped; optional persistent browser sessions use HttpOnly credentials and live server validation.
- Enforce explicit身份校验 (JWT + role checks) for all sensitive routes.
- Treat Agent / Service Account credentials as independent machine identities; never reuse employee passwords or browser sessions for automation.
- Keep authentication middleware as single entry for route groups and validate user context before业务处理.
- `backend/src/middleware/bossReadOnly.js` gates BOSS after database-backed authentication: explicit business GET/HEAD queries only, with own-password and own-notification-read exceptions. Business writes, AI/MCP calls and artifact-generating GETs fail closed; both `authService.updateUser` and `userController.update` invalidate cached roles. `financialStatementsController.js` omits ledger rows and source metadata before querying for BOSS; existing ADMIN/FINANCE evidence limits remain.
- `backend/src/services/purchaseReceiptService.js` stores Confidential arrivals and immutable inspection evidence atomically, enforces per-item ordered limits and request-content idempotency, and admits only accepted increments to stock. `backend/src/routes/purchases.js` limits these writes to authenticated human ADMIN/PURCHASE/WAREHOUSE; FIFO/rollback in `inventorySnapshot.js` retain inspection provenance. Pending/reinspection stock is unavailable; there is no return operation. Legacy records receive no invented evidence; finalized historical imports require active ADMIN plus explicit confirmation in `purchaseImportExportService.js`.
- `backend/src/routes/procurementTemplate.js` must authenticate all procurement-template reads before parsing historical store/purchase data; these records are Confidential.
- `backend/scripts/retain-financial-snapshots.js` requires --confirm with explicit --backup-dir and --receipt. Shared financial-sqlite-safety.js rejects missing/nonprivate SQLite targets before connection, matches the configured real path against PRAGMA database_list, performs a mandatory online backup including committed WAL with integrity_check, then rechecks identity before writing. Receipts are exclusively reserved (O_EXCL, 0600) and contain document IDs/sourceKeys, skipped count, backup path, target fingerprint and completion time. A post-commit receipt failure is reported separately; verify before retrying. `financialEvidenceService.js` parses statement/balance/ledger snapshots in memory with existing personal-field redaction, verifies header periods and ledger dates, and appends the whole batch atomically. Content-addressed sources skip unchanged files and retain revisions separately; cumulative ledgers have no single-month link. Existing evidence, monthly/business tables and raw-file storage are untouched. Reads retain the existing ADMIN/FINANCE evidence routes, preventing cumulative evidence from being treated as a monthly operating result.
- Cross-machine transfer is a local operator CLI (`backend/scripts/financial-evidence-transfer.js`), not an HTTP route. Export selects explicit evidence IDs and omits local relationship IDs, raw workbooks and credentials. Packages/plans/receipts require private directories/files, no symlink or hardlink inputs, exclusive outputs, and bounded JSON. Import binds a freshly reviewed plan to the actual target file/host and source content, performs a verified SQLite online backup (including committed WAL), then `financialEvidenceTransferService.js` rechecks the plan inside one transaction and only creates or skips exact records. Full structured-content conflicts fail closed; inserted records are read back before commit. Existing business/evidence rows and permissions are never rewritten. Integrity hashes are not signatures: use a trusted SSH channel and independently retain the protected manifest; no networking/deployment is built into the CLI.
- Preview uses `financial-evidence-readonly.py` with SQLite URI `mode=ro`, `query_only=ON` and a read-only authorizer; a single read transaction selects only candidate evidence and linked periods. `financial-evidence-readonly.js` feeds that snapshot into the shared plan logic without constructing a writable Prisma connection. Rollback-journal reads add no directory entries. WAL reads require existing private regular -wal/-shm files and fail closed before connection when either is absent. immutable=1 is prohibited because it ignores committed WAL and locking. Live reads retain SQLite locking/shared-memory coordination; business rows/SQL are read-only, but filesystem bytes are not promised unchanged. Trusted operators must not concurrently remove sidecars; that race can cause SQLite to recreate them. Remote operators may execute the reader through verified SSH and retain its output only in a private pipe/file; a synthetic injected DDL test proves SQLite rejects writes.
- `financialEvidenceTransferService.js` rejects duplicate source keys and duplicate category/content hashes inside a package before querying the target, preventing two CREATE actions from bypassing the target conflict check. Cumulative periods use the same first-three-physical-header-row semantics as snapshot retention, with source-range offsets and empty rows preserved.
- Use least-privilege账号 and role-to-resource mapping for every service boundary.
- Disable默认凭证 and rotate all secrets periodically.

### 2) 运行时与执行环境层（Host & Runtime）
- Node.js >=22.23.4 is the runtime baseline (CVE-2026-111497); production PM2 uses `/opt/jiesong_system/runtime/node-v22.23.4-linux-x64`. `.github/workflows/deploy.yml` and `deploy.sh` source `scripts/require-node-runtime.sh` before npm/npx/build/verification to prevent use of an older system Node: prepend `NODE_RUNTIME/bin` (defaulting to that runtime), require an executable node, matching command resolution and version >=22.23.4, and fail without fallback. The workflow passes configuration via environment variables and base64-encoded SSH arguments to a quoted remote script, preventing shell interpretation of configured values; runtime provisioning remains an operator prerequisite. The SSH step reads the guard from the runner target-commit checkout (DEPLOY_SHA), passes its bytes as a base64-only argument, decodes and sources them before pricing backup or any Git command. It works even if the server old checkout lacks the guard; missing runner guard or invalid runtime still stops deployment. Manual deploy.sh sources the guard relative to itself.
- Keep `.env` permissions tight; warn in非生产 and block in生产 for misconfigured permissions.
- Run Node进程 with最小权限 (non-root, locked-down directories) and mount config with read-only policy where possible.
- Keep upload/storage directories explicitly created and scoped to应用用户.
- Contract evidence written by `backend/src/services/fileService.js` must use `0700` directories and `0600` files; permission tightening must succeed before the database record is created.
- Procurement attachment handlers in `backend/src/controllers/purchaseController.js` must reuse that file service for persistence and resolve downloads against `UPLOAD_DIR`, so legacy routes cannot bypass protected storage or lose uploaded files.
- The disposable write-performance audit (`scripts/audit_api_write_success_times.js`) deletes leftover test uploads only inside an explicit `API_PERF_UPLOAD_DIR`. `backend/scripts/perf-upload-cleanup.js` refuses, before any request, a directory whose real path equals or overlaps the default `backend/uploads`, the `backend/.env` UPLOAD_DIR, or a launch-environment UPLOAD_DIR (unresolvable/dangling symlinks fail closed); cleanup re-verifies the root's dev/ino, requires resolved relative and absolute paths to stay inside the root, and removes regular files only. `.env` is read only for this refusal comparison, never as the cleanup root. Check-then-unlink cannot be made atomic in Node, so the directories along the deletion path must be controlled by trusted local operators.
- SQLite backup directories must use `0700` and backup database files must use `0600`; `backend/scripts/db-backup.js` is the enforcement point.
- Carrier packing-list originals are Restricted evidence: `packingListCheckService.js` must archive them through `fileService.js`, persist only structured comparison results (never raw extracted PDF text), and prevent deletion while a check record references the file.
- Add startup checks for config file accessibility and permission drift.

### 3) 网络与应用边界层（Application & Network）
- `.github/workflows/deploy.yml` explicitly exits non-zero when `sudo nginx -t` fails, before Nginx reload or runtime verification; `set -e` alone does not stop on the left side of an `&&` list.
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
- Production AI provider changes must update both the protected backend `.env` and PM2 runtime environment after a 0700/0600 private configuration backup; validate with synthetic input and never print full PM2 environments or credentials. `backend/src/config/index.js` and `aiService.js` remain the provider/key enforcement points.
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
- `fileService.assertFileAccess` applies that existing ADMIN/FINANCE confirmation boundary to generic and legacy purchase/sales attachment downloads and deletions. Ordinary attachment roles remain unchanged. Failed `createFile` validation, permission tightening or metadata writes remove only the new multer payload; existing and generated versions are untouched. A cleanup failure preserves the original error and logs no file paths or bytes. Legacy purchase deletion retains its existing physical-archive behavior. Multipart MIME and Multer input limits return client errors; the isolated HTTP/SQLite attachment matrix uses only generated disposable fixtures with the real global limiter enabled.
- `utils/upload.js` creates or tightens the date destination directory to `0700` before Multer starts a disk stream, and propagates filesystem failures through the destination callback. The upload-root sharing policy is unchanged. Uploaded file `0600` enforcement happens in `fileService.createFile` before its first asynchronous contract lookup; it is not claimed as a whole-stream file-mode guarantee.
- `fileService.createFile` validates normalized and real path containment under the trusted upload root before chmod or failed-upload deletion. Untrusted suffix traversal, child file/directory symlinks, non-files and multiple hard links fail closed; intentional configured-root symlinks and relative roots remain supported. Cleanup rechecks the captured payload path/dev/inode after asynchronous work and preserves the original business error if the payload was replaced or cannot be safely removed. No alert suppression or upload-directory sweep is used; these checks do not claim protection from arbitrary privileged OS races.
- Before Multer's date-directory chmod or successful destination callback, `utils/upload.js` resolves the trusted root, rejects child-directory aliases/symlinks and requires the real destination to equal the root-derived date directory. Existing configured-root symlinks, relative roots and Multer/database path formats remain compatible; rejected destinations leave external or retained directory/file sentinels untouched. Storage, MIME and upload-size policy are unchanged.

- Workflow automation in `backend/src/services/openAgentService.js` directly executes only the four internal draft tools (purchase, customs, forex verification, tax refund) on request. Tool-role checks and operation logs remain mandatory; executed actions stay in replay metadata but never appear again as pending confirmation cards. Physical/financial/configuration writes retain confirmation. Export status execution reuses `salesService.updateSalesStatus` so state checks and inventory effects remain shared with the normal API.

- `backend/src/services/customsDeclarationDraftService.js` replaces only DRAFT records atomically while retaining identity; released declarations fail with 409 instead of being deleted. Shipment allocation in `inventorySnapshot.js` uses owned packing rows and their purchase/unit provenance. `taxRefundShipmentService.js` excludes technical creation/update timestamps from confirmation versions while retaining business facts and evidence.

- `backend/src/services/openAgentService.js` inspects SDK query termination for both normal and streamed requests. Upstream errors propagate as 503/SSE error before success persistence; the SDK prompt convenience method drops the failure subtype and must not be used here.

- `frontend/src/lib/api-base-url.ts` and `frontend/next.config.ts` share base-address parsing so login/AI requests and protected file downloads reach the same API. Bare backend origins gain `/api/v1`; explicit API paths remain intact. Existing environment values and credentials are unchanged.

- `inventoryStateMachine.js` denies manual transitions for purchase/inspection-sourced inventory; `inventoryController.js` and `openAgentService.js` load provenance before checking, and Agent confirmation revalidates before writing. Conditional updates check the current status. Same-status requests preserve FIFO timestamps; business workflows retain their transactional inventory writes.

### VPS 发布验证
- `.github/workflows/deploy.yml` 在 SSH 内启用失败即停止，并固定触发提交 SHA，防止失败被后续命令掩盖或发布版本漂移。
- `.github/workflows/deploy.yml` 将整个 SSH 远端脚本放入重定向自 `/dev/null` 的复合命令，防止 npm/Prisma/PM2/sudo 等子命令吞掉 `bash -s` 的剩余程序并跳过验证。`scripts/deploy-ssh.test.cjs` 在 pre-deploy 中执行实际 SSH run 块，覆盖读取 stdin、验证失败和运行时缺失；保留 base64 参数传递与运行时守卫。
- `scripts/verify-vps-runtime.cjs` 只输出校验结论，拒绝 PM2 仍指向旧目录、公网 BUILD_ID 不匹配、后端健康失败或未认证 API 返回非 401；不得记录完整 PM2 环境、响应正文或凭据。
- VPS 运行目录迁移保留现有数据库与附件的绝对路径；`/opt/jiesong_system/deploy-backups/` 中的环境配置和 SQLite 快照属于 Restricted，目录 0700、文件 0600。

## 邮箱注册边界
- RBAC 源码扫描明确列举公开的 `POST /auth/email-code` 与 `POST /auth/email-register`，并检查限流及校验；管理员创建账号的 `POST /auth/register` 继续要求认证和ADMIN。此豁免只反映现有公开注册设计，不授予业务访问权。
- `backend/src/services/emailService.js` 复用阿里云杭州 DirectMail；仅私有环境配置 `ALIBABA_CLOUD_ACCESS_KEY_ID`、`ALIBABA_CLOUD_ACCESS_KEY_SECRET`、`JIESONG_EMAIL_FROM`，可选 STS token。密钥不返回浏览器，部分配置在启动时拒绝，`backend/src/config/index.js` 在读取环境密钥前先验证文件权限。
- `backend/src/services/emailRegistrationService.js` 持久保存带密钥验证码哈希，10分钟有效、最多5次验证；60秒重发冷却、每邮箱每小时5次、全站每小时60次，失败发信仍计数且旧码失效。成功注册与消费验证码在同一事务，角色固定SALES且未激活，管理员审核后方可访问业务。
- 注册邮箱作为用户名，登录兼容原用户名；管理员创建用户仍需ADMIN。邮件正文、验证码与云服务响应正文不得进入日志。验证码记录超过24小时后在下一次发码时清理。
- `frontend/src/app/dashboard/users/components/UserDialog.tsx` 提供管理员账号开通开关；两套用户更新入口更新状态或角色后立即清除认证缓存，避免停用/改权延迟。

Agent Runtime 仅加载锁定版本的已发布 SDK 构建，加载错误直接保留，不尝试开发机 `.tmp` 文件；两种请求入口显式使用本地 Anthropic 协议，保留关闭重试与上游失败不归档的回归检查。

## 邮箱密码找回
- 公开 `POST /auth/reset-password-code` 只接收绑定邮箱，`POST /auth/reset-password` 只接收邮箱、6位验证码及新密码；旧用户名+手机号重置协议已关闭。无邮箱、重复邮箱、未开通/停用账号不得自助重置，管理员必须通过已认证的管理入口在离线核实身份后人工处理，不能仅据用户名/手机号确认归属。
- `passwordResetService.js` 使用用途隔离HMAC存储代码，持久IP摘要/邮箱/全站限流，并先获取SQLite单例写锁以避免多进程配额竞态。代码10分钟有效、最多5次验证；60秒重发、每邮箱5次/小时、IP10次/小时、全站60次/小时。旧码即时废弃，错误尝试提交计数，消费与改密/撤销会话/最小审计同事务；账号归属、状态及版本在消费时再次确认。
- 未知/停用/重复邮箱预留相同配额、返回同样200提示；响应不等待邮件提供方，以避免投递耗时枚举账号。DirectMail只发一次，确认后才激活。后台投递不跨进程重启恢复，任何失败/不确定/进程退出只会使代码不可用，用户需重新申请，无自动重试或绕过。未配置邮件时全局503拒绝。
- `auth.js` 按数据库实时状态和 `sessionVersion` 验证每个用户JWT；密码写入均递增版本，包括管理员重设。迁移前无版本JWT只在版本0可用；新注册/旧账号初始版本0。每次认证新增实时DB读取，需在后续发布评估数据库容量；不改变独立Agent credential授权。
- 新密码策略为至少8个Unicode字符且UTF-8不超过72字节；保留旧密码登录兼容。原始Prisma查询/错误输出禁用，安全找回错误仅输出固定文案，RESET_PASSWORD审计只包含账号ID与动作，密码、验证码、收件人、云响应不入日志。
- 增量迁移、管理员处理策略、隔离测试与待发布检查详见 `docs/security/password-recovery.md`。本变更不执行生产验证攻击、不改真实用户密码；发布必须在备份和人工确认后进行。
- 找回HTTP入口使用锁定版本 `express-rate-limit`；其IP键与持久请求摘要共同归一IPv4映射及IPv6 /56地址。每请求代理身份依Express明确白名单决定，`TRUSTED_PROXY_CIDRS` 默认不信任，禁止布尔/跳数/全网范围；上线前须确认实际代理链与Nginx追加的真实客户端地址，不能信任外部任意转发头。
- 生产备份以实际绝对 `DATABASE_URL` 为准，使用已审查的SQLite online backup API创建包含已提交WAL的一致快照（无需停writer；若使用离线文件复制则必须先停全部writer）、验证完整性及校验和并保护0700/0600；不能把构建目录的固定dev.db复制或未验证的在线cp当作生产备份。自动部署没有备份步骤，备份前置验收失败不得合并触发迁移。

## Fixed-expiry browser sessions

See `docs/security/browser-sessions.md`. `backend/src/services/browserSessionService.js` uses explicit opt-in, 256-bit random opaque cookies, hashed server storage and the existing JWT absolute expiry, with no refresh or global logout. Production uses Secure/HttpOnly/SameSite=Strict `__Host-` cookies. Origin plus session-bound CSRF protects cookie mutations and logout; sibling-origin reads also fail closed. Bearer precedence preserves legacy/Agent access without invalid-token cookie fallback. All auth responses are no-store; persistence failures are sanitized. Revocation responses never delete a newer cookie accidentally. Frontend caches and delayed failures are isolated by auth generation.

The additive session-table rollout requires a fresh verified online SQLite snapshot of the actual configured database before migration, via the reviewed release preflight, with integrity checking and 0700/0600 permissions. Development's hard-coded backup path/copy is not production backup evidence; no database restoration may overwrite subsequent business writes without an explicit reconciliation plan.

- Global API admission uses the locked `express-rate-limit` implementation in `backend/src/middleware/apiRateLimit.js`, still 100 requests/minute before request parsing and routing. Legacy JSON/Retry-After and millisecond X-RateLimit reset headers remain compatible; canonical IP keys collapse mapped IPv4 and IPv6 /56 without trusting forwarded headers beyond the existing explicit proxy allowlist. The tighter login 10/15min and recovery quotas remain independent. Standalone synthetic auth servers use the same recognized limiter; no security rule is disabled or suppressed.

- Global and legacy login HTTP counters remain process-local, as before: restarts reset them and multiple workers have independent counters. This change does not claim a distributed/persistent quota. Existing SQLite email/recovery quotas remain independent.

## 运维验证笔记

本地被 Git 忽略的 `PLAN.md` 等运维记录也不得保存真实账号与密码组合；仅记录验证结果。发现残留时先对当前笔记脱敏，单独评估凭据轮换；脱敏笔记不等于撤销已有凭据，也不能据此声称 Git 历史已清理。

Export proposal paths are configured by `JIESONG_EXPORT_DATABASE` and `JIESONG_HISTORY_ROOT` or explicit CLI options in `scripts/prepare_export_packet.py`. The script remains read-only and does not load `.env`. Business databases and history workbooks must remain outside Git.

Catalog migration endpoints in `backend/src/routes/dataImport.js` require authenticated ADMIN. `catalogImportService.js` previews do not persist rows, files or audits. Execution revalidates in one transaction and audits only kind/count/operator. Opening inventory requires explicit counted-balance confirmation, an active product, matching unit and a unique stable opening reference; it never fabricates purchase/inspection evidence. Supplier bank details are excluded from templates. See `docs/migration/catalog-import.md`.

`backend/src/services/bootstrapAdmin.js` is shared by seed and direct app startup. New administrators require an explicit `DEFAULT_ADMIN_PASSWORD` meeting the existing 8-character/72-byte policy. Startup blocks an uninitialized or legacy-default administrator. An explicit bootstrap password can remediate the known legacy default with a conditional update and session-version increment. Seed never rotates an existing secure password. Use authenticated password change/reset for ordinary rotation, then remove the bootstrap secret from the runtime environment. No new schema or forced-change session exception is introduced.

SQLite backups now use `backend/scripts/sqlite_snapshot.py` through the backup/restore CLIs. Source selection must be explicit via process DATABASE_URL or --database; no .env or credential files are loaded. The online backup API includes committed WAL pages. Snapshots/manifests are 0600 in 0700 directories, and restore verifies SHA-256 and SQLite integrity before exclusively publishing a new target. It never replaces an existing/live database. Managed retention defaults to five pairs; unrelated files are not swept. This covers the database only, not attachments/configuration or offsite disaster recovery. See `docs/operations/sqlite-backup-restore.md`.

The default local export history directory `/data/export-history/` is excluded by the repository `.gitignore` so portable defaults do not invite accidental source-workbook commits.

Backup CLI `backend/scripts/db-backup.js` preserves explicit space or equals options before environment/default selection.

`bootstrapAdmin.js` validates bootstrap password policy only when creating/remediating an account; unused stale settings cannot block an already-secure administrator.

`sqlite_snapshot.py` restore rejects existing target SQLite `-wal`, `-shm` and `-journal` sidecars (including dangling symlinks); never delete recovery evidence to make a path available. Use a private directory without concurrent writers.

`tabularImport.js` streams ZIP entries before ExcelJS parsing: at most 256 entries and 32 MiB actual expanded bytes. JSZip is declared directly at the already locked version; no files are extracted.

Legacy `/api/v1/import` and `/api/v1/system/import` share `tabularUpload` from `tabularImport.js` (the same 10 MiB in-memory CSV/xlsx filter as preview; `/system/import` previously used disk storage and left rejected uploads under `UPLOAD_DIR`); `importService.js` accepts only in-memory bytes and rejects filesystem paths, including traversal, absolute paths and symlinks. The client filename is only an import-record label (control/NUL characters stripped, last `/` or `\` segment, at most 255 characters) and never a filesystem path. HTTP never retains raw uploads.

`db-backup.js` preserves literal percent sequences in Prisma SQLite DATABASE_URL paths; URI decoding could silently select a different database.

`tabularImport.js` checks worksheet XML row/cell/column bounds before ExcelJS allocations, rejects merged cells and limits sheet IDs to 65535. This prevents tiny XLSX metadata from expanding unbounded model regions.

## Export pricing configuration

Pricing requires a finite positive spot rate and a positive adjusted rate rounded
to six decimal places. Positive adjustments cannot make missing or invalid spot
rates usable. Python rejects invalid spot rates before reading proposal sources.

`config/pricing.json` contains non-secret policy values. Both export services and
`scripts/prepare_export_packet.py` use this same file, or the explicit
`JIESONG_PRICING_CONFIG` path. The shared `config/pricing.schema.json` defines
strict keys and numeric bounds. Invalid or missing files stop pricing without
fallback. Readiness recommendations use the same adjusted exchange rate, tiered
markups and rounding as packet. Request-level profitRate does not override the
shared file. Multiplier mode requires explicit selection. No environment file or
business database is read by the loaders.

`GET/PUT /system/pricing-config` require authenticated ADMIN. Updates replace the
whole validated document atomically, require the last revision, and use an
exclusive lock file. Structured stderr events retain only operator ID, field
names and policy hashes. No request values, contract data or secrets are logged.
Manual file edits are detected and logged on the next read. Operators must use
an atomic replacement and retain their filesystem change audit for edits made
while all readers are stopped. A stale lock after a process crash requires an
operator to confirm no writer is active before removing it.


- 采购 Excel 导入 `/api/v1/purchases/import` 在原认证/角色鉴权后使用 `backend/src/utils/purchaseExcelUpload.js` 的 memoryStorage，仅允许 .xlsx/.xls，沿用 config.upload.maxSize；`purchaseImportExportController.js` 只传文件名标签/Buffer，`purchaseImportExportService.js` 在解析/数据库访问前拒绝路径，仅解析内存字节，不留存 Confidential 原始工作簿于普通附件存储。
- `backend/src/middleware/errorHandler.js` 将无 statusCode 的 Busboy 请求解析错误按精确消息白名单（七条消息及 `Unsupported content type: ` 前缀）返回中文400，含 NUL 的畸形 multipart 因此不再返回500。显式状态、Multer处理及原始错误日志保持，畸形上传解析错误即使开发环境也不返回英文堆栈，未知内部错误仍500；回归见 `backend/src/routes/purchases.import-upload.test.js` 和 `backend/src/middleware/errorHandler.test.js`。

## Customer / order terms (Migration A)

Migration A (customers, stores.customerId/code/legalName, sales_contracts customer and order terms) is additive and nullable; `backend/scripts/backfill-default-customer.js` links NULL stores and orders to one customer, Seapot per the owner decision (2026-10-31 09:00) that every existing store belongs to it; the code default is Seapot but the production command always passes `--customer-name Seapot` explicitly (dry-run default; --confirm needs --backup-dir and --receipt, reuses `financial-sqlite-safety.js`, 0600 receipt, counts-only output, never reads .env, never rewrites old order terms). Customer contact data is Confidential. Production run only after owner approval and a prior `npm run db:backup` snapshot; see `docs/redesign/DATA-MODEL-2026.md` §2.

### Customers API (J12)
`backend/src/routes/customers.js` (`customerController.js`, `services/customerService.js`): read for every authenticated role (BOSS only via the `bossReadOnly.js` GET whitelist, including `/customers/:id/stores`), write ADMIN/SALES with `withAuditLog`. There is no DELETE: archive = `PUT isActive:false`, and `customers` is registered in `lifecycle/resources.json`. USD only, incoterm in FOB/CFR/CIF/EXW/DDP, duplicate name 409. Customer contact fields are Confidential and are not in the audit field list (`utils/auditLog.js`). Store writes stay on `/stores` (existing roles unchanged; nested writes cannot join the lifecycle matrix): `code` is 2-12 `[A-Z0-9-]` upper-case (409 on duplicate), and a new store takes the only active customer when `customerId` is omitted, otherwise 400 请选择客户; archived customers take no new stores. Tests: `routes/customers.test.js`, `integration/customers.integration.js`. Orders (§2.4): `POST /sales` (`salesService.createSalesContract` and `salesCreationService.createSalesContractAtomically`, shared `resolveOrderCustomerFields`) links the only active customer or takes the given `customerId`, else 400 请选择客户, and copies incoterm/paymentTerms/portOfLoading from the customer when the request omits them; `customerId` changes only while DRAFT (400 otherwise). Customer archive query param is `includeArchived=true` (code is authoritative; spec §7 J12 still says `includeInactive=1`, to be corrected in the ux tail). Store archive follows suppliers: `GET /stores` (and `lite=true`) lists active stores, `status=archived|all` (`utils/archiveFilter.js`), `GET /stores/:id` still returns archived rows, and restoring (`isActive:true`) is ADMIN-only (403). Test: `integration/sales-customer-rules.integration.js`.
### Per-store purchasing and 生成采购单 (Migration B1, J16)
Migration B1 (`purchase_items.storeId`, `purchase_contracts.salesContractId`) is additive and nullable; old lines keep `storeId = null` and there is no backfill. `POST /api/v1/sales/:id/purchase-drafts` (ADMIN/PURCHASE only, audited as `GENERATE_FROM_SALES`; BOSS stays read-only by default) calls `purchaseContractGenerationService.js`: the order must be CONFIRMED, suppliers must be active, each (product, store) may be generated once per non-cancelled contract (409), and one DRAFT contract per supplier is written in a single transaction using the existing purchase number generator and amount helper (`normalizeItem`). Drafts are not payables. The route is registered in `lifecycle/resources.json` as `kind: "action"` (checker extension in `scripts/check-lifecycle.cjs`, template `lifecycle/action.template.json`, proof test `integration/purchase-drafts.integration.js`). The migration is a one-way door: take the consistent SQLite snapshot first; this branch never ran it against a real database.
