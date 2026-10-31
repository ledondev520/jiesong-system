# Data model freeze 2026 — Customer, order terms, per-store purchasing, Quote

| | |
|---|---|
| Status | Frozen design for cards J11 (migration A), J16 (migration B1) and J20 (migration B2). Docs only; no code or schema changes here. |
| Date | 2026-10-31 |
| Based on | `docs/redesign/UX-REDESIGN-2026.md` §5 (v2 + the 2026-10-31 locked pricing rule), `backend/prisma/schema.prisma` at `origin/main` 8a09c93, `scripts/check-lifecycle.cjs`, `backend/src/middleware/bossReadOnly.js` |
| Rule | Where this file and the spec disagree on a field, **this file wins**; the spec's §5 was aligned in the same commit. Implementers should not make design decisions: anything not settled here is listed in §9 (open questions). |

## 0. Summary

| Migration | Card | New tables | New columns | Door |
|---|---|---|---|---|
| A `customer_store_order_terms` | J11 | `customers` | `stores.customerId`, `stores.code`, `stores.legalName`; `sales_contracts.customerId`, `.currency`, `.incoterm`, `.paymentTerms`, `.portOfLoading` | one-way |
| B1 `per_store_purchasing` | J16 | — | `purchase_items.storeId`; `purchase_contracts.salesContractId` | one-way |
| B2 `quotes` | J20 | `quotes`, `quote_items` | `sales_contracts.quoteId` | one-way |

All changes are additive (new tables, nullable columns or columns with a constant default). No existing value is rewritten by SQL. Order: A → B1 → B2 (B1 and B2 both need A; B1 and B2 are independent of each other, but must get distinct, increasing migration timestamps in merge order).

---

## 1. Conventions every migration follows

