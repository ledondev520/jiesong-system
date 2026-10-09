# Pinned schema10 and durable-provider release

Final merged application SHA is `1d6c2592118977455a29ed4e7d7c5b1153362d0c`, tree
`32d8b7bb338974e29c8732e696ec8d18c4a32443`, identical to reviewed PR51.
The workflow is dispatch-capable; exact main CI, independent activation review,
remote byte readback and release GO remain required before dispatch. Specific
security bootstrap and first environment-baseline transition approvals are recorded.
Live predecessor is f738655ccab834d77d9204ebab25ab1e2a61d8ee (schema9).

## New security configuration requiring specific approval

- Host `/opt/nestlet/secrets` is root-owned0700. Generate one raw32-byte random
  wrapping file at `provider-wrapping.key`, service UID1000,0400, single link.
  Never print, export, rotate, replace, or place it in source or database backups.
- Host `/opt/nestlet/provider-config` is UID1000,0700. Bind it read-write to
  `/provider-config`; set `NESTLET_PROVIDER_CONFIG_PATH` to
  `/provider-config/provider-config.sqlite`.
- Bind the exact wrapping file read-only to
  `/run/nestlet-private/provider-wrapping.key`; set
  `NESTLET_PROVIDER_WRAPPING_KEY_FILE` to that container path. Container ancestor
  permissions and service UID readability must pass in the actual built image.
- Existing image user, case volume, ingress, credentials and resource limits stay
  bounded by the existing release checks. The two exact bind mounts are the only
  proposed mount additions. No host directory or Docker socket is exposed.

The application encrypts saved settings with AES-256-GCM. A missing, malformed,
wrong-owner or unavailable wrapping file disables AI/settings when ciphertext exists, while case access remains available. The release separately requires cryptographic store readiness, not just HTTP liveness.
The wrapping file is not an API credential and grants no new provider access.
Loss of it makes stored settings unrecoverable. Key escrow is not configured by
this release; independent escrow needs an explicitly approved destination.

## Existing settings and first restart

The application preserves existing environment-backed configuration. It does not
extract a current process RAM override and does not automatically migrate the
environment key. Owner Save persists the verified selection thereafter. Inspect
only configured/enabled booleans through the existing channel before downtime;
never print environment dumps, key bytes, suffixes or hashes. A missing
environment baseline requires a secure owner re-entry plan, not RAM extraction.

## Private backup and recovery

Case backups include only the case SQLite database and assets; provider storage
and wrapping files are outside that volume. Before each later release, while the
service is stopped, make a separate private copy of existing provider ciphertext
under the release recovery directory, with0700 parent and0600 file. Refuse
unexpected links, ownership, journals, WAL or malformed database identity.
Verify source and copy ciphertext bytes without printing their contents/hashes.
Do not create an empty configuration database merely to back it up. No automatic
pruning is configured. These copies are local recovery points, not offsite backup.

Restoring case data must never restore or overwrite provider configuration.
Provider restore requires separate operator approval and the matching wrapping
file. Never silently replace damaged ciphertext or fall back to environment.
No automatic case restore, old-image fallback or schema downgrade is allowed.

Normal schema9→10 migration must preserve all historical rows, sessions, grants,
original assets and DDL. Isolated current/legacy restore rehearsals intentionally
invalidate sessions, email actions and remembered library choices and pause trial
service. Historical restores retain the complete private recovery-fence directory.
Read-only telemetry expiry/count eligibility is checked before stopping service;
strict post-copy comparison still fails closed on a later race.
