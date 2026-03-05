# Security Operating Notes

## Scope
- Applies to the whole repository rooted at `/Users/helena/Cursor/jiesong_system`.
- Security requirements are mandatory for code, scripts, docs, and operational procedures.
- All automation and scripts in this repo should follow the controls below unless explicitly overridden by an approved incident procedure.

## Security rules
- Never commit secrets (API keys, tokens, passwords, private keys, DB credentials), including in `.env`, `.env.*`, `*.example`, scripts, logs, and tests.
- Use environment variables for secrets and validate their presence during startup.
- Do not print sensitive values to logs. Redact secrets from debug output and structured logs.
- Keep dependencies updated with minimal privilege; avoid adding packages that require elevated permissions or execute shell by default.
- Enforce permission checks before loading `.env` and config files as implemented in `backend/src/config/index.js`.
- Use least privilege for files and directories created by the system, especially upload directories and temporary files.
- Any privileged operation must fail closed (`throw`) in production and log with full context in non-production.

## Data classification
- See `data-classification.json` for the authoritative classification map.
- Restricted data: secrets, credentials, migration credentials, payment-related keys, and signed contract documents.
- Confidential data: internal business data (customer orders, contract amounts, supplier/客户联系人信息, operational KPIs).
- Internal data: non-sensitive operational metrics, general feature flags, status enums, and non-production run metadata.
- Default rule: if data is not explicitly public, treat it as Internal or Confidential.

## Writing constraints
- Keep security-critical code changes minimal, explicit, and testable.
- Do not invent security controls; every added control must include a file path and rationale.
- For any config/security changes, update `SECURITY.md`, `AGENTS.md`, and `data-classification.json` together.
- Use deterministic output in scripts and services (no random fallback secrets, no non-deterministic defaults in auth paths).
- Document assumptions and any environment prerequisites inside the touched file as short comments.
