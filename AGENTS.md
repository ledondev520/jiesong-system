# Security & Development Operating Notes

## Subagent policy (Cursor hard guardrail)
- Cursor 默认不允许自动启动 subagent（包括任何“composer-*”类 worker 名称），即使会话中出现类似 `composer-2-fast` 的任务名也按**模型实例名称**处理，不能自动视作已授权子代理。
- 仅在用户明确写明“允许你使用 subagent / 允许 spawn_agent”的指令下，才可以在本会话中调用 `spawn_agent`，且仅限该指令范围内的子任务。
- 任何未经明确授权的 `spawn_agent` 调用都视为违规。

## Scope
- Applies to the whole repository rooted at `/Users/helena/Cursor/jiesong_system`.
- Security requirements are mandatory for code, scripts, docs, and operational procedures.
- All automation and scripts in this repo should follow the controls below unless explicitly overridden by an approved incident procedure.
- PR Review locks Prettier 3.9.9 and checks changed frontend TS/TSX source with full Git history and event base/head SHAs (`scripts/check-pr-format.cjs`); missing history/paths fail closed. Full unit/E2E checks remain enabled. Its report job uses zero token permissions and writes `GITHUB_STEP_SUMMARY`, preserving failed/cancelled check states instead of requiring comment-write access.

## ByteRover project memory
- This repo has local ByteRover engineering memory in `.brv/context-tree/`.
- Use `scripts/brv-local.sh` from the repo root instead of calling global `brv` directly; the wrapper keeps ByteRover runtime state under `state/byterover-home/`.
- Before substantive coding or debugging, run a focused memory lookup with `scripts/brv-local.sh query "<topic>"` or `scripts/brv-local.sh search "<topic>" --limit 5 --format json`. If no provider is connected, the wrapper automatically downgrades `query` to local search.
- After meaningful fixes, migrations, deployment changes, or repo-specific lessons, run `scripts/brv-local.sh curate "<durable technical conclusion>"` and include up to five relevant repo files with `-f`.
- Store only reusable technical memory. Do not put secrets, credentials, customer financial data, contract values, or personal/user-profile memory in `.brv/context-tree/`.
- Monthly financial statements, account balances, general-ledger rows, and their source filenames/hashes are Confidential; raw workbooks must not be committed, logged, or copied into ordinary attachment storage.
- Payroll, social-security, tax-return, voucher, and journal evidence rows are Confidential; redact personal identifiers before persistence, never archive source workbooks, and allow row-level reads only to ADMIN/FINANCE.

- 商品档案在 `frontend/src/components/layout/navigation.config.ts` 归采购模块，使已有权限的采购员可达现有页面；后端 `backend/src/routes/products.js` 继续执行读写角色校验，导航不授予额外 API 权限。

