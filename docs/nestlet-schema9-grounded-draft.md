# Disabled same-schema9 observation update

Local activation patch only: no publication, dispatch, live data change or browser handoff action.

Predecessor is actual live `090d08ee4823c041b1f835d4ac307e7963b6fb93`, schema9. Local grounded-review candidate `b2345d133ae92a6a092c4dd5762a2b1efc99003a` adds a conservative explicit review-command lane, read-only verified tool selection, provider-only history projection, persisted result/assistant success ordering and negotiated atomic completion with a legacy post-save wire fallback. No schema or permission migration is involved. Fresh explicit user approval covers source publication, reviewed merge and the existing operations channel; final merge `f738655ccab834d77d9204ebab25ab1e2a61d8ee` has verified tree `d5c1a92b8346658708d7e9419abe16afffc64b94`, identical to the reviewed candidate. This remains local preparation until final CI, independent activation review and root authorization. Proposed isolated branch `ops/nestlet-schema9-grounded-20261008`.

## Preservation and release sequence

1. Verify predecessor source/image/health/schema9, managed directories, private volume, host identity and exclusive lease. Compare auth, session storage, schema storage, consent, email, review/audit, backup/restore, Compose and package-lock bytes before build/downtime. A separate exact packaging gate permits only review-operation.js inclusion in the frontend/runtime COPY lists and .dockerignore allowlist, plus the two new test/check script suffixes. Every other Dockerfile/.dockerignore/package.json value must match. Keep credentials and environment bytes unchanged except literal image tag.
2. Build and run isolated fresh-schema9 smoke with no credentials/providers. Require exact compiled UI path/MIME/body and anonymous boundaries.
3. Stop only Nestlet, create private SQLite-API backup including originals and verify with both CLIs. Create another snapshot via backup API, not restore, for preservation rehearsal. This retains all session and library-permission rows.
4. Candidate storage startup must preserve every schema object and row including sessions, permissions, review receipts and sequences, and repeat-open bytes. Test predecessor startup on the separate session-preserving copy with unchanged bytes. Schema10 must fail closed on another copy.
5. Independently backup/restore the rehearsal copy. Backup must retain all rows before and after restore. Only the NEW restored copy empties auth_sessions/library_permissions; every other row and all DDL/assets remain exact. Never use that restored copy as live deployment storage.
6. Reverify recovery evidence, update literal tag, recreate only Nestlet with the pinned image on the original existing volume, check health/schema9/hardening and atomically switch the pointer. Check public assets against exact final build.

This is an application replacement, not a migration or restore. Existing valid ordinary and owner sessions, CSRF tokens and remembered permission choices must survive with the same credentials; expiry/revocation remains unchanged. No blanket relogin requirement should be introduced. Do not touch the logged-in cloud browser until the parent coordinates any acceptance check.

## Evidence and failure behavior

DELETE/WAL fixtures create owner and ordinary sessions plus allow/deny choices using the old runtime before backup, verify preservation and valid CSRF after candidate reopen, test newly created sessions too and confirm restore-only invalidation. Existing verified review receipts, email states, grants/audit, originals and business rows remain intact. Expired-telemetry fixtures fail closed with original and recovery snapshot unchanged.

No automatic rollback, restore, downgrade, data cleanup, grant mutation or provider calls. A stopped-service failure retains evidence and requires reviewed forward repair or separately authorized recovery. Same-host snapshots are not off-host disaster recovery.

## Protocol and packaging acceptance

The added shared review-operation.js must exist in frontend build context and final runtime image; candidate smoke imports it. Local packaging regression rejects any extra Docker command, broad ignore allowlist or dependency change. Candidate HTTP/SQLite tests cover actual persistence ordering and frozen legacy parser consumption, while frontend parser tests cover the atomic envelope. Failed persistence must not emit success/card; cancellation/legacy delivery must not alter stored identities. Official exact-merge container/browser acceptance remains required; local tests are not a production provider call.
