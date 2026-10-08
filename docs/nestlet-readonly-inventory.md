# Nestlet redacted read-only operations inventory

This is a metadata-only audit, not a deployment or backup/restore operation. It is pinned to the currently verified `f738655ccab834d77d9204ebab25ab1e2a61d8ee` runtime and the existing dedicated Nestlet volume. Publish/dispatch only after independent exact-byte review and parent authorization.

## Channel and files

Use the already registered `.github/workflows/qa.yml` on isolated branch `ops/nestlet-readonly-audit-20261008`. It contains only a manually dispatched audit job; no `deploy.yml` run, default-branch modification, push trigger or service rollout. Reuse the unchanged staging-scoped SSH/host-identity mechanism, account/repository/branch gates, helper SHA256 pin and shared Nestlet workflow concurrency. Credentials stay in the existing mechanism and are never returned.

The host Python helper opens the already-existing maintenance lease read-only and takes a nonblocking shared lock. It validates managed directories, exact current pointer, one running healthy read-only-root Nestlet container and the expected local volume. A mismatch fails closed. It creates no host files and never invokes Docker exec, Compose, systemctl mutation, SQL, provider APIs or backup/restore commands.

## Output scope

- Filesystem total/free/available bytes and inode counts for managed storage and the dedicated volume.
- Aggregate file/directory counts and logical/allocated bytes, with capped traversal, no data-file content reads, no mount/symlink following and no filenames/paths in output.
- Aggregate recovery directory count and oldest/newest directory modification timestamps, plus whether recovery shares the managed root filesystem. These are metadata, not proof of complete backups or retention policy.
- Existing container hardening/status/resource limits and restart count.
- Matching systemd timer/service metadata categorized as Nestlet-specific or generic backup/monitor candidates. No raw unit names, ExecStart, Environment, command text or failure-handler destinations leave the host. Last/next timestamps are constrained or redacted. No enable/start/reload action.
- Counts of matching filenames in `/etc/cron.d`, not cron contents. User crontabs and arbitrary custom schedulers are not inspected.
- Presence-only fixed paths for standard backup/monitor system configuration. Configuration contents are not read.
- A single direct loopback HTTP liveness request, without proxy use, redirects, authentication or provider traffic.

## Limits and interpretation

A matching generic service does not prove it protects Nestlet. Config presence does not prove activation, successful delivery, retention or a recipient. No match does not prove an external monitor/offsite backup is absent. Destinations, recipients and retention remain explicitly unverified where establishing them would require reading configuration contents. Do not infer those values from filenames.

Partial traversal or unavailable scheduler metadata is marked accordingly. Current disk figures are a point-in-time snapshot. Directory modification dates are not backup completion dates. The sole content-read exception is at most 8 KiB of fixed `/proc/self/fdinfo/<held descriptor>` kernel metadata. Mount IDs must be available and unambiguous; every held child descriptor must match the root mount ID, including same-device bind mounts. No database contents, integrity checks, original assets, user sessions, grant records, email actions, credentials or private logs are read.

## Offline verification

Tests cover metadata-only traversal, symlink/root refusal, bounded traversal, redaction of synthetic secret-like scheduler fields, configuration presence without reads, complete mocked audit output, identity rejection before commands, dispatch/transport/hash gates and mutation/broad-read exclusions. No test contacts the host. Independent review precedes publication and exact remote-file verification precedes the one audit dispatch.
