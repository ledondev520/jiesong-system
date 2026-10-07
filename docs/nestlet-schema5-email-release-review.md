# Nestlet pinned schema4 → schema5 release

Local reviewed candidate, 2026-10-07. Publication and execution of this revision remain separate authorized steps. No production verification or rollout success is claimed by the local tests below.

## Exact bounded contract

- Permitted predecessor: `4d4c15315d80b5fb7e9f8c2f3f883b10c1121c40`, only after the pinned archive and runtime gates pass
- Permitted candidate: `5335312fd53becaad4bfccace5c1f3e39c6bf4f2`, the reviewed successor with unchanged storage/authentication/email contracts
- Dedicated maintenance branch: `ops/nestlet-schema5-email-release-20261007` in the existing maintenance repository. Never merge this workflow into Jiesong main
- One Nestlet service, its existing private data volume and private configuration. No Jiesong service, PM2 process, ingress, certificate or unrelated volume changes
- The earlier c540-based preparation is historical and is not this revision's predecessor contract

The exact candidate merge passed [application checks](https://github.com/ledondev520/nestlet/actions/runs/37645539766/job/112875202085), [browser checks](https://github.com/ledondev520/nestlet/actions/runs/37645539855/job/112875202133) and [container checks](https://github.com/ledondev520/nestlet/actions/runs/37645539713/job/112875199436). Its persistence/authentication/email contracts match the reviewed PR21 baseline.

## Replacement archive proof

`nestlet-verify-archive.py` is embedded verbatim in the upgrade, except for its checked inherited-fd9 entrypoint. The predecessor exception is restricted to the one commit above; there is no arbitrary archive fallback. The candidate must still be a clean exact Git checkout from the expected repository.

The archive gate validates a digest-pinned manifest derived from the approved public Git tree: all 315 regular files and 29 directories. It enumerates the entire tree before reading file bytes, rejects every unexpected entry including `.git`, private `.env`, generated files, links, hardlinks and special files, and leaves them untouched. It compares every approved file's size, bytes and executable semantics while permitting private 077 umask modes and canonical Git tar group-write metadata only beneath the verified owned 0700 archive root with trusted UID/GID. Unsafe group-write ancestors outside that private root, world-write, special bits and untrusted ownership remain rejected. Descriptor-relative no-follow traversal, bounded reads, pre/post identities, a final inventory and a final root check reject swaps or concurrent changes. The managed marker uses a bounded private descriptor read. The current pointer remains the exact approved literal absolute path.

The runtime gate independently checks the existing container's exact commit tag and immutable image identity, health, command/user, read-only root, loopback port, privilege controls and dedicated-volume ownership. Unexpected tmpfs destinations are rejected. Canonical COPY group-write bits are accepted only after this read-only/no-overlay proof, with approved UID/GID and all other metadata and content guards retained. It compares all 31 literal source files copied by the approved Dockerfile inside the already-running container without importing application modules. It separately checks a stable, rollback-mode SQLite header for expected application identity and schema4.

This proves the specified archive and raw runtime source-copy inputs. Generated `public/next`, installed `node_modules`, OS packages and base-image bytes are outside that byte-equivalence claim. It is not full-image reproducibility. The later stopped-database integrity/foreign-key checks and actual migration rehearsal remain mandatory.

Both proof modes require the exact private maintenance lock. The embedded process duplicates and validates inherited fd9 and confirms the exclusive lease without releasing the caller's lock. Standalone local testing retains a noncreating shared lease. There is no unchecked skip-lock option.

## Output and configuration

The workflow exposes `upgrade` and standalone read-only `verify-predecessor`. The latter streams only the Python verifier and cannot build, stop, migrate, edit configuration or write data. The detailed inspection route remains removed. Failure output is limited to the fixed classes `environment-lease`, `archive-layout`, `archive-safe-mode`, `archive-content`, or `runtime-proof`; actual host hashes, filenames, private paths, individual identity fields, configuration values and data records are not printed. Child diagnostics are captured and suppressed. Hash comparison happens internally; masked log values are never reconstructed or treated as complete digests.

Only `NESTLET_IMAGE_TAG` changes in the existing environment file, using the existing atomic byte-preserving helper. All other bytes, quoting and line endings are preserved. Ambient operator/provider/mail variables cannot override the private file. The existing resolved-Compose scope gate requires the non-secret public origin to equal `https://nestlet.celerada.link` before any build, service stop or migration; it emits no configured value. No credential is retrieved, copied, rotated or introduced by this procedure.

The new public status must recognize configured email delivery and enrollment, retain configured authentication, and preserve unauthenticated boundaries without disclosing account or owner diagnostics. Configuration recognition is not provider acceptance or inbox delivery. Genuine registration, verification, legacy email binding and reset acceptance remain separate controlled checks. Restart invalidates in-memory sessions and RAM-only settings; preserved server configuration reloads normally.

## Rollout and failure gates

1. Preserve existing repository/owner/actor/branch, dispatch-operation, selected-host, strict SSH host-key, staging and concurrency guards
2. Verify the exact predecessor archive, runtime source-copy set, immutable image and private schema4 data before building or stopping anything
3. Build only the exact candidate and exercise the real image on temporary synthetic storage without credentials, network or host ports
4. Plan recovery capacity from metadata, then stop only Nestlet. Require stopped live schema4 identity, full SQLite integrity and foreign keys
5. Use the existing SQLite backup API, including committed WAL, with a read-only source mount. Back up referenced immutable originals to a unique private local recovery point and independently verify it
6. Restore to separate private copies. Run actual additive migration and future-version refusal, preserving every prior schema object, row, sequence high-water value and original byte. Reverify the untouched backup
7. Recheck candidate image identity, update only the image-tag line, mark candidate-start attempted, and recreate only Nestlet with no dependency recreation, rebuild or pull
8. Require health, public boundaries, configured email capability and exact private schema5; only then advance the current pointer

Before candidate-start, interruption recovery may resume only the captured exact predecessor image after verifying stopped intact schema4 and repeating the exact archive proof. Once candidate-start is attempted, no predecessor restart is permitted, even if the version happens to remain 4. Failures preserve live data and recovery evidence for forward repair or separately approved recovery.

There is no automatic live restore, downgrade, original replacement, volume removal or cleanup. Schema5 snapshots can restore old credentials or revive an unexpired consumed email action, so manual recovery requires an explicit credential/link/data-loss review. Private 0700/0600 recovery points stay on the server; they are not off-host disaster recovery.

## Local verification

- Archive/runtime verifier: 25 tests passed, covering complete archive copies, private umask, extra private entries rejected before reads, tampering, missing files, links, FIFO, executable/writable modes, source/root races, marker races/bounds, unexpected tmpfs, literal pointers, inherited-lock identity/contention, real Bash→Python fd9 retention, actual Git tar extraction preserving 0664/0775 modes, trusted UID/GID, private ancestry, and immutable-runtime prerequisites
- Release safety: 14 tests passed, including exact embedded verifier equivalence, fixed predecessor/candidate pins, generic-only workflow routing, environment preservation and bounded failure handling
- Exact 4d→533 recovery and HTTP drills passed, including DELETE/committed-WAL backup/verify/restore, additive migration, future refusal, late-DDL rollback and source-copy HTTP boundaries with synthetic mail configuration
- Independent review found no confirmed P0/P1 in the local gate and wrapper. Docker/SSH production execution and actual private archive verification are not established by these local tests

The fixed classes identify only the validation phase, not a filename, value or inferred cause. Local controls still reject generated/untracked archive files and differing executable semantics; these can be packaging differences, but are hypotheses until the corresponding guard is observed. No archive normalization or permission change is performed. A source-only regression reproduces canonical Git tar extraction with preserved group-write modes; this demonstrates format compatibility and does not establish any production failure cause. The successor candidate’s exact three CI checks were verified green before the local pin changed; its storage, authentication, email, private-asset, backup, Compose, Docker and package contracts are byte-identical to the prior reviewed candidate.
