# Hardening batch (A54 + A55) rollback

- Pre-merge main SHA: 2f66914d (PR #209 merge). Batch branch: spiral/jiesong-hardening-batch (A54 b3cc220c + A55 b3efc0f7 + merge/unify commit).
- Nature: code-only RBAC/redaction + labels; no schema change, no migration, no data rewrite. Two-way door.
- Deploy backup point: before deploy take the usual `npm run db:backup` snapshot (precaution only; nothing here writes new data shapes) and note the currently deployed SHA (expected 2f66914d) and the BUILD_ID from `scripts/verify-vps-runtime.cjs`.
- Revert steps: (1) `git revert -m 1 <batch merge commit>` on a branch from main, PR through the normal 9 required checks, merge, redeploy; (2) or redeploy SHA 2f66914d via the deploy workflow. No DB restore needed.
- Behaviour that disappears on rollback: WAREHOUSE money/invoice-number redaction (`utils/warehouseRedaction.js`), `/export/:type` payments guard + audit, A55 sales/AI WAREHOUSE gates, finance label changes, A54/A55 frontend gating.
- Merge note: A54 and A55 both added a WAREHOUSE export-amount option; unified to `includeMoney` (A54 name). The B113 doc row uses A55's OD-1 wording.
