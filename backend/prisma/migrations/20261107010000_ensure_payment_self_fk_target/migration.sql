-- Forward fix (B66/P0-10): rebuild "payments" so sourcePaymentId always references "payments" ("id").
-- 20260402133500 declared the self-FK against its temp table payments_fixed; the follow-up
-- 20260402133700_fix_payment_self_fk_again.sql sat outside a migration folder and never ran.
-- Never edit that historical migration (checksums). No other table references payments.
-- Idempotent on databases whose FK is already correct: same columns, same rows, same indexes.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_payments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "idempotencyKey" TEXT,
    "type" TEXT NOT NULL,
    "purchaseContractId" TEXT,
    "salesContractId" TEXT,
    "sourcePaymentId" TEXT,
    "customerName" TEXT,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "paymentMethod" TEXT,
    "paymentDate" DATETIME NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "payments_purchaseContractId_fkey"
      FOREIGN KEY ("purchaseContractId") REFERENCES "purchase_contracts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "payments_salesContractId_fkey"
      FOREIGN KEY ("salesContractId") REFERENCES "sales_contracts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "payments_sourcePaymentId_fkey"
      FOREIGN KEY ("sourcePaymentId") REFERENCES "payments" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_payments" (
  "id", "idempotencyKey", "type", "purchaseContractId", "salesContractId", "sourcePaymentId", "customerName",
  "amount", "currency", "paymentMethod", "paymentDate", "note", "createdAt", "updatedAt"
)
SELECT
  "id", "idempotencyKey", "type", "purchaseContractId", "salesContractId", "sourcePaymentId", "customerName",
  "amount", "currency", "paymentMethod", "paymentDate", "note", "createdAt", "updatedAt"
FROM "payments";

DROP TABLE "payments";
ALTER TABLE "new_payments" RENAME TO "payments";

CREATE UNIQUE INDEX "payments_idempotencyKey_key" ON "payments"("idempotencyKey");
CREATE INDEX "payments_sourcePaymentId_idx" ON "payments"("sourcePaymentId");
CREATE INDEX "payments_customerName_idx" ON "payments"("customerName");
CREATE INDEX "payments_type_idx" ON "payments"("type");
CREATE INDEX "payments_purchaseContractId_idx" ON "payments"("purchaseContractId");
CREATE INDEX "payments_salesContractId_idx" ON "payments"("salesContractId");
CREATE INDEX "payments_createdAt_idx" ON "payments"("createdAt");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
