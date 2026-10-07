# Nestlet schema4 → schema5 email release review

Prepared and reviewed 2026-10-07. The maintenance branch is approved for publication with the exact green merge pin below. Dispatch remains a separate parent-owned step. This task has not dispatched, read production configuration, or accessed production data.

## Bounded release and remaining gates

- Exact live predecessor: `c540c89862bbd4c5534b09e083f1db03de36eaac`, schema4
- Initial backend source used for these synthetic drills: `a179fbf19e466bd549f1b36b2fb89dcc08416feb`
- Combined application candidate rechecked with the same recovery and HTTP gates: PR21 head `0e329d0705511b856180de56fc1863330a95be79`. This is a development head, not a production pin
- Final pinned target: `73255d90826e4934b1f0f489d3ed836e076096ed`, the combined PR21 merge commit. The exact merge application/test, browser and container CI are all green. The script refuses every other SHA; a development head, another schema4 build, or a similarly named branch is not an approved substitute
- Dedicated maintenance branch: `ops/nestlet-schema5-email-release-20261007`, in Jiesong's maintenance repository only. Do not merge this maintenance workflow into Jiesong main
- One release directly from live schema4 to the final combined schema5 application. Do not deploy the intermediate same-schema4 addon release first
- Existing repository/owner/actor/branch, dispatch-operation, selected-host address and optional independently verified host-key checks remain unchanged in meaning. Supplied host-key mismatches fail closed; no relaxed retry. Existing staging environment, `nestlet-stage` workflow concurrency and host maintenance lock remain in force
- Owner confirmation and independent final review are required before publication/dispatch. The script SHA256 in the workflow must be updated whenever the script or release pin changes

The previous same-schema4 and schema3-to-schema4 scripts are historical. This workflow invokes only `scripts/nestlet-upgrade-schema5.sh`. No Jiesong runtime, main branch, PM2 process, ingress, certificate, unrelated Docker service or data volume is modified.

## Configuration and capability boundary

The user reports that private DirectMail configuration has already been supplied. That is setup context, not delivery evidence. This release does not retrieve credentials or copy Jiesong configuration. It changes only the existing `NESTLET_IMAGE_TAG` declaration and, after successful verification, the current-release pointer. The atomic environment helper preserves all other bytes, quoting, literal dollar signs and line endings. It rejects duplicates, unknown tags, links, non-private modes, oversized files and concurrent changes.

Compose receives credentials only through the existing private environment file. Ambient shell operator/provider/mail variables are explicitly removed before Compose interpolation so they cannot silently override that file. The four mail mappings are `ALIBABA_CLOUD_ACCESS_KEY_ID`, `ALIBABA_CLOUD_ACCESS_KEY_SECRET`, optional `ALIBABA_CLOUD_SECURITY_TOKEN`, and `NESTLET_EMAIL_FROM`; an absent optional token remains absent. No JWT secret is introduced or needed by this procedure.

The new live `/api/status` must show `emailDeliveryConfigured: true` and `registrationEnabled: true`, plus configured authentication and enabled case/library storage. This proves configuration recognition, not provider acceptance or inbox delivery. Unauthenticated status must omit account email/recovery details and owner-only delivery diagnostics. Unauthenticated email binding must return 401 without sending mail. A fresh isolated no-credential smoke must instead honestly show both email capabilities disabled.

Process recreation invalidates existing in-memory sign-in sessions and discards RAM-only AI settings; preserved server configuration reloads normally. Users may need to sign in again. Saved account credentials and all database/original-file data remain in place. Real registration, verification, legacy email binding and password-reset mail/browser acceptance remain a separate controlled post-release test.

## Host rollout gates

