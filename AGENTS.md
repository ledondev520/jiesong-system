# Security & Development Operating Notes

This file holds working rules only. Per-file security and business controls live in `SECURITY.md`; data classifications live in `data-classification.json`; card history stays in git and PR descriptions.

## Subagent policy (Cursor hard guardrail)
- Cursor 默认不允许自动启动 subagent（包括任何“composer-*”类 worker 名称），即使会话中出现类似 `composer-2-fast` 的任务名也按**模型实例名称**处理，不能自动视作已授权子代理。
- 仅在用户明确写明“允许你使用 subagent / 允许 spawn_agent”的指令下，才可以在本会话中调用 `spawn_agent`，且仅限该指令范围内的子任务。
- 任何未经明确授权的 `spawn_agent` 调用都视为违规。
- 禁止在 Cursor 场景下自动/默认启动 subagent。
- 当且仅当用户显式要求 Codex 进行子任务分发时，允许使用 `spawn_agent`，并且只用于该明确授权范围内。
- 获得子任务分发授权后，所有子代理默认使用 `model: "gpt-6.1-sol"`、`reasoning_effort: "high"`；后续分发沿用此默认值，除非用户明确指定其他配置。
- 调用 `spawn_agent` 时显式传入上述属性；需要显式模型属性时使用 `fork_turns: "none"` 或正整数，并在任务说明中补齐必要上下文。不修改产品自身的 AI 模型、供应商或部署配置。

## Scope
- Applies to the whole repository rooted at `/Users/helena/Cursor/jiesong_system`.
- Security requirements are mandatory for code, scripts, docs, and operational procedures.
- All automation and scripts in this repo should follow the controls in `SECURITY.md` unless explicitly overridden by an approved incident procedure.
- PR Review locks Prettier 3.9.9 and checks changed frontend TS/TSX source with full Git history and event base/head SHAs (`scripts/check-pr-format.cjs`); missing history/paths fail closed. Full unit/E2E checks remain enabled. Its report job uses zero token permissions and writes `GITHUB_STEP_SUMMARY`, preserving failed/cancelled check states instead of requiring comment-write access.
- `main` is protected by repository ruleset `main-protection` (id 25453471): changes land only through a pull request (0 required approvals), main cannot be deleted or force-pushed, and 9 GitHub Actions checks must pass before merge (Code Quality, Unit Tests, Build Test, Type Safety Check, Lint Check, Backend Unit Tests, Frontend Unit And Coverage, Frontend E2E Acceptance, Secret Detection). Merge with `gh pr checks <N> --required --watch` then `gh pr merge <N> --merge --match-head-commit <sha>`; never use `--admin` (no bypass actors are configured).
- Reviewers check every PR diff against the root `CODING_STANDARDS.md` (review-time only; do not paste it into implementation prompts). PR descriptions must state one-way vs two-way door, blast radius and rollback (`.github/pull_request_template.md`).
- Lightweight UI-only PRs (spec `docs/redesign/UX-REDESIGN-2026.md` §14): `scripts/check-ui-only.cjs ui-only` verifies the full PR diff against the §14.1 allowlist/denylist; `.github/workflows/ui-only.yml` runs it when the PR carries the `ui-only` label (not a required check; confirm it passed before merging). The label never relaxes anything: `Backend Unit Tests` and `Unit Tests` (`ci.yml`) skip the backend suites only when `check-ui-only.cjs backend-gate` proves the whole diff is UI-only (push events, missing history or any error run everything), and still run `check-lifecycle.cjs` because it scans frontend list pages. All 9 required checks keep reporting (no workflow-level `paths` filters); the ruleset, review-freshness and the local `check-review-freshness.cjs` run are unchanged. PR body: `.github/PULL_REQUEST_TEMPLATE/ui-only.md`. Backend, schema, pricing, finance, customs/tax-refund, `.github/`, dependency PRs keep the full process.
- 合并前必须在完整历史仓库本地运行 `node scripts/check-review-freshness.cjs --repo <owner/name> --pr <N>` 并确认退出码 0；PR 作者或仓库 owner 的最新复核标记须匹配 head；`scripts/check-review-freshness.cjs` 的 PR 文件集合取 B0/H、B1/H 两对所有最佳共同祖先（`merge-base --all`）到 H 的 diff 文件并集，避免交叉合并漏掉文件；base 后续改动碰到 PR 文件则作废，GitHub 已绿检查不会因 main 前进自动变红（见 `.github/workflows/README.md`）。

## ByteRover project memory
- This repo has local ByteRover engineering memory in `.brv/context-tree/`.
- Use `scripts/brv-local.sh` from the repo root instead of calling global `brv` directly; the wrapper keeps ByteRover runtime state under `state/byterover-home/`.
- Before substantive coding or debugging, run a focused memory lookup with `scripts/brv-local.sh query "<topic>"` or `scripts/brv-local.sh search "<topic>" --limit 5 --format json`. If no provider is connected, the wrapper automatically downgrades `query` to local search.
- After meaningful fixes, migrations, deployment changes, or repo-specific lessons, run `scripts/brv-local.sh curate "<durable technical conclusion>"` and include up to five relevant repo files with `-f`.
- Store only reusable technical memory. Do not put secrets, credentials, customer financial data, contract values, or personal/user-profile memory in `.brv/context-tree/`.

