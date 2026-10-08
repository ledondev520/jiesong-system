# Disabled same-schema9 observation update

Local activation patch only: no publication, dispatch, live data change or browser handoff action.

Predecessor is actual live `d1b746e365338aab1c79662ebe360a24dff6ba5b`, schema9. PR45 candidate `bedf4b645ad85d858a98e2f432762962803ac04e` separates business-facing model success observations from unchanged UI/SSE proposals. It changes only chat/action-contract and tests/validation, with no eligibility, auth, schema, history or final-answer rewriting. Final merge `090d08ee4823c041b1f835d4ac307e7963b6fb93` has verified tree `8de45731fe3b62456ed14a1c74ff5b449cdf8392`, equal to reviewed head `3f538e54`. Exact CI, independent activation review and release authorization remain required. Proposed isolated branch `ops/nestlet-schema9-observation-20261008`.

## Preservation and release sequence

1. Verify predecessor source/image/health/schema9, managed directories, private volume, host identity and exclusive lease. Compare auth, session storage, schema storage, consent, email, review/audit, backup/restore, Compose and Dockerfile bytes between releases before build/downtime. Keep credentials and environment bytes unchanged except literal image tag.
2. Build and run isolated fresh-schema9 smoke with no credentials/providers. Require exact compiled UI path/MIME/body and anonymous boundaries.
3. Stop only Nestlet, create private SQLite-API backup including originals and verify with both CLIs. Create another snapshot via backup API, not restore, for preservation rehearsal. This retains all session and library-permission rows.
4. Candidate storage startup must preserve every schema object and row including sessions, permissions, review receipts and sequences, and repeat-open bytes. Test predecessor startup on the separate session-preserving copy with unchanged bytes. Schema10 must fail closed on another copy.
5. Independently backup/restore the rehearsal copy. Backup must retain all rows before and after restore. Only the NEW restored copy empties auth_sessions/library_permissions; every other row and all DDL/assets remain exact. Never use that restored copy as live deployment storage.
6. Reverify recovery evidence, update literal tag, recreate only Nestlet with the pinned image on the original existing volume, check health/schema9/hardening and atomically switch the pointer. Check public assets against exact final build.

This is an application replacement, not a migration or restore. Existing valid ordinary and owner sessions, CSRF tokens and remembered permission choices must survive with the same credentials; expiry/revocation remains unchanged. No blanket relogin requirement should be introduced. Do not touch the logged-in cloud browser until the parent coordinates any acceptance check.

## Evidence and failure behavior

DELETE/WAL fixtures create owner and ordinary sessions plus allow/deny choices using the old runtime before backup, verify preservation and valid CSRF after candidate reopen, test newly created sessions too and confirm restore-only invalidation. Existing verified review receipts, email states, grants/audit, originals and business rows remain intact. Expired-telemetry fixtures fail closed with original and recovery snapshot unchanged.

No automatic rollback, restore, downgrade, data cleanup, grant mutation or provider calls. A stopped-service failure retains evidence and requires reviewed forward repair or separately authorized recovery. Same-host snapshots are not off-host disaster recovery.
