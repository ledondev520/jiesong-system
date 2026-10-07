# Nestlet schema5→6 exact-merge release review

## Reviewed target and dispatch boundary

Prepared from published maintenance base `56b024cfd56c590d24bb54e31c54b10434dbb4c0`. The previously reviewed source package was restored from its Library recovery ZIP; its SHA256 was verified as `8869a04efccce2be3b24148bccec844c1b12391f3c9b53254f996debc4210669`, and all nine restored source files matched its manifest before this activation diff.

- Fixed live predecessor: `5335312fd53becaad4bfccace5c1f3e39c6bf4f2`, schema5
- Fixed authorized merged target: `0ad91847e8c04f379f071e76bf8c325f9bb12233`, schema6
- Verified target tree: `dc0fd24caca7dbf5f8713ba6a6ad54851c03a877`, identical to reviewed03ae27f
- Dedicated new maintenance branch: `ops/nestlet-schema6-release-20261008`
- Registered dispatch path: `.github/workflows/deploy.yml` on that new branch only

Explicit PR26 release authorization and green exact-merge CI were confirmed before replacing both target pins. Read-only GitHub checks independently returned completed/success for [application checks37700251939](https://github.com/ledondev520/nestlet/actions/runs/37700251939), [browser37700251919](https://github.com/ledondev520/nestlet/actions/runs/37700251919) and [container37700251920](https://github.com/ledondev520/nestlet/actions/runs/37700251920), all on the target SHA. The dispatch job checks repository/owner/actor/new-branch identity; the workflow checks the exact target before host resolution and verifies the helper digest before SSH.

Do not change the existing schema5 maintenance branch or Jiesong main. The new branch replaces only its own registered deploy.yml with the single-purpose schema6 workflow; it carries no legacy mail/stream/predecessor operations. It keeps the same nestlet-stage concurrency group and host maintenance lease. This source preparation does not claim that the release has run. Root owns final publication/review/dispatch. No account grants or provider requests are part of this helper.

## Upgrade sequence

1. Verify normal clean exact-SHA Git identities, existing healthy pinned533 image, private schema5 mount and Nestlet-only Compose scope. No archive proof exception
2. Preserve the robust literal-tag parser, exact lease check and private fsynced previous-tag receipt. Only verified533 can reconcile a stale literal tag; every unrelated configuration byte stays unchanged and ambient mail/provider variables cannot override the private configuration
3. Build exact target source, pin both immutable image IDs, and pass a no-network fresh-schema6 smoke. Import capability modules, require empty capability/audit tables and deny unauthenticated administrator/account/audit/diagnostic routes
4. Check space before downtime; stop only Nestlet. Use SQLite backup API plus referenced originals for a private schema5 recovery point. Verify it with both candidate and predecessor CLIs
5. Restore a separate drill and migrate5→6. Compare every preexisting schema object and table digest, including populated email identities/actions/rate buckets and sequence high-water marks. Permit exactly the two capability tables, two implicit indexes and two audit immutability triggers. Migration grants nobody access; reopening must be unchanged
6. Prove future7 refusal on another copy. Back up migrated6, restore separately, compare complete schema/rows and original bytes, then require old5 to refuse restored6 unchanged. Reverify the untouched pre5 snapshot
7. Only after all checks pass: change image-tag value, mark candidate start attempted, recreate only Nestlet, check image/health/email flags/authentication boundaries/schema6/modules, then update the current pointer

Private rows, hashes, credential fingerprints, original paths, manifest contents and detailed failures stay in host-local recovery evidence. Required space accounts for all five recovery/drill copies plus spare capacity. No real credentials or runtime.env contents were read during source preparation.

## Failure and recovery policy

Before candidate start, failure can resume only the same verified533 image when stopped storage is independently intact at schema5. After any candidate start attempt, never automatically restart schema5, even if user_version remains5. Keep live data, originals and recovery copies for forward repair or separately authorized recovery.

Old5 cannot consume schema6 databases/snapshots. Never lower user_version, modify users.role, remove volumes or restore live data automatically. Manual snapshot recovery can revive old passwords, email actions and grants and requires separate data-loss/security review. Same-server copies do not establish off-host disaster recovery.

Already-healthy target and interrupted-pointer paths verify exact image, schema, modules and boundaries before completing a pointer, without unnecessary recreation.

## Supported-state limitation

Normal openStorage() performs startup telemetry retention after migration. If it changes telemetry older than30 days, the strict all-old-rows rehearsal refuses before live candidate start, after downtime begins. This is not evidence that current live data contains such records.

The expired-telemetry negative fixture proves safe refusal while preserving original DELETE/WAL source and pre5 snapshot. Proceed only when the actual rehearsal passes. Do not alter time, relax preservation, or add an unreviewed application maintenance flag to get around refusal; a future migration-only path is a separate change.

## Exact-code local evidence

Revalidated against actual merged0ad9184 and historical533 source:
- 18 schema6 safety tests covering exact pins, dispatch scope, syntax, normal Git identity, Compose isolation, tag/lease checks, failure guards and rehearsal ordering
- 18 original schema5 safety tests run separately on the unchanged56b024c base
- Exact embedded migration/recovery code on DELETE and committed-WAL fixtures: populated email records, every old row/schema/sequence and original preserved, schema6 capability/audit round-trip, future7 and predecessor5 refusal, late-DDL rollback
- Expired-telemetry negative fixture: expected safe refusal with unchanged source/snapshot
- Exact fresh-smoke and configured HTTP gates on disposable local servers, with module imports and protected administrator endpoints

Synthetic grant/revoke/grant happens only inside a disposable test copy, after proving the migration itself creates no grants. Application dependencies were installed from the official lockfile with npm ci --ignore-scripts. No real mail/model call, Docker/SSH/host operation or production mutation was performed by this source task.

```sh
python3 scripts/test-nestlet-upgrade-schema6.py
node scripts/test-nestlet-schema6-recovery.mjs /path/to/exact-533-checkout /path/to/exact-0ad-checkout
node scripts/test-nestlet-schema6-recovery.mjs /path/to/exact-533-checkout /path/to/exact-0ad-checkout --expired-telemetry
node scripts/test-nestlet-schema6-http.mjs /path/to/exact-0ad-checkout
```

Actual maintenance-container/host rehearsal remains a release gate executed by the bounded helper. Source/loopback tests alone are not evidence that production deployment completed.