## UI Design System (强制)
- **所有前端页面开发必须遵循 SHADCN/UI 设计风格**.
- 优先使用 shadcn/ui 组件库 (https://ui.shadcn.com)，禁止自行造轮子.
- 设计 Token（颜色、间距、字体、圆角、阴影）必须与 shadcn/ui theme 保持一致.
- 自定义组件必须基于 shadcn/ui 的设计规范扩展.

## Security rules
- Exactly two roles exist (OD-8, owner 2026-11-11): ADMIN sees everything; SALES does data and contract entry and never sees finance or sales-contract/payment totals. Do not reintroduce PURCHASE/FINANCE/WAREHOUSE/BOSS or widen SALES to a finance surface without a new owner decision; role-to-route mapping is in `SECURITY.md` "Two-role model (OD-8)".
- Never commit secrets (API keys, tokens, passwords, private keys, DB credentials), including in `.env`, `.env.*`, `*.example`, scripts, logs, and tests.
- 本地被 Git 忽略的运维笔记（如 `PLAN.md`）同样不得保存真实登录凭据；登录验证只记录结果，避免检查笔记时再次暴露凭据。
- If temporary test credentials are introduced, mark them clearly as non-production and require environment-variable override before上线.
- Use environment variables for secrets and validate their presence during startup.
- Do not print sensitive values to logs. Redact secrets from debug output and structured logs.
- Structured HTTP logs may retain request shape for diagnosis, but must not retain body/query values, AI prompts, tool schemas, or user messages.
- System-configured API keys are write-only: response Interfaces may expose only a configured flag or masked suffix, and frontend pages must never render a complete stored key even for administrators.
- Keep dependencies updated with minimal privilege; avoid adding packages that require elevated permissions or execute shell by default.
- Enforce permission checks before loading `.env` and config files as implemented in `backend/src/config/index.js`.
- Use least privilege for files and directories created by the system, especially upload directories and temporary files.
- Any privileged operation must fail closed (`throw`) in production and log with full context in non-production.

## 应付口径
- 应付（payables）只有一个口径：`backend/src/services/payablesService.js`。生效合同（SIGNED/PRODUCING/READY/SHIPPED/RECEIVED/COMPLETED）的 Σmax(总额−已付,0)，草稿与已取消永不计入（状态先经 `normalizePurchaseStatus`，旧别名 PENDING_INSPECTION/IN_STOCK 与小写拼写仍按其规范状态计入），逾期按 `expectedDate`。财务概览/付款列表（`financeService`）、首页与经营执行（`dashboardController`）、AI 上下文、采购导出必须调用它；前端只展示接口结果，禁止另行汇总。一致性回归：`backend/src/integration/payables-one-basis.integration.js`。

## Data classification
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
- 手动备份：`npm run db:backup`，必须显式传 `--database` 或在进程环境导出SQLite `DATABASE_URL`，不读取.env、不猜测源库；默认保存到 `prisma/backups/`，仅保留最近5个本脚本管理的快照及manifest。
- SQLite 备份目录权限必须为 `0700`，备份数据库文件权限必须为 `0600`。
- 任何涉及数据库 schema 变更的操作前，必须确认 `prisma/backups/` 中有最新备份。
- 恢复：`npm run db:restore -- --backup <snapshot> --database <new-private-path>`，验证manifest校验和及SQLite完整性，只恢复到不存在的新路径。切换应用前停机并明确切换DATABASE_URL；禁止覆盖在线库或忽略WAL/SHM。详见 `docs/operations/sqlite-backup-restore.md`。

## Writing constraints
- Keep security-critical code changes minimal, explicit, and testable.
- Do not invent security controls; every added control must include a file path and rationale.
- Record a new or changed control (file path + rationale) in `SECURITY.md` only. Change `AGENTS.md` only when a working rule changes, and `data-classification.json` only when a classification changes. Do not copy card history into any of the three files.
- Use deterministic output in scripts and services (no random fallback secrets, no non-deterministic defaults in auth paths).
- Document assumptions and any environment prerequisites inside the touched file as short comments.

## Learned product & repo conventions (transcript-backed)
- **Avoid duplicate primary UIs for the same data**: If two flows resolve to the same aggregate (e.g. 出口合同与货柜/排柜同源), keep a single navigation entry and one main surface; do not reintroduce parallel CRUD or search routes for the same entity.
- **排柜 / 3D 可视化**: When carton length/width/height are missing, prefer deriving sensible defaults from known totals (e.g. total volume ÷ box count) for visualization instead of requiring exhaustive manual dimensions per line.
- **柜型规格与排柜**: 20GP/40GP/40HQ 内尺寸、安全限值、出柜阈值和装柜画像只来自 `config/containers.json`（40HQ 默认），后端 `containerSpecs.js` 加载并校验（无效即失败）；排柜只在后端 `containerPacking.js`，经只读 `GET /api/v1/sales/:id/loading-plan`（已认证，ADMIN/SALES 可读，不持久化任何数据）交给前端渲染。前端不得自行排柜或硬编码柜型数字/提示文案；确认发运门槛固定按默认柜型。
- **HS 编码查询**: Keep numeric HS code (prefix) semantics consistent end-to-end for actions like「使用该编码搜索」; treat「商品名称」与「数字 HS 编码」as distinct query dimensions where mixing would confuse ranking or prefix logic.
- **列表页模式**: Prefer shared patterns already in the app—server/client paging with page-size options (e.g. 20/50/100), search boxes paired with reset/clear, and mobile table views using `md:hidden` cards plus `hidden md:block` tables (e.g. `MobileListCard` from `@/components/mobile`).
- **仓库可部署性**: Keep the GitHub-facing tree deployable and lean—do not commit build outputs, local DB files, or ad-hoc operational ledgers; tighten `.gitignore` when new artifact types appear.

## Git Commit Rules
- **每次功能迭代完成后必须提交一个 commit**。禁止积累大量改动后一次性提交。
- Commit message 遵循 `<type>: <subject>` 格式，type 可选：`feat`（新功能）、`fix`（修复）、`refactor`（重构）、`chore`（杂项）、`docs`（文档）。
- 若一次迭代涉及多个独立功能，拆分为多个 commit。
