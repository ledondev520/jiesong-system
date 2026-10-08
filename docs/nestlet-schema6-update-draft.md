# Same-schema6 update: reviewed release preparation

The user authorized PR28 merge and release through the existing maintenance channel.
The exact merge passed application checks (one bounded retry after an ephemeral
port collision), browser and container CI. Independent review and synthetic
compatibility passed. Publication and dispatch still require final coordinator clearance.
The historical schema5→6 helper is unchanged. The new helper and workflow pin one
exact merge and one new maintenance branch; arbitrary targets fail before host access.

## Evidence

Pinned predecessor: `0ad91847e8c04f379f071e76bf8c325f9bb12233`.
Tested final PR28 merge: `2e1354ef591975160885d9461910bf00f67742e8`.
Its source tree is identical to reviewed PR head `9c7cd55ae92edc9730ef91b508c9f715f9c41e90`.
Both normal and negative recovery fixtures were independently rerun on the actual merge.

Local synthetic verification covers DELETE and committed WAL, both backup CLIs,
private backup/restore modes, originals, exact schema/row/high-water preservation,
populated email data and capability/audit history, future7 refusal, and exact
predecessor reads of candidate-created unreviewed answer drafts and explicitly
applied unconfirmed facts/context with source provenance. Expired telemetry
correctly fails the strict unchanged-row gate while preserving source/recovery.
The handler used for applying suggestions is real; transport is a local stub.
These tests do not establish browser/provider behavior or production readiness.

Nine local safety tests cover exact source/workflow pins and unreviewed-input refusal, syntax, actor/repository/
branch/host gates, shared concurrency and exclusive lease, Compose scope,
ambient-credential rejection, literal-tag-only editing and failure behavior.

## Activation prerequisites

1. Obtain explicit authorization for this new release and its downtime/failure policy.
2. Resolve the final merge SHA and inspect the exact merged source. Require green
   application, browser and container checks for that SHA; rerun the fixture after
   deliberately replacing its candidate assertion with the reviewed merge SHA.
3. Review helper and workflow in one new dedicated maintenance branch, never
   Jiesong main or an existing schema5/schema6 release branch. Pin target and branch,
   recompute the helper checksum, remove the false gate only after approval, and
   rerun actual YAML parsing, shell/embedded-language checks and all safety tests.
4. Use the existing authorized transport and verified host identity inputs. No
   server/private evidence is included here. Build only the exact clean source,
   pin immutable image IDs, perform isolated smoke and all copy rehearsals before
   starting the candidate on the existing dedicated volume.
5. Verify exact running image, pointer, loopback health, unauthenticated boundaries,
   private schema/mount metadata and separately approved authenticated acceptance.

## Failure policy

After maintenance begins, failure stops only Nestlet and retains all original
assets, live data and private recovery evidence. No automatic old-runtime restart,
database restore, downgrade or cleanup is implemented, even before candidate start.
An operator must review the failure; any runtime fallback or snapshot recovery
needs separate explicit authorization and renewed integrity/compatibility proof.
Same schema and successful synthetic reads alone do not authorize fallback.
Snapshot recovery can lose newer writes or revive passwords/grants/email actions.

## Local commands

Run from this maintenance checkout, using clean local source roots:

    python3 scripts/test-nestlet-update-schema6.py
    node scripts/test-nestlet-update-schema6-recovery.mjs OLD_SOURCE CANDIDATE_SOURCE
    node scripts/test-nestlet-update-schema6-recovery.mjs OLD_SOURCE CANDIDATE_SOURCE --expired-telemetry

The original upgrade test's workflow assertions refer to its historical branch;
this draft's dedicated safety suite checks the replacement maintenance workflow.
No Docker/server/SSH/provider operation was executed in preparation. Local ByteRover
lookup was unavailable because its CLI is absent; no installation was attempted.
