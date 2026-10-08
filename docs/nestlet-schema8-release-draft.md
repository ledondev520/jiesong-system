# Schema7 → schema8 durable-login activation preparation

Local activation patch only. No publication, dispatch, credential changes or production mutation; exact-source CI, independent activation review and release approval remain mandatory.

## Identity and activation requirements

Current live predecessor: `05923a88156d8d2d1c497d22c3ef56414452d063`, schema7; verified successful release run37713879412. Final merge pin: `73548035a07adafab9ed63213e8c6ea451f25dbb`, tree `967a1592d0a94ad550fa3c15c93a0913f713138a`, identical to reviewed PR38 `07f115caeee48cf1559cf780a35d6bc094e94c8c`. Use the final reviewed merge only after exact-source checks, browser/container CI and independent activation review. Pin helper, workflow, fixture and helper digest together. Dedicated proposed branch `ops/nestlet-schema8-release-20261008`; never merge its workflow into Jiesong main.

## Release gates

1. Preserve existing transport/host checks, exclusive maintenance lease, clean exact Git source, immutable images, Nestlet-only Compose scope and hardened private volume. Configuration may change only the approved literal image tag.
2. Build final candidate, then isolated fresh-schema8 tmpfs smoke with no credentials or live AI. Verify required auth-session module, schema8, empty session/capability/audit/intent tables, compiled `/next/app.js`, MIME/body and anonymous API refusals.
3. Stop only Nestlet. Capture SQLite-API pre7 backup plus referenced originals; verify with both predecessor and candidate CLIs. Evidence remains local0700/0600 and no contents, digests, paths or credentials enter logs.
4. Restore a separate pre7 copy. Migrate7→8, requiring all old rows, sequences and DDL unchanged. Permit only the exact new session DDL from AUTH_SESSION_SCHEMA_SQL, including the credential-revocation trigger on users. Assert new session table empty, integrity/FK checks, repeat-open byte stability and original integrity.
5. Backup a schema8 rehearsal without changing any source row. Snapshot schema/rows must be exactly identical, including sessions. Restore to a NEW separate copy: schema and every non-session row must be identical; only auth_sessions must be empty. Reverify that source and backup are untouched. This documented restore exception prevents logged-out/revoked bearer resurrection and never authorizes deletion of live sessions in a normal release.
6. Prove predecessor7 refuses schema8 without changing bytes/files; candidate refuses future9. Reverify untouched pre7 recovery, then recreate only Nestlet with exact candidate and check image, health, private schema8 mount, helpers and pointer.
7. Verify public health/status and exact compiled assets. Initial schema7 RAM sessions cannot be recovered and require one fresh login. Valid schema8 ordinary/owner sessions subsequently survive restarts without extending existing idle/absolute TTL; logout, credential changes, capability refresh and restored-copy invalidation still apply.

## Recovery boundary

No automatic schema7 restart, live restoration, downgrade, original deletion or unrelated-service mutation. Once stopped or candidate attempted, retain evidence and use reviewed forward repair or separately authorized manual recovery. Never attach schema8 DB to schema7. Restoring an older snapshot can revive data, passwords, email actions or grants; session invalidation does not remove those other risks. Same-host backups are not off-host disaster recovery.

Strict expiration-related telemetry preservation refusal remains unchanged. Do not clean rows or weaken the gate to force migration.

## Local verification

Safety tests verify exact dispatch pins, pins, transport, scope, environment-byte preservation, no fallback and narrowly scoped restore exception. Actual helper embedded drills run against clean exact predecessor/candidate trees in DELETE/WAL modes with populated users, email states, grants/audit, review receipts, cases, messages, artifacts, originals and sequence high-water marks. Synthetic owner/trial sessions survive reopening with valid CSRF; schema8 backup retains sessions, restored copies clear them and all other records survive; original source sessions remain usable. Normal and expired-telemetry refusal fixtures are separate.

Application schema8/durable-session16 focused tests also cover TTL, logout, owner rotation, invalid setup, cross-connection revocation, failed registration/session transactions and future9 refusal. No real accounts, external providers, secrets or production restore are involved.