1. Require exact predecessor/current pointer, clean exact-source checkout, existing healthy Nestlet container, image-tag/image-ID agreement, loopback-only port, read-only root filesystem, private schema4 SQLite identity and the dedicated volume's existing ownership labels
2. Validate both Compose configurations contain only the single Nestlet service, with the same private volume and hardening. Record the exact previous image ID; build only the approved candidate and retain its immutable image ID
3. Start the real new image against temporary synthetic storage, no credentials, no network or host port. Require schema5, health, helper/module availability, no auth bypass and honestly disabled mail/enrollment
4. Size the source using metadata only. Require capacity for four dataset copies plus 2 GiB headroom before downtime. Create a unique private local recovery directory; never overwrite or clean up existing recovery evidence
5. Stop only Nestlet, verify the stopped live database is still schema4 with the correct application identity, full integrity and foreign keys. Back up through the candidate's existing SQLite backup API, including committed WAL data, with the live volume mounted read-only. Back up referenced immutable originals, then independently verify the recovery point
6. Restore to a distinct rehearsal directory. Run actual candidate `openStorage` on that copy and require version 5, identity, full integrity, zero FK errors, exact preservation of every prior DDL object and prior table row (including password hashes and `sqlite_sequence`), only reviewed additive email objects, empty new email tables, unchanged bytes on repeat-open, and readable original files matching the verified manifest
7. Restore a second distinct copy. Mark only that disposable copy as future schema6/WAL and require the candidate to reject it without changing persistent database bytes, journal mode or directory contents. No rehearsal receives the live volume
8. Independently reverify the original schema4 recovery point. Check that the candidate image tag still resolves to the exact built image. Atomically change the image tag, mark candidate-start attempted, and recreate only Nestlet with `--no-deps --no-build --pull never` on the existing volume
9. Require container health, public unauthenticated boundaries, configured mail/enrollment capability, helper availability, private mount and exact schema5. Advance the current pointer only after these checks pass

A healthy intended candidate left behind by an interrupted connection can be verified and have its pointer completed, without recreation. Any unknown release, schema, image or malformed environment assignment stops.

## Failure and recovery policy

There is **no automatic live database restore, downgrade or original-file replacement**. No volume removal/prune or unrelated restart is permitted.

Before any candidate start is attempted, a backup/rehearsal interruption may resume only the exact captured schema4 predecessor image, and only after Nestlet is stopped and live storage independently verifies as intact schema4. Failure to stop, a changed image, unknown schema or failed integrity check forbids this recovery.

Once any candidate start is attempted, the old schema4 binary is never restarted automatically, even if `user_version` happens to remain 4. On error the script stops only Nestlet and retains live data and all private recovery evidence for forward repair or a separately approved manual recovery plan. A schema5 database must never be opened by the schema4 predecessor. Uncatchable process/host interruption can require operator review; do not guess a destructive recovery or use the historical same-schema script.

Schema5 snapshots include credential hashes, email identities, pending actions and durable rate-limit state. Restoring an older snapshot can restore old passwords and revive an unexpired reset/verification token already consumed after the snapshot. An independently tested synthetic drill confirmed this hazard. Any manual disaster recovery must explicitly assess lost writes, credentials, outstanding email links/actions, quotas, original files and session invalidation; an old snapshot is not automatically security-current.

Recovery snapshots/manifests, migration copies, future-version copies and operation logs are Restricted. Directories are 0700 and files 0600. They remain local-only and must not be printed or uploaded. Comparison hashes and rows stay inside the private helper; no record contents, identifiers, original filenames or credentials are emitted by the maintenance procedure. Same-server recovery is not protection from server or disk loss.

## Local verification evidence

Independent read-only review of maintenance commit `61a157bf962ae7f4f8d5f64bdd13ad3fd2fdec6f` found no confirmed P0/P1. The reviewer independently reran all 12 safety tests and both exact embedded recovery/HTTP drills against c540 and combined application `0e329d0705511b856180de56fc1863330a95be79`; all passed. This does not waive final merged-SHA CI, owner approval or actual host/container gates.

