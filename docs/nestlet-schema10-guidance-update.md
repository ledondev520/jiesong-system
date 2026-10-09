# Same-schema10 guidance correction

Final UI workflow follow-up target is `66725b9d98ecc50b4dadc3f2b224f312943403e8`,
reviewed tree `d60fa23de1eae01b521124555308b4b4877de067`. Main CI, independent
activation/remote review and release GO remain required before dispatch.
Live predecessor is `52f6ce549ea847274caaa3b973814bc23f448b3a` (schema10).

This update keeps the established provider directory, wrapping file and exact
Compose overlay. Missing or changed private metadata fails before downtime;
there is no key-generation, replacement, mount recreation or configuration reset
path. Both predecessor and candidate Compose operations use the existing overlay.
The observed Compose false-omission compatibility rule remains version-bound and
requires explicit successful overlay byte verification.

Every release still creates a private case backup and, if present, a separate
ciphertext-only provider backup while service is stopped. No wrapping key enters
those copies. No cleanup or offsite transfer occurs. The effective enabled/paused
model state and existing encrypted configuration bytes must survive replacement.

Normal schema10 startup is rehearsed on a backup-of-backup, preserving every
historical row, DDL object, sequence and original asset. Sessions, CSRF, grants,
remembered library choices, service settings/quotas/usage/audit, facts, artifacts
and recovery receipts remain intact. The old schema10 runtime must open a
separate candidate-written copy unchanged. Future schema11 is refused.

An isolated restore-copy test still invalidates email actions, sessions and
remembered choices and pauses ordinary service under the existing recovery
policy. It is never used as the normal release copy and is never restored live.
No schema migration, automatic runtime fallback, restore or downgrade occurs.
Final health, exact built assets and encrypted-store readiness remain release
gates; authenticated model/PDF acceptance is performed separately by the owner
of the ongoing acceptance task.
