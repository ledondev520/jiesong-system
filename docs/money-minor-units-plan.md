# Money to integer minor units: plan (AUDIT-JS Top-4)

Status: PLAN ONLY. No column is changed in this round. Done so far: one rounding rule
(`backend/src/utils/money.js`, mirror `frontend/src/lib/money.ts`), used by every finance service.
The USD price rule stays single-sourced in `services/exportPricing.js` (locked, out of scope here).

## Problem
`schema.prisma` stores money as `Float` (about 170 Float fields, 0 `Decimal`). Sums of floats drift by
fractions of a cent; the shared rounding hides it at display time but stored totals can still disagree
with the sum of their rows.

## Target
Integer minor units (`Int`/`BigInt`, cents) per currency, plus the currency code already on each row.
SQLite has no `Decimal`, so Prisma `Decimal` would be stored as float/text anyway: integer cents is the safe choice.
Exchange rates and quantities stay `Float` (they are not money).

## Steps (each is its own release; each step is additive until step 4)
1. **Shadow columns** (additive migration): for each money field `x`, add nullable `xMinor Int?`
   (start with Payment, PurchaseContract, SalesContract + items, Invoice, BankFlow, Receivable allocations).
   Take a verified online SQLite snapshot first (`sqlite_snapshot.py`, 0700/0600, integrity check).
2. **Backfill** (idempotent script, dry-run by default): `xMinor = toCents(x)` in batches inside a
   transaction; write a receipt with row counts; report rows where `abs(x*100 - round(x*100)) > 1e-6`
   (data that already carried sub-cent noise) for owner review. Never edits `x`.
3. **Dual-write**: services write both `x` and `xMinor` (via `toCents`); a nightly check compares
   `toCents(x) === xMinor` and fails loudly on drift. Reads still use `x`. Run one full period close like this.
4. **Switch reads** to `xMinor / 100` behind a config flag, per module (finance first), then flip the flag.
   One-way door starts here only in the sense that the old column stops being authoritative.
5. **Retire** `x` in a later, separate migration after a full close cycle on `xMinor` (needs the one-way
   door/rollback section of the PR template). Not before.

## Rollback
- Steps 1-3: drop-free; set the flag off / ignore `xMinor`. Old column is untouched and authoritative.
- Step 4: flip the flag back; dual-write keeps `x` current, so nothing is lost.
- Step 5 is the only destructive step: restore from the pre-migration snapshot taken for it.

## Out of scope / risks
- Percent fields, FX rates, quantities, weights stay Float.
- Raw SQL and exports that read `x` directly must be listed (grep `$queryRaw`, `csvExport`, reports) before step 4.
- Do this after the pricing/payables epics settle; finance files change heavily there.