- `python3 scripts/test-nestlet-upgrade-schema5.py`: 12/12 passed on 2026-10-07. Actual YAML parsing/dispatch-only scope, workflow script digest, shell/Python/JavaScript syntax, disabled-pin refusal, Compose boundary/ambient credential guards, atomic tag-only byte preservation and unsafe-file rejection, pre-candidate recovery and unconditional refusal of old-image restart after candidate-start, unknown schema, failed stop or changed image
- `node scripts/test-nestlet-schema5-recovery.mjs <c540-source-root> <candidate-source-root>`: passed on Node 24.19.0 against both backend a179 and combined PR21 0e329d0. Actual c540 storage produced schema4 with two owners' customers, cases, conversations, messages, artifacts and originals, legacy credentials, telemetry and sequence high-water 777
- Actual CLI DELETE-mode and committed live-WAL backup→verify→restore, the exact embedded deployment migration and future-refusal JavaScript, late-DDL transactional failure, preserved private modes/original bytes, unchanged recovery point, and schema4 binary refusal of schema5 all passed
- `node scripts/test-nestlet-schema5-http.mjs <candidate-source-root>`: passed against both a179 and combined PR21 0e329d0 using the exact embedded release HTTP gate against the real local server with synthetic operator/mail settings. Confirms configured public flags, 401 boundaries and absent private account/owner diagnostics without any email send
- The local backup drill makes no provider calls and uses no production data. Synthetic test artifacts are removed after the drill; this does not imply production evidence cleanup
- Docker is unavailable in this preparation executor. Container build/isolation, actual SSH/host storage, real private backup/cutover and real email delivery are **not run here**. The host script makes fresh-image smoke and backup/rehearsal mandatory, and the exact final merged application requires green container/browser/application CI before pinning
- Rerun all three commands against the final combined release before pinning. This evidence is preparation for a reviewed release, not a production or real-email acceptance pass

## Final merged-release gate (2026-10-07)

The exact merged tree `73255d90826e4934b1f0f489d3ed836e076096ed` is byte-identical to the independently reviewed PR21 head. All three checks on this exact merge completed successfully:

- Application/test: https://github.com/ledondev520/nestlet/actions/runs/37625744734/job/112806918122
- Browser: https://github.com/ledondev520/nestlet/actions/runs/37625744690/job/112806918451
- Container: https://github.com/ledondev520/nestlet/actions/runs/37625744735/job/112806918455

After pinning the merge SHA and updating the workflow's script digest, all 13 safety tests and the exact embedded recovery/HTTP drills were rerun against a separate clean exact-merge source checkout and passed. No provider email was sent. Publication is restricted to the dedicated maintenance branch; the parent owns dispatch with operation `upgrade`, this exact `release_sha`, and the already verified host-address digest/host-key policy. No new host value is inferred or substituted.

## Read-only identity inspection

The first upgrade attempt (run 37626659704) refused the literal current-release pointer before any Docker command, service stop, configuration change or migration. The unchanged upgrade guard must not be bypassed. The dedicated workflow adds operation `inspect-release`, with the same repository/owner/actor/branch, selected-host, strict host-key, staging and workflow concurrency guards.

The diagnostic requires the existing private maintenance lock through a read-only descriptor and shared nonblocking lease. It verifies the canonical release is an owned managed release with exact clean Git identity, checks only the dedicated Nestlet container/volume, and emits canonical commit, relative/absolute pointer form, image agreement, schema/application metadata and health. No environment, application rows, credentials, container IDs, image digests or private paths are emitted. No host file, service or data is modified. SQLite is never opened: only a stable 100-byte rollback-mode header is inspected, with WAL/journal/racing or unreadable state explicitly unknown.

Seven synthetic diagnostic tests cover absolute/relative pointers, image mismatch, stopped/unhealthy state, unknown metadata, scope/volume/lock failures, actual SQLite header non-mutation including future-version/WAL handling, parsed workflow guards, and byte-identical unchanged upgrade script. All 13 release-safety tests also pass. Actual host execution remains a subsequent parent-owned read-only dispatch.

The diagnostic now includes safe failed-stage enums and previously validated partial fields when a later check refuses. Source pointer/canonical Git metadata is checked before opening the existing maintenance lease, so a missing lease cannot hide already verified source identity. A partial receipt has `inspectionComplete: false`, never authorizes an upgrade, and never includes dirty filenames or private paths. Eight diagnostic tests and all 13 release tests pass. The upgrade script is unchanged.
