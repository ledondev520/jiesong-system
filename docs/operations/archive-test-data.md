# Archive test data and 存疑 suppliers (owner decision 13, spec §4.11)

Archive = `isActive=false` on the existing flag (`Supplier`, `Store`, `Product`). No schema change, no hard delete. Contracts, payments, invoices and tax-refund history keep their references; `GET /suppliers/:id` still returns an archived supplier.

## Behaviour
- `GET /suppliers` (and `lite=true` pickers) return active suppliers by default; `status=archived` = 「已归档」; `status=all` = both. AI supplier search skips archived ones.
- Archive: existing `DELETE /suppliers/:id` (soft). Restore: `PUT /suppliers/:id {"isActive": true}`, **ADMIN only** (403 otherwise).

## Script `backend/scripts/archive-test-data.js`
Dry-run is the default and writes nothing. Target DB comes only from the process `DATABASE_URL` (SQLite); `.env` is never read.

| Rule (exact, case-sensitive, only rows still active) | Reason |
|---|---|
| Supplier name/shortName contains `(存疑)` or `（存疑）` | doubtful |
| Supplier name/shortName starts with `QA-` | test-data |
| Store name starts with `QA-`; Product customsName starts with `QA-` | test-data |
| Supplier name/shortName contains `(文件损坏)` / `（文件损坏）` | damaged — only with `--include-damaged` (owner Q11 pending) |

## Production run plan (NOT done by the PR; needs owner approval)
1. `DATABASE_URL=<prod sqlite> node backend/scripts/archive-test-data.js` → review the dry-run list with the owner.
2. `... --confirm --backup-dir <0700 dir>` → takes an online SQLite snapshot first (aborts if it fails), writes a 0600 receipt of IDs into the backup dir, then flips `isActive` in one transaction.
3. Rollback: `... --restore <receipt.json> --confirm --backup-dir <dir>` (or restore suppliers one by one as ADMIN in the UI).
