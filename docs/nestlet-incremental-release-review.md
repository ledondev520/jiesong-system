# Nestlet incremental release review

Prepared 2026-10-07. Not dispatched, not approved for publication, and not evidence that the new application is deployed.

## Scope and release gate

The dedicated maintenance workflow targets only Nestlet. It inherits the existing authorized staging transport, address-match gate and SSH-host-key policy. No Jiesong application, database, process, ingress or certificate change is included. The prior stateless-first-persistence script must not be used for this upgrade.

The deployed predecessor is `2fc15f216714d0331a82456edb1d97b9f76f8498`, schema3. The candidate must include the final reviewed React/runtime packaging and the private-data helper's schema3 snapshot support. A final exact source SHA is deliberately unset in the new script: it cannot run until review replaces the placeholder and updates the workflow's script digest. Required Node and actual container CI must pass for that exact release. Review and pin the maintenance branch's own commit before manual dispatch.

The source digest is verified before remote execution. An immutable image ID is captured after build; the fresh-image test and private helpers use it directly, and the tag must still match it immediately before service recreation. The Compose project must have exactly one Nestlet service, its existing dedicated local volume, loopback-only published port, read-only root filesystem and least-privilege controls.

## Ordered safety gates

1. Verify predecessor/current pointer, image identity/health, private database file ownership/modes, SQLite identity/version, existing volume ownership and Compose scope. Reject any unexpected state. Serialize incremental runs. Concurrent operator-setup or other environment writers are unsupported and must be excluded during the release window.
2. Build the exact reviewed source and run a network-isolated, credential-free container on a fresh temporary database. Verify real runtime startup, schema4, helper imports and fail-closed unauthenticated endpoints. Never mount live storage into this smoke test.
3. Stop only Nestlet. Take a SQLite backup-API snapshot from the existing data volume through a read-only mount into a new private local recovery directory. This avoids an unsafe copy of a live SQLite file and correctly includes committed journal/WAL state. The helper preserves schema3 and does not migrate the source. Independently verify integrity, foreign keys, digest and manifest.
4. Restore that verified snapshot into a different new directory and run the candidate's actual migration there. Verify schema4, integrity and foreign keys, then reverify the untouched schema3 recovery point. No source/recovery overwrite is allowed.
5. Change only the image-tag line in existing private configuration, recreate only Nestlet with the same data volume, verify health/unauthenticated boundaries/private schema4 storage, then advance the release pointer.
6. Perform separately authorized authenticated browser acceptance after cutover. Use existing accounts without collecting credentials; verify saved customers/cases/history, original-file ownership/search and downloads. Synthetic local/container checks do not establish those production acceptance results.

## Failure and recovery

Schema4 adds the assets structures transactionally; application tests must establish legacy-record preservation. Nevertheless, the old schema3 binary deliberately rejects schema4. Merely reverting its image cannot recover service after migration.

Before any live migration, a failed check may restart the verified predecessor on the still-schema3 live volume. The failure handler first stops Nestlet and verifies the on-disk schema to prevent a partly started process racing that decision. A migrated, unknown or corrupt schema prevents old-binary restart. Preserve the live dataset, originals, recovery point and rehearsal copy; do not automatically restore, rewrite schema version, delete data, remove/prune volumes or start a stateless predecessor.

After a schema4 failure, use a reviewed schema4-compatible forward repair. Choosing the earlier schema3 snapshot would lose later writes and needs explicit approval, a distinct restored data location, exact schema-compatible release, verified account/data acceptance and a separate cutover plan. This draft does not perform that recovery. An uncatchable process/host interruption may leave Nestlet stopped and needs operator review; reruns fail closed rather than guessing.

Backups remain on the same server, private and local-only. They do not protect against host/disk loss. Do not publish paths, host/user identity, environment contents, record IDs, hashes or snapshot manifests. No automatic rotation, pruning or off-host transfer is configured. Application sessions and RAM-only settings are process-local; persistence of server-provided configuration must not be confused with persistence of browser-entered RAM-only settings.

## Verification evidence and limitations

Local maintenance safety tests pass 8/8: Bash syntax, embedded Python/JavaScript compilation, workflow/script digest, draft-pin rejection, Compose scope rejection, atomic tag-only update/recovery, still-schema3 recovery, schema4/unknown refusal, and stop-failure refusal. Run `python3 scripts/test-nestlet-upgrade-schema4.py`.

A separate actual CLI drill against assets commit `da9be2d16f970ea12e4ee349ce84f647d6c224a1` passed with genuine synthetic schema3 SQLite: backup, verify, restore, missing source assets directory, restored `nestlet.sqlite` filename, private modes, actual schema4 migration on the restored copy, preserved legacy case version, unchanged source bytes and unchanged schema3 recovery point. A separate live-WAL drill with autocheckpoint disabled currently fails closed: snapshot sidecars conflict with the strict snapshot inventory. A destination-only journal normalization fix and regression are required before release; do not claim WAL recovery acceptance yet. No source credentials or private records were used. No production command has been run. Docker is not installed in this preparation executor, so actual image build, container gates, real host permissions, SSH execution and production backup/migration have not run here. Those are mandatory future gates, not assumed passes.

The repo's requested ByteRover lookup was attempted, but its CLI is absent. No provider was installed/configured and no private operational material was persisted in engineering memory.