1. **Hand-written SQL in `backend/prisma/migrations/<timestamp>_<name>/migration.sql`.** `node_modules` are not installed on the VPS, so the implementer cannot run `prisma migrate dev`. Use the SQL given below verbatim. It uses `ALTER TABLE … ADD COLUMN … REFERENCES` instead of the table rebuild (`-- RedefineTables`) that `prisma migrate dev` would generate for SQLite: SQLite allows adding a nullable FK column this way, and it avoids copying `sales_contracts`, `stores`, `purchase_items` and `purchase_contracts` row by row.
2. **SQLite limits honoured:** `ADD COLUMN` cannot carry `UNIQUE`, so unique columns get a separate `CREATE UNIQUE INDEX "<table>_<column>_key"` (Prisma's own naming). FK columns added with `ADD COLUMN` must be nullable (they are).
3. **Prisma type mapping:** `String`→`TEXT`, `Float`→`REAL`, `Int`→`INTEGER`, `Boolean`→`BOOLEAN`, `DateTime`→`DATETIME`; `@default(now())`→`DEFAULT CURRENT_TIMESTAMP`; `@updatedAt`→`DATETIME NOT NULL` without default; `@unique`→`CREATE UNIQUE INDEX "<table>_<col>_key"`; `@@index`→`CREATE INDEX "<table>_<col>_idx"`.
4. **Referential actions are explicit in the schema** (`onDelete:` on every new relation), and the SQL repeats them (`ON DELETE RESTRICT|SET NULL ON UPDATE CASCADE`). Business records are archived, not deleted (spec §4.11), so `Restrict` is the default; the one `SetNull` is justified where it appears.
5. **Drift guard (required in J11, reused by J16/J20).** Add `backend/src/integration/schema-drift.integration.js` (and list it in `test:db` in `backend/package.json`) that runs, in CI where `node_modules` exist:
   ```
   npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma \
     --shadow-database-url "file:<tmp>/shadow.db" --exit-code
   ```
   and asserts exit code 0 (no difference). If it reports a difference, fix the SQL or the schema until it is empty; do not change the design. The shadow database lives in a private temp directory and is deleted afterwards.
6. **Every migration is also applied by `resource-lifecycle.integration.js`**, which concatenates all `migration.sql` files and runs them with Python `sqlite3.executescript`. The SQL must therefore be plain SQLite (no Prisma-only syntax).
7. **Checked while freezing (2026-10-31):** the three SQL blocks below were applied with Python `sqlite3` (`PRAGMA foreign_keys=ON`) on a database built from all 31 committed migrations: `foreign_key_check` empty, `integrity_check` ok, a duplicate `stores.code` is rejected, deleting a referenced customer is refused. This does not replace the Prisma drift check in point 5.
8. **Production:** `deploy.yml` runs `npx prisma migrate deploy` on every deploy **without taking a backup**. A commit containing a migration may only be deployed after the release coordinator takes `npm run db:backup -- --database <absolute production path>` and records the snapshot path and SHA-256 (see §6). Owner sign-off is needed before merge and before that deploy (one-way door).

---

## 2. Migration A — Customer, Store → Customer, order-level terms (J11)

### 2.1 Schema diff (`backend/prisma/schema.prisma`)

New model (place it next to `Store`):
```prisma
// Confidential: customer contact data. One row per buying customer; Seapot is the only active one in v1.
model Customer {
  id                   String   @id @default(cuid())
  name                 String   @unique               // "Seapot"
  legalName            String?                        // buyer name printed on PI / export documents (spec Q16)
  country              String?                        // ISO-3166 alpha-2, e.g. "US"
  address              String?
  contactName          String?
  contactEmail         String?
  contactPhone         String?
  defaultCurrency      String   @default("USD")       // v1 accepts only "USD"
  defaultIncoterm      String   @default("FOB")       // owner decision: Seapot buys FOB
  defaultPaymentTerms  String?
  defaultPortOfLoading String?                        // free text, e.g. "Shanghai"; prints as "FOB <port>" (spec Q7)
  note                 String?
  isActive             Boolean  @default(true)        // archive flag; customers are never hard-deleted
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  stores         Store[]
  salesContracts SalesContract[]

  @@map("customers")
}
```

`Store` — add three fields, one relation, one index (existing fields unchanged; `portId` stays the store's **destination** port):
```prisma
  customerId String?                       // nullable for the migration; new stores must set it (API rule, J12)
  code       String?  @unique              // short code for shipping marks / PI lines, e.g. "SAC" (spec Q17)
  legalName  String?                       // the store's operating entity, e.g. "Khp Sacramento LLC" (spec Q16)

  customer Customer? @relation(fields: [customerId], references: [id], onDelete: Restrict)

  @@index([customerId])
```

`SalesContract` — add five fields, one relation, one index (existing fields unchanged; `exchangeRate` keeps its meaning, the order's spot rate snapshot; `portId` stays the **destination** port):
```prisma
  customerId    String?
  currency      String   @default("USD")   // existing rows become "USD" (all existing prices are USD)
  incoterm      String?                    // new orders copy Customer.defaultIncoterm; null on old rows = show customer default
  paymentTerms  String?
  portOfLoading String?                    // free text, copied from Customer.defaultPortOfLoading

  customer Customer? @relation(fields: [customerId], references: [id], onDelete: Restrict)

  @@index([customerId])
```

Why `portOfLoading` is text and not a `Port` relation: the `ports` table holds destination ports (every `Store.portId` points into it, and `SalesContract.portId` is commented 目的港口). Mixing Chinese loading ports into it would make store and order port pickers ambiguous. One free-text field is enough to print "FOB Shanghai".

### 2.2 `migration.sql` (folder `<timestamp>_customer_store_order_terms`)
```sql
-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "country" TEXT,
    "address" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'USD',
    "defaultIncoterm" TEXT NOT NULL DEFAULT 'FOB',
    "defaultPaymentTerms" TEXT,
    "defaultPortOfLoading" TEXT,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "customers_name_key" ON "customers"("name");

-- AlterTable stores
ALTER TABLE "stores" ADD COLUMN "customerId" TEXT REFERENCES "customers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stores" ADD COLUMN "code" TEXT;
ALTER TABLE "stores" ADD COLUMN "legalName" TEXT;
CREATE UNIQUE INDEX "stores_code_key" ON "stores"("code");
CREATE INDEX "stores_customerId_idx" ON "stores"("customerId");

-- AlterTable sales_contracts
ALTER TABLE "sales_contracts" ADD COLUMN "customerId" TEXT REFERENCES "customers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_contracts" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "sales_contracts" ADD COLUMN "incoterm" TEXT;
ALTER TABLE "sales_contracts" ADD COLUMN "paymentTerms" TEXT;
ALTER TABLE "sales_contracts" ADD COLUMN "portOfLoading" TEXT;
CREATE INDEX "sales_contracts_customerId_idx" ON "sales_contracts"("customerId");
```
SQLite allows several NULLs under a unique index, so existing stores without a code do not collide.

### 2.3 Backfill script `backend/scripts/backfill-default-customer.js` (J11)

| Item | Rule |
|---|---|
| Arguments | `--database <path>` (required, absolute; never read `.env`, never guess), `--customer-name <name>` (required, e.g. `Seapot`), `--dry-run` (default), `--confirm`, `--backup-dir <dir>` and `--receipt <file>` (both required with `--confirm`) |
| Safety | Reuse `backend/scripts/financial-sqlite-safety.js` the way `retain-financial-snapshots.js` does: refuse a missing or non-private target, verify the real path and `PRAGMA database_list`, take the online backup (with committed WAL) and integrity check **before** the write transaction, re-verify identity, then write. Receipt file 0600, exclusive create. |
| Writes (one transaction) | 1. Create the customer if no row has that `name` (defaults USD / FOB, `isActive` true). 2. `UPDATE stores SET customerId = <id> WHERE customerId IS NULL`. 3. `UPDATE sales_contracts SET customerId = <id> WHERE customerId IS NULL`. Inactive stores are linked too. |
| Does not write | `Store.code`, `Store.legalName` (owner input, Q17/Q16), `SalesContract.incoterm` / `paymentTerms` / `portOfLoading` of old orders (no rewriting of historical terms), anything else. |
| Output | One JSON line: `mode`, `customerCreated` (bool), `customerId`, `storesLinked`, `salesContractsLinked`, `backupPath`, `targetFingerprint`, `completedAt`. Counts and ids only; no names, contacts or amounts. Dry-run prints the same counts with `mode: "dry-run"` and writes nothing (no backup, no receipt). |
| Idempotent | A second `--confirm` run creates nothing and links 0 rows. |
| Production | Run only after owner approval, after migration A is deployed, by the release coordinator. Not part of the PR. |

Tests (`backend/scripts/backfill-default-customer.test.js` + integration on a temp SQLite built from the committed migrations): dry-run writes nothing (row snapshot equal, no backup file); confirm links all NULL rows and leaves pre-linked rows untouched; second run is a no-op; missing `--backup-dir`/`--receipt` with `--confirm` exits non-zero before opening the database; output contains no store or customer names.

### 2.4 API rules that come with A (J11 schema + J12 API)
- `Customer.defaultCurrency` and `SalesContract.currency` accept only `"USD"` in v1 (400 otherwise).
- Incoterm values accepted: `FOB`, `CFR`, `CIF`, `EXW`, `DDP` (upper-case). Default `FOB`.
- `Store.code`: 2–12 characters `[A-Z0-9-]`, stored upper-case, unique (409 on duplicate).
- Creating a sales contract (existing `POST /sales`) without `customerId`: the service uses the only active customer; with zero or several active customers it returns 400 「请选择客户」. It copies `incoterm`, `paymentTerms` and `portOfLoading` from the customer when the request omits them. The `customerId` of an existing order may change only while the order is DRAFT.
- Creating a store (existing `POST /stores`) without `customerId` uses the same single-active-customer rule. Existing store write roles are **not changed**.

---

## 3. Migration B1 — per-store purchasing and 「生成采购单」 (J16)

### 3.1 Schema diff
`PurchaseItem`:
```prisma
  storeId String?                          // which store this quantity is for; null = stock / unknown (old rows)

  store Store? @relation(fields: [storeId], references: [id], onDelete: Restrict)

  @@index([storeId])
```
`PurchaseContract` (existing `storeName` stays, no longer written or shown by new UI):
```prisma
  salesContractId String?                  // the export order this contract was generated from

  salesContract SalesContract? @relation(fields: [salesContractId], references: [id], onDelete: SetNull)

  @@index([salesContractId])
```
Back-relations: `Store.purchaseItems PurchaseItem[]`, `SalesContract.purchaseContracts PurchaseContract[]`.

`SetNull` here because `salesService.removeSalesContract` hard-deletes a still-mutable order today; `Restrict` would turn that existing flow into an FK error. The generated purchase contracts keep their per-line `storeId`, so store traceability survives.

### 3.2 `migration.sql` (folder `<timestamp>_per_store_purchasing`)
```sql
-- AlterTable purchase_items
ALTER TABLE "purchase_items" ADD COLUMN "storeId" TEXT REFERENCES "stores" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "purchase_items_storeId_idx" ON "purchase_items"("storeId");

-- AlterTable purchase_contracts
ALTER TABLE "purchase_contracts" ADD COLUMN "salesContractId" TEXT REFERENCES "sales_contracts" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "purchase_contracts_salesContractId_idx" ON "purchase_contracts"("salesContractId");
```
No backfill: old purchase lines keep `storeId = null` (their `storeName` is "—" today).

### 3.3 「生成采购单」 route and service
- **Route:** `POST /api/v1/sales/:id/purchase-drafts` in `backend/src/routes/sales.js`, `roleAuth('ADMIN', 'PURCHASE')`, `withAuditLog({ entity: 'PurchaseContract', action: 'GENERATE_FROM_SALES', … })`.
- **Body:** `{ "lines": [{ "salesItemId": "…", "supplierId": "…", "unitPrice": 12.5 }] }` — `unitPrice` is the CNY purchase price per unit as entered on today's purchase lines (the dialog pre-fills it from the J14 price history).
- **Service** (`purchaseContractGenerationService.js`, one `prisma.$transaction`):
  1. Load the order; it must be `CONFIRMED` (400 otherwise).
  2. Every `salesItemId` must belong to this order and appear once; every supplier must exist and be active; `unitPrice` > 0.
  3. Duplicate guard: if the order already has a non-CANCELLED purchase contract with an item of the same `(productId, storeId)`, reject the whole request (409) naming the product/store pairs. Partial generation (some lines now, others later) is allowed.
  4. Group lines by `supplierId`; per group create **one `PurchaseContract` with status `DRAFT`**, `salesContractId` = order id, contract number from the existing purchase-number generator, default `taxRate`, and one `PurchaseItem` per line (`productId`, `storeId`, `quantity`, `unit`, `specification` copied from the sales item; `unitPrice` from the request). Totals are computed with the **same helper the existing purchase-create service uses**, so tax basis and rounding are identical.
  5. Return the created contract ids and numbers.
- Generated contracts are DRAFT, so they are **not payables** (spec §4.7). Signing and everything after stays on the existing purchase flow.

### 3.4 Lifecycle checker: new `action` kind (J16)
`scripts/check-lifecycle.cjs` accepts only CRUD resources (exactly `POST <collection>` + `PUT <collection>/:id` with a matrix) or the pricing singleton, and new routes cannot be exempted. A one-shot action route therefore needs a small checker extension:
- New `kind: "action"`: exactly one `POST` route; required field `test` naming an existing file that contains the route path literal; no `matrix`/`update`. Everything else (route must exist, unique, not exemptable) is unchanged.
- Registry entry:
  ```json
  { "id": "sales-purchase-drafts", "kind": "action", "routeFile": "backend/src/routes/sales.js",
    "routes": ["POST /:id/purchase-drafts"], "test": "backend/src/integration/purchase-drafts.integration.js" }
  ```
- Extend `backend/src/lifecycle/contract.test.js`: (a) an action entry whose `test` file is missing fails; (b) an action entry with two routes fails; (c) an unregistered new POST route still fails. Each case must fail on the checker without the new branch (CODING_STANDARDS rule 9).
- This is the only new action route in this plan; quotes use the CRUD shape (§4.4).

---

## 4. Migration B2 — Quote / QuoteItem (J20)

### 4.1 Schema diff
```prisma
// Confidential: quote prices and reference costs. Generated PI files are streamed, never stored.
model Quote {
  id              String    @id @default(cuid())
  quoteNo         String    @unique              // "QT" + yyMM + "-" + 3-digit monthly sequence (Asia/Shanghai), e.g. QT2611-003
  customerId      String?                        // defaults to the only active customer; required before SENT
  currency        String    @default("USD")      // v1: "USD" only
  incoterm        String    @default("FOB")
  paymentTerms    String?
  portOfLoading   String?
  validUntil      DateTime?
  spotRate        Float?                         // spot CNY/USD used at the last pricing; required before SENT
  pricingRate     Float?                         // FX actually used = spotRate − adjustment (locked rule: spot − 0.2)
  pricingRevision String?                        // pricing.json revision (sha256) used at the last pricing
  status          String    @default("DRAFT")    // DRAFT / SENT / ACCEPTED / REJECTED / CONVERTED / CANCELLED
  totalAmount     Float     @default(0)
  note            String?
  createdById     String
  sentAt          DateTime?
  acceptedAt      DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  customer      Customer?      @relation(fields: [customerId], references: [id], onDelete: Restrict)
  createdBy     User           @relation("QuoteCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  items         QuoteItem[]
  salesContract SalesContract?

  @@index([status])
  @@index([customerId])
  @@map("quotes")
}

model QuoteItem {
  id             String  @id @default(cuid())
  quoteId        String
  productId      String
  storeId        String?                         // required before SENT
  quantity       Float
  unit           String?
  specification  String?
  costCny        Float?                          // reference unit cost ¥ chosen in the comparison (null = 缺成本)
  costSupplierId String?                         // snapshot of the supplier id the cost came from (no FK)
  costContractNo String?                         // snapshot of the purchase contract number the cost came from
  markup         Float?                          // markup applied (0.3 / 0.1); null when costCny is null
  formulaPrice   Float?                          // server-computed rule price in USD (whole number); null when costCny is null
  unitPrice      Float                           // final USD unit price; 0 allowed only in DRAFT
  isManualPrice  Boolean @default(false)         // true = user override, shows 手动价
  totalPrice     Float                           // round2(unitPrice × quantity)
  note           String?
  sortOrder      Int     @default(0)

  quote   Quote   @relation(fields: [quoteId], references: [id], onDelete: Cascade)
  product Product @relation(fields: [productId], references: [id], onDelete: Restrict)
  store   Store?  @relation(fields: [storeId], references: [id], onDelete: Restrict)

  @@index([quoteId])
  @@index([productId])
  @@map("quote_items")
}
```
`SalesContract` adds:
```prisma
  quoteId String? @unique                    // the quote this order was converted from

  quote Quote? @relation(fields: [quoteId], references: [id], onDelete: Restrict)
```
Back-relations: `Customer.quotes Quote[]`, `User.quotesCreated Quote[] @relation("QuoteCreatedBy")`, `Product.quoteItems QuoteItem[]`, `Store.quoteItems QuoteItem[]`.

Differences from the spec v2 draft, decided here: no `Quote.portId` (loading port is text, §2.1); `exchangeRate` split into `spotRate` + `pricingRate` because of the locked rule (spot − 0.2); rate fields nullable until the first priced save (keeps header-only drafts valid and the lifecycle matrix runnable); `isManualPrice` stored instead of inferred; `CANCELLED` state added because quotes are never hard-deleted; edits only in DRAFT (§4.3).

### 4.2 `migration.sql` (folder `<timestamp>_quotes`)
```sql
-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quoteNo" TEXT NOT NULL,
    "customerId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "incoterm" TEXT NOT NULL DEFAULT 'FOB',
    "paymentTerms" TEXT,
    "portOfLoading" TEXT,
    "validUntil" DATETIME,
    "spotRate" REAL,
    "pricingRate" REAL,
    "pricingRevision" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalAmount" REAL NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "sentAt" DATETIME,
    "acceptedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "quotes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "quotes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "quotes_quoteNo_key" ON "quotes"("quoteNo");
CREATE INDEX "quotes_status_idx" ON "quotes"("status");
CREATE INDEX "quotes_customerId_idx" ON "quotes"("customerId");

-- CreateTable
CREATE TABLE "quote_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quoteId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "storeId" TEXT,
    "quantity" REAL NOT NULL,
    "unit" TEXT,
    "specification" TEXT,
    "costCny" REAL,
    "costSupplierId" TEXT,
    "costContractNo" TEXT,
    "markup" REAL,
    "formulaPrice" REAL,
    "unitPrice" REAL NOT NULL,
    "isManualPrice" BOOLEAN NOT NULL DEFAULT false,
    "totalPrice" REAL NOT NULL,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "quote_items_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "quote_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "quote_items_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "quote_items_quoteId_idx" ON "quote_items"("quoteId");
CREATE INDEX "quote_items_productId_idx" ON "quote_items"("productId");

-- AlterTable sales_contracts
ALTER TABLE "sales_contracts" ADD COLUMN "quoteId" TEXT REFERENCES "quotes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "sales_contracts_quoteId_key" ON "sales_contracts"("quoteId");
```

### 4.3 State machine (`backend/src/services/quoteStateMachine.js`, pure function + tests)

| From | To | Guard | Side effect |
|---|---|---|---|
| DRAFT | SENT | `customerId` set; ≥ 1 item; every item has `storeId`, `quantity` > 0, `unitPrice` > 0; `spotRate`, `pricingRate`, `pricingRevision` set | `sentAt = now` |
| SENT | DRAFT | — (reopen for editing) | `sentAt = null` |
| SENT | ACCEPTED | — (an expired quote may still be accepted; the UI warns) | `acceptedAt = now` |
| SENT | REJECTED | — | — |
| ACCEPTED | CONVERTED | all SENT guards still hold; no order has this `quoteId` | convert transaction (§4.5) |
| DRAFT, SENT, ACCEPTED | CANCELLED | — | — (作废; replaces deletion) |

- REJECTED, CONVERTED and CANCELLED are terminal. Every other transition returns 400 「报价状态不允许此操作」.
- **Fields and items can be edited only in DRAFT.** A sent quote is reopened (SENT → DRAFT) to change it.
- **Expiry** is computed, not stored: `status = SENT` and `validUntil` < today in Asia/Shanghai → 已过期 badge.
- **Concurrency:** every transition is `updateMany({ where: { id, status: from }, data })` and checks `count === 1` (409 otherwise). The unique index on `sales_contracts.quoteId` is a second guard against double conversion.
- 「复制为新报价」 is `POST /quotes` with `copyFromQuoteId`: copies header and items into a new DRAFT with a new number and reprices with the current rule (manual prices are kept and stay `isManualPrice`).

### 4.4 Routes (`backend/src/routes/quotes.js`, mounted at `/quotes`)
| Method + path | Roles | Notes |
|---|---|---|
| `GET /quotes` | ADMIN, SALES, PURCHASE, FINANCE, BOSS | `page`, `pageSize` (20/50/100), `keyword` (quoteNo, customer name, note), `status`; response `{ items, pagination }` |
| `GET /quotes/:id` | same | includes items, including cost columns |
| `POST /quotes` | ADMIN, SALES | header fields (all optional), optional `items`, optional `copyFromQuoteId`; creates DRAFT |
| `PUT /quotes/:id` | ADMIN, SALES | **either** field/items edits (DRAFT only; header via `partialUpdate`, `items` = full replacement) **or** `{ "status": "<to>" }` alone (transition, §4.3); mixing both returns 400 |
| `GET /quotes/:id/export.xlsx` | ADMIN, SALES, PURCHASE, FINANCE | J21; streamed, not stored; not on the BOSS whitelist (generated files stay BOSS-denied by default) |

No `DELETE` route (archive rule). WAREHOUSE has no quote access. Quote writes are human-user only, like `purchaseReceiptService.js`; agent/AI quote tools are out of scope for v1.

**Pricing on save (DRAFT, whenever `items` is sent):** for each item the server computes `formulaPrice = priceFor({ costCny, categoryId }, config)` with the one rule from J6 (cost × 1.3, tiles × 1.1, ÷ (spot − 0.2), ceil to whole USD), never trusting a client `formulaPrice`. `unitPrice` = client `unitPrice` when `isManualPrice` is true, else `formulaPrice` (or 0 when cost is missing). It then writes `spotRate`, `pricingRate`, `pricingRevision` from the config used, `totalPrice` per line and `totalAmount`. An invalid pricing config fails the save (no silent default).

### 4.5 Convert transaction (ACCEPTED → CONVERTED, one `prisma.$transaction`)
1. Re-read the quote with items inside the transaction; re-check the guards.
2. Create `SalesContract`: `status` DRAFT, `contractNo` from `generateNextContractNo` (`services/shared/contractUtils.js`), `customerId`, `currency`, `incoterm`, `paymentTerms`, `portOfLoading`, `quoteId`, `exchangeRate = quote.pricingRate` (spot − 0.2, owner decision 2026-10-31), `portId` = the stores' common destination port when all lines share one, else null, `amountSource` default (DERIVED).
3. One `SalesItem` per quote item: `productId`, `storeId`, `quantity`, `unit`, `specification`, `note`, `costPrice = costCny ?? 0`, `sellingPrice = unitPrice`.
4. Recompute the order total the way `salesService` does today.
5. `updateMany` the quote from ACCEPTED to CONVERTED (count must be 1).
Any failure rolls back everything; the response returns the new order id and number.

---

## 5. Permissions, BOSS whitelist, lifecycle registration, classification

### 5.1 Per resource
| Resource | Read roles | Write roles | BOSS whitelist (add to `READ_PATHS` in `bossReadOnly.js`) | Lifecycle registration |
|---|---|---|---|---|
| Customer (J12): `GET /customers`, `GET /customers/:id` (includes its stores), `POST /customers`, `PUT /customers/:id`; orders per customer via existing `GET /sales?customerId=` | all authenticated roles | ADMIN, SALES | `/^\/customers(\/[^/]+)?$/` | CRUD resource `customers` (below) |
| Store (existing) | unchanged | unchanged (ADMIN, PURCHASE, SALES, FINANCE, WAREHOUSE) | already covered by `/stores` | existing routes stay legacy-exempt; adding fields does not change the route key |
| SalesContract order fields (J11/J12) | unchanged | unchanged | unchanged | existing routes, legacy-exempt |
| Purchase drafts from order (J16) | — | ADMIN, PURCHASE | none (POST) | `action` resource `sales-purchase-drafts` (§3.4) |
| Quote (J20) | ADMIN, SALES, PURCHASE, FINANCE, BOSS | ADMIN, SALES | `/^\/quotes(\/[^/]+)?$/` (export.xlsx is **not** matched: it has a second segment) | CRUD resource `quotes` (below) |
| Quote export (J21) | ADMIN, SALES, PURCHASE, FINANCE | — | not whitelisted | GET only, no registration |

Customers registry entry (J12) — `update` handler must use `partialUpdate`:
```json
{
  "id": "customers",
  "routeFile": "backend/src/routes/customers.js",
  "routes": ["POST /", "PUT /:id"],
  "update": { "file": "backend/src/controllers/customerController.js", "handler": "update" },
  "matrix": {
    "path": "/api/v1/customers",
    "table": "customers",
    "create": { "name": "Synthetic matrix customer", "contactName": "Original contact", "note": "Original note" },
    "edit": { "name": "Synthetic edited customer" },
    "invalid": [{ "name": "   ", "note": "Unwanted note" }, { "name": null }, { "defaultCurrency": "EUR" }, { "defaultIncoterm": "XYZ" }],
    "blank": { "contactName": "", "note": "   " },
    "clear": { "contactName": null, "note": null },
    "clearStatus": 200,
    "filter": "Synthetic edited customer"
  }
}
```
Quotes registry entry (J20) — header-only create needs no references, so the generic matrix runs on an empty fixture database:
```json
{
  "id": "quotes",
  "routeFile": "backend/src/routes/quotes.js",
  "routes": ["POST /", "PUT /:id"],
  "update": { "file": "backend/src/controllers/quoteController.js", "handler": "update" },
  "matrix": {
    "path": "/api/v1/quotes",
    "table": "quotes",
    "create": { "note": "Synthetic matrix quote", "paymentTerms": "Original terms" },
    "edit": { "note": "Synthetic edited quote" },
    "invalid": [{ "currency": "EUR" }, { "incoterm": "XYZ" }, { "status": "BOGUS" }, { "status": "SENT", "note": "mixed" }],
    "blank": { "paymentTerms": "   " },
    "clear": { "paymentTerms": null },
    "clearStatus": 200,
    "filter": "Synthetic edited quote"
  }
}
```
(With an empty fixture database there is no active customer, so `customerId` stays null on create; that is valid for DRAFT.) Frontend list pages added later (J13 customers, J22 quotes) register under `lists` with `useListUrlState`.

### 5.2 Classification and docs (same PR as the code, `AGENTS.md` rule)
| Data | Class | PR |
|---|---|---|
| `Customer` contact fields, `legalName`, `address`; `Store.legalName` | Confidential | J11 (schema) / J12 (API) |
| `Quote`, `QuoteItem` incl. `costCny`, `costSupplierId`, `costContractNo`, prices | Confidential | J20 |
| Generated Quotation/PI files | Restricted (generated documents); streamed, never stored; if ever stored, via `fileService.js` 0700/0600 | J21 |
| `PurchaseItem.storeId`, `PurchaseContract.salesContractId` | Confidential (existing purchase data) | J16 |

Each of J11, J12, J16, J20, J21 updates `data-classification.json`, `SECURITY.md` and `AGENTS.md` together where it adds a resource or route.

---

## 6. Rollback and restore

The migrations are one-way doors: SQL is never "down-migrated".
1. **Before deploying a commit that contains a migration:** the release coordinator runs `cd backend && npm run db:backup -- --database <absolute production DB path> --backup-dir <private dir>` and records snapshot path + SHA-256 + `_prisma_migrations` count. `deploy.yml` does not do this itself (§1.8).
2. **Code rollback (preferred, two-way):** all three migrations are additive, and the previous code's Prisma client ignores unknown columns and tables. Reverting the merge commit and redeploying is safe **without** touching the database; rows written into the new tables/columns stay and are reused when the change is re-applied. Verify after rollback with the checks in `docs/operations/production-rollback.md`.
3. **Database restore (only for corruption or a bad backfill):** stop the backend, `npm run db:restore -- --backup <snapshot> --database <new private path>`, verify manifest checksum and integrity, switch `DATABASE_URL` to the new path, start, verify (`docs/operations/sqlite-backup-restore.md`). Never overwrite the live file or discard its `-wal`/`-shm`. Data written after the snapshot is lost and must be re-entered; the owner decides.
4. **Backfill rollback:** the receipt lists the customer id and counts; reversing means `UPDATE … SET customerId = NULL WHERE customerId = <id>` on a restored copy only after owner approval — normally unnecessary because linking is harmless.

---

## 7. Test plan

| Card | Tests (must fail on the code before the change, CODING_STANDARDS rule 9) |
|---|---|
| J11 | `schema-drift.integration.js` (§1.5); migration applies on a copy of the committed migrations and keeps row counts of `stores`/`sales_contracts`; `currency` = 'USD' on old rows; backfill tests (§2.3); `POST /sales` defaulting rules (single active customer, 400 otherwise, terms copied) |
| J12 | customers CRUD + lifecycle matrix; RBAC (WAREHOUSE/PURCHASE/FINANCE cannot write; BOSS GET allowed, POST/PUT denied by `bossReadOnly`); store `code` validation and 409 on duplicate; archive (`isActive=false`) hides from default list, `?includeInactive=1` shows |
| J16 | migration B1 drift; generation service: one DRAFT per supplier, `storeId` copied, totals equal the existing purchase-create helper's, transaction rollback when the second supplier fails, 409 duplicate guard, order not CONFIRMED → 400, inactive supplier → 400; generated drafts excluded from payables (shared J8 function); RBAC; lifecycle checker `action` tests (§3.4) |
| J20 | migration B2 drift; state machine table-driven test (every allowed and every refused pair); DRAFT-only edits; pricing on save (locked rule examples incl. the owner example 10000 ¥ at spot 6.72 and float edges; missing cost → 0 + 缺成本; manual price kept); convert transaction (order + items created, quote CONVERTED, rollback on failure, double convert → 409 / unique index); quotes lifecycle matrix; RBAC incl. WAREHOUSE denied and BOSS read-only |
| J21 | workbook structure: sheet name, title/number rows, header block labels, line columns, per-store subtotal and TOTAL rows; costs/markups/suppliers absent from every cell; nothing written to disk |

---

## 8. What is deliberately not in the model
- Store master data from the Seapot research (seats, rooms, equipment, opening status, receiving hours), customer groups/brands, build-out projects, replenishment rules (spec §1.4).
- Quote versioning (copy-as-new instead), quote attachments (signed PI upload — spec Q3), non-USD currencies.
- A `salesItemId` link on purchase lines (lines are rewritten on order edits; `storeId` + `salesContractId` are stable).
- Dropping `PurchaseContract.storeName` or making `customerId` required — later migrations after the backfill is verified in production.

## 9. Open questions
1. **All existing 门店 and orders belong to Seapot?** The backfill links every store and order with no customer to the one named customer. If some stores/orders belong to someone else, they must be listed before the production run.
2. **`SalesContract.exchangeRate`** — decided 2026-10-31: conversion copies `quote.pricingRate` (spot − 0.2), same as the pricing rule.
3. **[SUPERSEDED 2026-11-01: ceil to whole USD only (13000 ÷ 6.52 → 1994), no step 5; repeat products pre-fill the last owner-confirmed price.]** **Rounding unit price vs line total; step 1 vs 5.** The owner's locked example (cost 10000 ¥ → 13000 ¥ → ÷ 6.52 = 1993.865 → **1995** USD) gives 1995, while "ceil to whole USD" gives 1994. Either the example rounds to a multiple of 5, or it is a line total. `roundUpTo` (default 1) is config; whether the rule applies to unit price or to line total is code. Needs the owner's answer before J6 merges. **Answered (owner, 2026-10-31 14:33/14:36):** unit price; whole USD first, then (if ≥ 5) the nearest multiple of 5 by ones digit; `roundUpTo` default 5 — see UX-REDESIGN-2026 §7.2.
4. **Port of loading** text (spec Q7), **store codes** (Q17) and **buyer/ship-to entities** (Q16) — owner data, entered after migration A; the model only provides the fields.
5. **`deploy.sh` still falls back to `npx prisma db push`** (`deploy.sh:215`), which `AGENTS.md` forbids and which can drop SQLite data on a failed migration. Production deploys use `deploy.yml`, but the fallback should be removed in a separate full-process PR before any of these migrations ship. Not changed here.
6. **Approvals (one-way doors):** migrations A/B1/B2 merge and production deploy; backfill production run.
