# Consolidated schema7 → schema9 activation preparation

Local activation patch only. No publication, dispatch, live host operation or reuse of the pending schema8 approval. Final release requires fresh explicit user approval identifying this combined schema9 migration.

## Identity

Actual live predecessor remains `05923a88156d8d2d1c497d22c3ef56414452d063`, schema7. Successful predecessor run37713879412. Schema8 main73548035 was merged but never deployed. Final merge PR42 `bbd240cf35069af97b7d684690bbd12b747ff503`, tree `667ba6b007bee7128434e44a62b6cfc701d1161f` identical to reviewed candidate `ab803615497a28ee76f0895300d7ae6f39f7eb0a`, includes durable sessions and remembered library consent. Final merge tree is verified; exact-source CI must complete before publication; independent activation review precedes any publication. Proposed dedicated branch `ops/nestlet-schema9-release-20261008` must never be merged into Jiesong main.

## Gates

1. Preserve existing host/transport identity, exclusive lease, Nestlet-only scope, private volume, clean source and immutable-image checks. Only the literal image tag and release pointer may change.
2. Exact candidate build and isolated tmpfs smoke: schema9, required session/consent modules, empty session/permission/capability/audit/intent tables, exact compiled UI entry with correct MIME/body, anonymous API refusals. No credentials or live AI.
3. Stop only Nestlet and capture SQLite-API pre7 backup with referenced originals; verify independently using old and candidate CLIs. Keep evidence local0700/0600; no private data/paths/digests in workflow output.
4. Restore a separate pre7 copy, migrate7→9 and preserve every existing schema object, row and sequence. Only exact AUTH_SESSION_SCHEMA_SQL and LIBRARY_CONSENT_SCHEMA_SQL additions are allowed. Both new tables must be empty: legacy owners and ordinary accounts remain unset, not automatically permitted to share library excerpts. Require integrity/FK checks and repeat-open byte stability.
5. Schema9 backup must preserve every row, including sessions and both allow/deny library choices. A NEW restored copy deliberately empties auth_sessions and library_permissions only. All other rows and all DDL must remain identical; verify assets, reverify original backup and full snapshot equality after restore, and confirm original source bytes remain unchanged. This exception does not authorize deleting live security state during ordinary releases.
6. Predecessor7 must refuse schema9 without byte/file changes; candidate must refuse future10 likewise. Reverify pre7 recovery, then only after release approval switch the literal tag, recreate Nestlet with the pinned candidate and verify image/hardening/health/private schema9 mount before switching pointer.
7. Verify public health/status and final exact-build UI assets. Initial RAM sessions cannot be recovered; users may need one login. Subsequent valid durable sessions survive ordinary restarts without extending TTL; logout/reset/revocation remain enforced. Restored sessions and remembered library choices never silently revive.

## Failure and recovery

No automatic fallback, schema7 restart after downtime, live restore, downgrade, original deletion or unrelated-service restart. Retain all evidence and use an independently reviewed forward fix or separately approved manual recovery. Restored-copy security clearing does not remove other snapshot risks: passwords, grants, email actions and business records may be older. Same-server backup is not off-host disaster recovery.

Strict expired-telemetry refusal remains unchanged; never prune production data or weaken checks to force acceptance.

## Evidence

Eleven safety tests and actual embedded DELETE/WAL drills cover populated schema7 cases, originals, messages, drafts, verified review receipts, email states, active administrator grants/audit, telemetry and sequence high-water marks. Candidate sessions survive reopening with valid CSRF; remembered allow/deny decisions persist and legacy defaults are unset. Backups retain all security rows, restored copies clear both specified tables and preserve all business rows/receipts. Separate expired-telemetry fixtures prove untouched-source refusal. No real provider call, real account creation or production restore is performed.
