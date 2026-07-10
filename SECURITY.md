# Security Playbook

## 5-Layer Defense Architecture

### 1) 访问控制与身份层（Identity & Access）
- Enforce explicit身份校验 (JWT + role checks) for all sensitive routes.
- Treat Agent / Service Account credentials as independent machine identities; never reuse employee passwords or browser sessions for automation.
- Keep authentication middleware as single entry for route groups and validate user context before业务处理.
- Use least-privilege账号 and role-to-resource mapping for every service boundary.
- Disable默认凭证 and rotate all secrets periodically.

### 2) 运行时与执行环境层（Host & Runtime）
- Keep `.env` permissions tight; warn in非生产 and block in生产 for misconfigured permissions.
- Run Node进程 with最小权限 (non-root, locked-down directories) and mount config with read-only policy where possible.
- Keep upload/storage directories explicitly created and scoped to应用用户.
- Contract evidence written by `backend/src/services/fileService.js` must use `0700` directories and `0600` files; permission tightening must succeed before the database record is created.
- Carrier packing-list originals are Restricted evidence: `packingListCheckService.js` must archive them through `fileService.js`, persist only structured comparison results (never raw extracted PDF text), and prevent deletion while a check record references the file.
- Add startup checks for config file accessibility and permission drift.

### 3) 网络与应用边界层（Application & Network）
- Apply CORS whitelist (`CORS_ORIGIN`) and avoid `*` in生产 environments.
- Enforce request size limits, rate limiting at API网关 (or reverse proxy), and strict MIME/type checks on uploads.
- Keep internal errors server-side; expose only最小化错误码 to clients.
- Require HTTPS in external endpoints and internal服务间连接。

### 4) 数据与隐私层（Data Protection）
- Classify data by tier per `data-classification.json` and apply处理规则 in code and documents.
- Treat supplier bank routing fields, signed/generated contract artifacts, carrier packing lists, and their review records as Restricted data; do not include their values in logs, engineering memory, or test fixtures copied from production.
- Store secrets in `.env` only, never in repository tracked text.
- Redact PII/敏感字段 in logs and exports; avoid writing raw identifiers to audit channels unless authorized.
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
