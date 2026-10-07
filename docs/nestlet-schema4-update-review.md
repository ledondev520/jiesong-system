# Nestlet same-schema4 release review

Prepared 2026-10-07. Local preparation only: no push, dispatch or production access in this task.

## Bounded release

- Deployed predecessor: `c540c89862bbd4c5534b09e083f1db03de36eaac`
- Reviewed addon source for this preparation: PR16 head `8c167bf5dc0ba9ef72aba5f6434a6e6285afd993`
- Target release pin: deliberately unset; the script exits before host access until the root reviewer selects the final merged, exact-main, CI-green SHA
- Dedicated maintenance branch: `ops/nestlet-schema4-update-20261007`
- Existing staging SSH/address/host-key guards, Nestlet workflow concurrency and host maintenance lock remain in force. No Jiesong service, ingress or certificate action is included. Exclude operator setup and other configuration writers during the release lease

The original schema3-to-schema4 script is historical and must not be reused for this wave. The workflow now invokes `scripts/nestlet-update-schema4.sh` and verifies its digest. Actual YAML parsing with the workflow_dispatch trigger assertion is mandatory, along with Bash and embedded-language checks.

## Storage and API compatibility review

The addon changes read-only library retrieval, explicit per-turn consent, source presentation and existing telemetry use. Against the deployed release, the persistence, validation, authentication, asset and private-backup modules are byte-identical. A mandatory source gate checks twelve files, including storage, private originals, backup helpers, authentication and persisted-payload validators. Any difference stops this bounded rollout even if both releases advertise schema4.

New source references are a plain-text appendix in the existing assistant-message content field. Message roles/states, identifiers, account records, case/customer versions, asset metadata/paths and schema remain unchanged. The addon uses existing storage APIs and their existing limits. The local drill actually invokes the new consented read tools and source formatter against synthetic records, saves the resulting assistant text, and reads it through the old runtime.

An older server explicitly rejects a newer open tab's `libraryConsent:true` payload. If rollback is needed, users must refresh the tab; there is no silent fallback that treats a consented retrieval request as ordinary chat. Normal requests omit the field when false, and both old and new resources use no-store responses.

## Deployment and private recovery gates

1. Verify exact predecessor/source/image/current pointer, healthy private schema4 volume, ownership, modes and Compose scope
2. Verify identical persisted contract and retain the exact old image ID. Build only the reviewed candidate; test its real startup on a temporary database with no network or credentials. Require the new retrieval module and public capability flag
3. Size private recovery storage using file metadata only. Require room for multiple dataset copies plus headroom before stopping the service
4. Stop only Nestlet. Use the candidate's existing SQLite backup API, with its bounded 5-second native read-lock wait and WAL-safe destination finalization. The source volume is mounted read-only. Back up the database and referenced immutable originals to a unique private local recovery point; independently verify it
5. Restore to a distinct new rehearsal directory. Open that copy with the candidate and then the exact old runtime. Both must retain schema4, schema identity, integrity/foreign keys and every database byte. Validate original-file bytes against the verified inventory. The rehearsal has no live data mount
6. Reverify the untouched recovery point. Change only the approved image-tag line through the existing compare-and-atomic-replace helper; preserve every other configuration byte. Recreate only Nestlet on the existing volume, with no dependency recreation, build or pull during cutover
7. Require healthy same-volume schema4, authentication still configured, unauthenticated isolation and the new retrieval capability. Advance the current pointer only after all checks pass

Same-server recovery copies are not protection against server/disk loss. They remain private and local-only. Never publish snapshot paths, manifests, record/asset identifiers, original filenames, environment values or hashes. No retention cleanup or off-host transfer is added.

## Failure behavior

The failure handler stops only Nestlet before inspecting live storage. Old-image recovery is allowed only when the stopped live database is verified schema4 with integrity and foreign-key checks, the persisted-contract gate passed and the old image ID is unchanged. If the candidate ever started, the candidate→prior-runtime rehearsal must also have passed. The exact source contract is checked again before recovery.

Failures before any candidate start may resume the previously verified compatible old runtime on the unchanged live dataset. Later failures may resume it only under all compatibility gates. In both cases the live database and originals remain in place, including any newly committed records. Nothing is restored from a backup, no database version is rewritten, and no asset/volume is deleted. Unknown schema, changed source/image or unverified compatibility leaves data untouched for forward repair or a separately approved recovery plan. An uncatchable host/process interruption may require manual review rather than a guessed retry.

Only the release image-tag line and current pointer change. Account/provider/security settings remain intact. Process recreation invalidates sessions and discards RAM-only settings; server-provided settings reload from the same private configuration.

## Verification evidence

- `python3 scripts/test-nestlet-update-schema4.py`: 10/10 passed. Covers actual YAML parsing and dispatch gating, script digest, Bash/embedded Python/JavaScript syntax, draft-pin rejection, Compose scope, atomic tag-only preservation, compatible schema4 recovery, and rejection of other schemas, failed stop, changed old image, unverified rehearsal or changed persistence code
- `node scripts/test-nestlet-schema4-recovery.mjs <old-source-root> <candidate-source-root>`: passed on Node 24.21.0 with the exact predecessor and addon SHA above
- The actual cross-version drill preserves database bytes during candidate/old reopening, executes new owned library reads, saves citations using the current formatter, and proves the old runtime can read their exact content and identifiers
- Actual DELETE-mode and live committed-WAL CLI backup→verify→restore passed with database/original bytes, case versions and private modes preserved. The exact deployment rehearsal JavaScript also ran against both source roots on those private synthetic restored copies
- No provider request or real account/data was used. Docker is unavailable in this preparation executor, so container isolation/build and actual SSH/production backup/cutover remain future gates. Exact final-main CI and parent review remain mandatory
