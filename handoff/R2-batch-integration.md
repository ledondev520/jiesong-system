# R2 batch integration (ap01)

Local branch spiral/R2-batch (base 404dacd0 = origin/main), cards merged B87..B110 in order, all 24 merge cleanly except one doc conflict.

## Original integration (first attempt, base 404dacd0; B87 then failed 3 test:db tests, since fixed)

### Conflicts
- B96: AGENTS.md, SECURITY.md - both sides appended a paragraph at the same spot; kept both (data-classification.json parses, no markers left).

### Results on the first integrated head
- backend npm test: 1268/1268 pass
- backend test:carrier-pdf: 5/5 pass
- backend test:db: 330/333, 3 fail, all in src/integration/overview-source-readbacks.integration.js
  (Shanghai shipped-day margin and cash...; current payable/receivable snapshot uses formal versus derived ownership...; HTTP/SQLite ordinary overviews parent).
  Example: netCashCny actual 195, expected 125.
- frontend: tsc clean, vitest 288 files / 1639 tests pass.
- check-pr-format.cjs not run (needs PR base/head SHAs).

### Broken card: B87 (work/B87-derived-receivable, af53f692 "stop ratio-scaling own USD receipts on mixed DERIVED containers")
- overview-source-readbacks.integration.js passes 4/4 on origin/main and fails 3/4 on the B87 branch alone.
- The card changed the derived-receipt behaviour but did not update or re-run that integration (it is in test:db, not npm test).
- Not fixed on the batch branch per protocol. Needs the B87 owner to decide: update the test expectations (if the new numbers are intended) or fix the code.
- Remaining test:db files were not individually compared against main; only these 3 failures appeared.

## Re-integration (B87 fix)

- B87 head: origin/work/B87-derived-receivable @ 313c4cf6 (test-only, +8/-7), merged cleanly into spiral/R2-batch (merge c7299986). No other card changed.
- Full suite on the integrated head: backend npm test 1268/1268; test:carrier-pdf 5/5; test:db 333/333; frontend tsc clean; frontend vitest 288 files / 1639 tests pass.
- Note: handoff/R2-batch-integration.md was absent in this worktree, so this file was created with only this section.
