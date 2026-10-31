# Archive test data and 存疑 suppliers (owner decision 13, spec §4.11)

Archive = `isActive=false` on the existing flag (`Supplier`, `Store`, `Product`). No schema change, no hard delete. Contracts, payments, invoices and tax-refund history keep their references; `GET /suppliers/:id` still returns an archived supplier.

## Behaviour
- `GET /suppliers` and `GET /stores` (and `lite=true` pickers) return active rows by default; `status=archived` = 「已归档」; `status=all` = both (shared `utils/archiveFilter.js`). AI supplier search skips archived suppliers. `GET /suppliers/:id` and `GET /stores/:id` still return archived rows.
- Archive: existing `DELETE /suppliers/:id` (soft); stores via `PUT /stores/:id {"isActive": false}`. Restore: `PUT {"isActive": true}` on either, **ADMIN only** (403 otherwise).

## Script `backend/scripts/archive-test-data.js`
Dry-run is the default and writes nothing. Target DB comes only from the process `DATABASE_URL` (SQLite); `.env` is never read. The script uses `financial-sqlite-safety.js` like the default-customer backfill: the file must exist, be private and single-link, and the database Prisma actually opened must be the same file (checked before reading and again after the backup); otherwise it refuses with nothing written.

| Rule (exact, case-sensitive, only rows still active) | Reason |
|---|---|
| Supplier name/shortName contains `(存疑)` or `（存疑）` | doubtful |
| Supplier name/shortName starts with `QA-` | test-data |
| Store name starts with `QA-`; Product customsName starts with `QA-` | test-data |
| Supplier name/shortName contains `(文件损坏)` / `（文件损坏）` | damaged — only with `--include-damaged` (owner Q11 pending) |

## Production run plan (NOT done by the PR; needs owner approval)
1. `DATABASE_URL=<prod sqlite> node backend/scripts/archive-test-data.js` → review the dry-run list with the owner.
2. `... --confirm --backup-dir <0700 dir> --receipt <new file in a private dir>` → reserves the 0600 receipt, takes an online SQLite snapshot (aborts if it fails), re-checks the target identity, then flips `isActive` in one transaction and writes the IDs, counts, backup path and target fingerprint to the receipt.
3. Rollback: `... --restore <receipt.json> --confirm --backup-dir <dir> --receipt <new file>` (or restore suppliers one by one as ADMIN in the UI). The receipt is validated first (format `jiesong-archive-receipt-v1`, action `archive`, plan shape, and `targetFingerprint` equal to the current database file); a receipt from another database or copy is refused before any output or backup, even for the same IDs. Restore therefore only works on the database file that was archived; moving to another file needs a separately reviewed mapping.