## UI Design System (强制)
- **所有前端页面开发必须遵循 SHADCN/UI 设计风格**.
- 优先使用 shadcn/ui 组件库 (https://ui.shadcn.com)，禁止自行造轮子.
- 设计 Token（颜色、间距、字体、圆角、阴影）必须与 shadcn/ui theme 保持一致.
- 自定义组件必须基于 shadcn/ui 的设计规范扩展.

## Security rules
- 出货退税清单确认及含票面核验行的导出仅供 ADMIN/FINANCE；`backend/src/routes/taxRefunds.js` 校验入口，`backend/src/controllers/fileController.js` 同步限制确认附件下载/删除，避免绕过行级权限。生成文件继续通过 `fileService.js` 的 0700/0600 归档，确认不等于正式申报。
- Never commit secrets (API keys, tokens, passwords, private keys, DB credentials), including in `.env`, `.env.*`, `*.example`, scripts, logs, and tests.
- If temporary test credentials are introduced, mark them clearly as non-production and require environment-variable override before上线.
- Use environment variables for secrets and validate their presence during startup.
- Do not print sensitive values to logs. Redact secrets from debug output and structured logs.
- Structured HTTP logs may retain request shape for diagnosis, but must not retain body/query values, AI prompts, tool schemas, or user messages.
- AI requests in `backend/src/services/aiService.js` and `anthropicCompatService.js` share a full-response deadline (default 30000ms via `KIMI_REQUEST_TIMEOUT_MS`, explicit 500–30000ms); SDK automatic retry/logging is disabled, and streamed usage avoids a second prompt-bearing estimation request.
- `AI_PROVIDER=deepseek` selects `DEEPSEEK_API_KEY`/`DEEPSEEK_BASE_URL` for the main AI flow without replacing separate Kimi integrations. `deepseekApiKey` overrides are encrypted and write-only; DeepSeek uses `deepseek-flash` with thinking enabled/high and preserves assistant reasoning across tool rounds. File permissions are checked before `.env` is loaded in `backend/src/config/index.js`.
- Agent retries must not multiply upstream calls: `openAgentService.loadSdk` disables the SDK's exported outer retry configuration, and `aiController.anthropicCompatMessage` sets `x-should-retry: false` for Anthropic transport; failed calls require an explicit new user request.
- Agent Runtime uses the published, locked `@codeany/open-agent-sdk` build (no developer `.tmp` fallback) and explicitly selects `anthropic-messages` for the local proxy regardless of the upstream model name.
- `backend/src/services/hsciqService.js` must bound full response waits, reserve pending-call quota and omit upstream response bodies from errors; `HSCIQ_TIMEOUT_MS` calibrates its 10000ms default within 1000–30000ms.
- System-configured API keys are write-only: response Interfaces may expose only a configured flag or masked suffix, and frontend pages must never render a complete stored key even for administrators.
- Environment-key fallback in `backend/src/controllers/system/configController.js` must mask the key with the same response helper as database configuration.
- `backend/src/routes/procurementTemplate.js` must authenticate every procurement-template read before loading Confidential historical store/purchase data.
- Keep dependencies updated with minimal privilege; avoid adding packages that require elevated permissions or execute shell by default.
- Enforce permission checks before loading `.env` and config files as implemented in `backend/src/config/index.js`.
- Use least privilege for files and directories created by the system, especially upload directories and temporary files.
- Contract attachments and generated documents must be stored in `0700` directories with `0600` file mode; `backend/src/services/fileService.js` is the enforcement point and must fail before persistence if permission tightening fails.
- Procurement attachment handlers in `backend/src/controllers/purchaseController.js` must use the shared file service for persistence and resolve downloads against `UPLOAD_DIR`.
- Carrier packing-list checks must archive the original PDF through `backend/src/services/fileService.js`, store only structured comparison output (not raw extracted text), and retain the referenced original while any `PackingListCheck` exists.
- Any privileged operation must fail closed (`throw`) in production and log with full context in non-production.

## Subagent policy
- 禁止在 Cursor 场景下自动/默认启动 subagent。
- 当且仅当用户显式要求 Codex 进行子任务分发时，允许使用 `spawn_agent`，并且只用于该明确授权范围内。
- 获得子任务分发授权后，所有子代理默认使用 `model: "gpt-6.1-sol"`、`reasoning_effort: "high"`；后续分发沿用此默认值，除非用户明确指定其他配置。
- 调用 `spawn_agent` 时显式传入上述属性；需要显式模型属性时使用 `fork_turns: "none"` 或正整数，并在任务说明中补齐必要上下文。不修改产品自身的 AI 模型、供应商或部署配置。

## Data classification
- 老板业务只读：`backend/src/middleware/bossReadOnly.js` 在数据库用户认证后使用明确GET白名单，业务写、AI/MCP和生成文件入口默认拒绝；仅自身密码及自身通知已读可写。两套用户管理入口变更角色后必须清除认证缓存。账簿行、来源文件元数据及工资/税务证据仍仅ADMIN/FINANCE可读，账期经营汇总可供老板查看。
- 分批到货/验货证据是Confidential：`backend/src/services/purchaseReceiptService.js` 在事务中保存真实认证操作者与不可变验货记录，仅合格增量入库；待验/待复验不可出库，FIFO拆分和销售回滚保留验货来源。仅ADMIN/PURCHASE/WAREHOUSE人类用户可登记；没有退货操作。历史数据不补造验货，普通导入不能跳过收货，历史完成数据仅有效ADMIN显式确认补录。
- See `data-classification.json` for the authoritative classification map.
- Restricted data: secrets, credentials, migration credentials, payment-related keys, supplier bank routing details, signed/generated contract documents, carrier packing-list originals, and packing-list review records.
- Company bank statements, transaction identifiers, balances, and account identifiers are Restricted; raw statement PDFs must not enter Git or ordinary attachment storage, and structured rows may persist only a masked account suffix plus currency and bank name.
- Agent/service-account credentials and credential hashes are also Restricted data and must never be printed in logs or committed to docs/tests.
- Confidential data: internal business data (customer orders, contract amounts, supplier/客户联系人信息, operational KPIs).
- Internal data: non-sensitive operational metrics, general feature flags, status enums, and non-production run metadata.
- Default rule: if data is not explicitly public, treat it as Internal or Confidential.

## Database safety rules
- **禁止直接运行 `prisma db push`**。SQLite 下 `db push` 在表结构变更时会丢弃数据。
- 表结构变更必须通过 `npm run db:migrate`（即 `prisma migrate dev`），该命令会先自动备份数据库。
- 手动备份：`npm run db:backup`，备份文件保存在 `prisma/backups/`，保留最近 5 个。
- SQLite 备份目录权限必须为 `0700`，备份数据库文件权限必须为 `0600`。
- 任何涉及数据库 schema 变更的操作前，必须确认 `prisma/backups/` 中有最新备份。
- 回滚方案：将 `prisma/backups/` 中的备份文件复制为 `prisma/dev.db` 即可恢复。

## Writing constraints
- Keep security-critical code changes minimal, explicit, and testable.
- Do not invent security controls; every added control must include a file path and rationale.
- For any config/security changes, update `SECURITY.md`, `AGENTS.md`, and `data-classification.json` together.
- Use deterministic output in scripts and services (no random fallback secrets, no non-deterministic defaults in auth paths).
- Document assumptions and any environment prerequisites inside the touched file as short comments.

## Learned product & repo conventions (transcript-backed)
- **Avoid duplicate primary UIs for the same data**: If two flows resolve to the same aggregate (e.g. 出口合同与货柜/排柜同源), keep a single navigation entry and one main surface; do not reintroduce parallel CRUD or search routes for the same entity.
- **排柜 / 3D 可视化**: When carton length/width/height are missing, prefer deriving sensible defaults from known totals (e.g. total volume ÷ box count) for visualization instead of requiring exhaustive manual dimensions per line.
- **HS 编码查询**: Keep numeric HS code (prefix) semantics consistent end-to-end for actions like「使用该编码搜索」; treat「商品名称」与「数字 HS 编码」as distinct query dimensions where mixing would confuse ranking or prefix logic.
- **列表页模式**: Prefer shared patterns already in the app—server/client paging with page-size options (e.g. 20/50/100), search boxes paired with reset/clear, and mobile table views using `md:hidden` cards plus `hidden md:block` tables (e.g. `MobileListCard` from `@/components/mobile`).
- **仓库可部署性**: Keep the GitHub-facing tree deployable and lean—do not commit build outputs, local DB files, or ad-hoc operational ledgers; tighten `.gitignore` when new artifact types appear.

## Git Commit Rules
- **每次功能迭代完成后必须提交一个 commit**。禁止积累大量改动后一次性提交。
- Commit message 遵循 `<type>: <subject>` 格式，type 可选：`feat`（新功能）、`fix`（修复）、`refactor`（重构）、`chore`（杂项）、`docs`（文档）。
- 若一次迭代涉及多个独立功能，拆分为多个 commit。

## 登录提示边界
- `frontend/src/lib/auth-session.ts` 对无本标签令牌的 401 只要求登录，不能据此声称用户会话过期；不改变 sessionStorage、JWT 或权限校验。

## 流程自动化边界
- `backend/src/services/openAgentService.js` 中仅内部采购、报关、核销、退税草稿按请求直接执行，沿用工具角色校验、执行日志与单轮去重；签约、付款、实物状态及异常处理保留一次业务确认。AI 发运登记必须调用 `salesService.updateSalesStatus`，不能用合同头更新接口虚报状态已变化。

- 报关自动生成只允许原子替换 DRAFT，保留单据 ID 与编号；已放行等业务状态必须拒绝替换（`backend/src/services/customsDeclarationDraftService.js`）。出货按自有装箱行与采购来源扣减合格库存，重复保存相同业务资料不使退税确认失效。

- Agent 普通与流式入口必须检查 SDK query 的终止结果（`backend/src/services/openAgentService.js`）；上游错误返回 503/SSE error，不写入成功回放，不自动重试。

- `frontend/src/lib/api-base-url.ts` 统一普通请求与 Next 代理地址：裸后端 origin 自动添加 `/api/v1`，完整 API 路径和显式自定义路径保持不重复拼接；不修改实际部署环境值。

- `backend/src/utils/inventoryStateMachine.js` 拒绝手工修改采购/验货来源库存；普通、批量及 AI 确认执行均重新检查来源与当前状态。相同状态不改入出库时间；库存页面隐藏业务来源记录的重复手工流转入口。

## VPS 运行目录与发布验证
- `celerada.link` 的 PM2 进程 `jiesong-backend`、`jiesong-frontend` 必须分别运行 `/opt/jiesong-system/backend`、`/opt/jiesong-system/frontend`，与 Git 部署构建目录一致；仅重启旧发布目录不算发布成功。
- `.github/workflows/deploy.yml` 遇错停止，使用触发提交 SHA；发布末尾运行 `scripts/verify-vps-runtime.cjs` 校验 PM2 目录、后端健康、公网 BUILD_ID 和未登录 API 的 401。
- 运行目录迁移沿用原有绝对 DATABASE_URL、UPLOAD_DIR 和私密环境配置；切换前的数据库与配置备份放在受保护目录（0700/0600），不得输出完整 PM2 环境或凭据。

## 邮箱注册边界
- `backend/src/services/emailService.js` 复用阿里云杭州 DirectMail；仅私有环境配置 `ALIBABA_CLOUD_ACCESS_KEY_ID`、`ALIBABA_CLOUD_ACCESS_KEY_SECRET`、`JIESONG_EMAIL_FROM`，可选 STS token。密钥不返回浏览器，部分配置在启动时拒绝，`backend/src/config/index.js` 在读取环境密钥前先验证文件权限。
- `backend/src/services/emailRegistrationService.js` 持久保存带密钥验证码哈希，10分钟有效、最多5次验证；60秒重发冷却、每邮箱每小时5次、全站每小时60次，失败发信仍计数且旧码失效。成功注册与消费验证码在同一事务，角色固定SALES且未激活，管理员审核后方可访问业务。
- 注册邮箱作为用户名，登录兼容原用户名；管理员创建用户仍需ADMIN。邮件正文、验证码与云服务响应正文不得进入日志。验证码记录超过24小时后在下一次发码时清理。
- RBAC 路由扫描仅明确豁免登录前的 `/auth/email-code` 与 `/auth/email-register`；回归检查它们保留限流及校验，`/auth/register` 继续要求认证和ADMIN。
- `frontend/src/app/dashboard/users/components/UserDialog.tsx` 提供管理员账号开通开关；两套用户更新入口更新状态或角色后立即清除认证缓存，避免停用/改权延迟。

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
- `scripts/nestlet-verify-archive.py` permits only the pinned 4d predecessor after complete 315-file public archive and 31 literal runtime-copy verification, checked inherited maintenance lease, image/hardening/schema checks and fixed-class-only failure output. Unknown archive entries are retained and rejected before byte reads; generated frontend/dependency bytes are not claimed source-equivalent. The candidate remains Git-pinned. The workflow permits upgrade and a standalone read-only predecessor verifier. Failure output is limited to five fixed validation-class codes, with no detailed inspection route.

- Canonical Git archive group-write bits are accepted only inside the verified owned 0700 root with trusted UID/GID and complete manifest checks. Runtime COPY group-write bits require the existing read-only root/no-overlay proof and approved UID/GID. World-write, special bits, untrusted ownership, links, content differences and unsafe ancestry still fail; the verifier never changes permissions.

## Nestlet provider-only mail proof
- `scripts/nestlet-mail-proof.py` runs one fixed, plain, no-action test inside the existing pinned schema4 container using its existing DirectMail environment. It never reads runtime.env, exports credentials, invokes account APIs, writes user data, or changes deployment/configuration. The official DirectMail endpoint is fixed and no automatic send retry exists.
- A root-owned 0600 exclusive attempt marker under the existing private shared directory is fsynced before the provider call and never reset. Repeated/uncertain attempts require inbox reconciliation, not rerunning or deleting the marker. Workflow output is allowlisted to provider-accepted/provider-unconfirmed; inbox receipt and signup/reset acceptance remain separate checks.

## Nestlet provider-only streaming proof
- `scripts/nestlet-stream-proof.py` permits one fixed synthetic text request inside the exact pinned running schema4 container, using only its already-configured DeepSeek environment. It reuses the hash-verified pure public chat parser without loading server/auth/storage. The official endpoint and deepseek-flash model are fixed, output is capped at 16 tokens, and no retries or tool/image/case content are allowed.
- A 0600 exclusive fsynced host-local attempt marker prevents repeat/uncertain calls. The existing maintenance lease and nestlet-stage workflow concurrency are preserved; configuration, deployment, user data and the completed mail-proof marker are untouched. Output is only stream-completed/provider-unconfirmed. Successful transport does not establish UI, extraction, vision, retrieval, customer-data privacy or release acceptance.
