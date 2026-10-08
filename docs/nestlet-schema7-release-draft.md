# Nestlet schema6 → schema7 activation preparation

This is a locally pinned activation patch only. No operations branch has been published and no deployment has been dispatched. Publication/dispatch require exact-source CI, independent activation review and explicit release authorization.

## Source and prerequisites

- Verified running predecessor: `2e1354ef591975160885d9461910bf00f67742e8`, schema6.
- Previous successful reviewed channel: operations commit `a1ac68c7ad5533303f34f1bd4f08d9f08a459671`, run `37707533008`.
- Final merge pin: `05923a88156d8d2d1c497d22c3ef56414452d063`; its tree `f08017034bdd77e92af8667ff5ef253546efd9b8` exactly equals reviewed candidate `aafbfb0b0a399c09d0fc889687fa012e424608a5`. Final-SHA recovery fixtures are mandatory.
- Before publication: final source identity, exact-source application/frontend/browser/container CI, independent integration review and independent helper review. Repeat rehearsals on the final SHA if changed. Helper target, workflow target, final-SHA fixture and helper digest are pinned together for activation review. The local workflow false gate has been removed; remote publication is still held. Proposed dedicated branch: `ops/nestlet-schema7-release-20261008`.

## Bounded release sequence

1. Keep the existing target-address hash and existing SSH trust channel, Nestlet-only Compose scope, hardened container, private persistent volume and shared maintenance lock. No secrets or private recovery output may leave the host.
2. Verify exact clean predecessor Git tree/image/schema6, current pointer, environment tag and health. Build final candidate from a clean exact-SHA checkout, then run isolated tmpfs schema7 smoke with live AI disabled and no credentials/network.
3. Require root HTML to reference exactly `/next/app.js`; verify HTTP200, JavaScript MIME and nonblank body. Check fresh schema7, empty capabilities/audit/intents, helpers, and anonymous API refusal.
4. Stop only Nestlet. Use SQLite backup API for existing DB/WAL plus referenced originals. Verify private pre6 recovery independently with candidate and predecessor CLIs. Never overwrite an existing recovery point.
5. Restore to a separate copy; migrate6→7 and require every prior DDL object and every row (including telemetry and sqlite_sequence) preserved. Allow only exact review-intent DDL from the candidate schema definition. Require empty new intent table, integrity/FK checks, repeat-open byte stability and original-file integrity.
6. Backup migrated schema7 copy and restore again. Require exact DDL/row equality and verified originals. Prove schema6 predecessor rejects schema7 without byte/file changes; prove candidate rejects future8 likewise.
7. Reverify untouched pre6 recovery. Change only the literal image-tag value; recreate only Nestlet with the verified immutable candidate image, check health/auth boundaries/hardening/private schema7 mount, then atomically update the current pointer.
8. Check public health/status and compare public compiled UI bytes to the final exact-source build. Ordinary sessions are in-memory; users need to sign in again. Do not claim live authenticated workflows or real delivery without their separate acceptance.

## Failure and recovery

All failures retain production data, originals and private evidence. There is no automatic runtime fallback, restore, downgrade, volume deletion or unrelated-service restart. A failure after stopping Nestlet leaves recovery for an explicitly reviewed forward repair or separate manual plan. Never attach schema7 data to schema6. Same-host recovery is not off-host disaster recovery.

Strict old-row preservation can refuse when startup expiration removes old telemetry. Offline expired-telemetry tests demonstrate safe refusal, not migration compatibility for aged rows. Do not weaken the check or clean production rows to force acceptance.

## Local evidence

- Ten safety tests cover disabled dispatch, SHA/actor/host gates, literal-only environment edits, service scope, all-copy recovery and exact compiled-UI assertions.
- Synthetic DELETE and WAL tests populate original assets, users/password hashes, email states, administrator grants/audit, conversations/artifacts, telemetry and sqlite_sequence. They execute actual embedded migration and recovery code, then verify restored pending/applied/cancelled/undone review intents and idempotent receipt replay.
- Future8 and predecessor6 rejection are byte/file invariant. Expired-telemetry fixture preserves original source and recovery snapshot while refusing migration.
- No provider tests, account creation, production reads beyond the existing metadata gates, or remote mutations are part of this preparation.
