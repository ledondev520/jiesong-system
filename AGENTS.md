# Security & Development Operating Notes

## Scope
- Applies to the whole repository rooted at `/Users/helena/Cursor/jiesong_system`.
- Security requirements are mandatory for code, scripts, docs, and operational procedures.
- All automation and scripts in this repo should follow the controls below unless explicitly overridden by an approved incident procedure.

## UI Design System (强制)
- **所有前端页面开发必须遵循 SHADCN/UI 设计风格**.
- 优先使用 shadcn/ui 组件库 (https://ui.shadcn.com)，禁止自行造轮子.
- 设计 Token（颜色、间距、字体、圆角、阴影）必须与 shadcn/ui theme 保持一致.
- 自定义组件必须基于 shadcn/ui 的设计规范扩展.

## Security rules
- Never commit secrets (API keys, tokens, passwords, private keys, DB credentials), including in `.env`, `.env.*`, `*.example`, scripts, logs, and tests.
- If temporary test credentials are introduced, mark them clearly as non-production and require environment-variable override before上线.
- Use environment variables for secrets and validate their presence during startup.
- Do not print sensitive values to logs. Redact secrets from debug output and structured logs.
- Keep dependencies updated with minimal privilege; avoid adding packages that require elevated permissions or execute shell by default.
- Enforce permission checks before loading `.env` and config files as implemented in `backend/src/config/index.js`.
- Use least privilege for files and directories created by the system, especially upload directories and temporary files.
- Any privileged operation must fail closed (`throw`) in production and log with full context in non-production.

## Subagent policy
- 禁止在 Cursor 场景下自动/默认启动 subagent。
- 当且仅当用户显式要求 Codex 进行子任务分发时，允许使用 `spawn_agent`，并且只用于该明确授权范围内。

## Data classification
- See `data-classification.json` for the authoritative classification map.
- Restricted data: secrets, credentials, migration credentials, payment-related keys, and signed contract documents.
- Agent/service-account credentials and credential hashes are also Restricted data and must never be printed in logs or committed to docs/tests.
- Confidential data: internal business data (customer orders, contract amounts, supplier/客户联系人信息, operational KPIs).
- Internal data: non-sensitive operational metrics, general feature flags, status enums, and non-production run metadata.
- Default rule: if data is not explicitly public, treat it as Internal or Confidential.

## Database safety rules
- **禁止直接运行 `prisma db push`**。SQLite 下 `db push` 在表结构变更时会丢弃数据。
- 表结构变更必须通过 `npm run db:migrate`（即 `prisma migrate dev`），该命令会先自动备份数据库。
- 手动备份：`npm run db:backup`，备份文件保存在 `prisma/backups/`，保留最近 5 个。
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
