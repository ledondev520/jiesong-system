# Carrier PDF edge regression

## Result and scope

All four bounded cases pass on baseline `55e983e23cdf4a96aa1843c908dee96142940b24`. No production defect was reproduced, and no parser, comparison, archive or readiness implementation changed.

The existing `backend/src/integration/trade-lifecycle.integration.js:116–135` already sends genuine PDFKit bytes through the real packing-list HTTP check and obtains `PASSED` before material readiness. This work extends that genuine-PDF coverage.

`backend/src/integration/carrier-pdf-edges.integration.js` uses the actual Express application, authentication, global limiter and multipart memory upload. `POST /api/v1/sales/:id/packing-list-check` invokes the default local pdfjs extractor and original-byte archive. Private SQLite is initialized by replaying committed migrations. The fixture database and upload root are private (`0700` directories, `0600` database); archive permission tightening is exercised under subprocess umask `022` and UTC.

PDFKit and all other dependencies are already installed. The PDFs are made in memory from synthetic values, including an embedded raster-only PDF and a truncated copy of a genuine PDF. No parser mock, OCR/provider call, new package, shared Prisma generation, `db push`, real business file, production upload or user-computer operation is used. Cleanup removes only this test's disposable directory after its asynchronous audit writes settle.

## Four cases

1. Two products on two pages: identities, quantities `47`/`83`, boxes `3`/`7` and contract totals match. The check is `PASSED`; both rows are persisted in packing order. SHA-256, disk bytes, authenticated download bytes and archive `0700`/`0600` modes agree with the original buffer. Check history reads back the same record. Internal material readiness changes from blocked only on carrier consistency to ready; formal tax filing count remains zero.
2. Wrong first-row quantity: the first product says `46` while expected `47` appears in the preceding booking reference and after the second product. Genuine extraction confirms those strings are present. The first row fails quantity with closest value `46`; its identity and boxes, the second row and contract totals pass. The check is `DIFFERENCE`, the original remains archived and readiness stays blocked.
3. Image-only genuine PDF: the default extractor returns zero text/numbers. The original is archived without byte changes; automatic/final status is `NEEDS_MANUAL_REVIEW`, comparison rows/fields are empty and readiness stays blocked. No OCR or manual approval is attempted.
4. Malformed PDF: the first 64 bytes of the successful genuine PDF are submitted to the previously ready synthetic shipment. The existing `422` response says `PDF 解析失败，请确认文件未损坏`. Independent read-only snapshots of every application table, archive tree/checksums/modes and the complete readiness response remain unchanged. No new check or archive is created.

## Comparison limits retained

These cases cover explicitly ordered synthetic identity segments, not general carrier table parsing. Contract totals still use numeric presence anywhere in extracted text. Row boxes/quantity use numeric presence within the existing name-or-HS identity segment rather than semantic column labels. Segmentation follows packing-row order and the next identity, with an existing 400-character fallback for the final/unbounded row. Repeated identities, ambiguous HS/name matches, unusual reading order and coincidental numbers within one segment remain outside this coverage. Image-only content requires human review; the result does not claim OCR accuracy.

## Verification

Node `20.19.0`, UTC and existing dependencies were used:

- Fast command: `cd backend && npm run test:carrier-pdf` passes all four cases (Node reports five tests including the enclosing test)
- Related carrier/preparation/shipment unit tests plus genuine trade lifecycle, preparation-content and this integration: 38/38 pass
- Existing `npm run test:db` aggregate: 173/173 pass
- Syntax check and `git diff --check`: pass

`test:all` now includes the dedicated carrier command after its existing unit and DB phases. The complete unit/frontend suites and remote CI were not run for this unpublished test-only branch. No push, PR, merge or deployment is part of this work.
