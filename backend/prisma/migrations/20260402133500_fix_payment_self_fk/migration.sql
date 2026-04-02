PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "payments_fixed" (
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
      FOREIGN KEY ("sourcePaymentId") REFERENCES "payments_fixed" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "payments_fixed" (
  "id", "idempotencyKey", "type", "purchaseContractId", "salesContractId", "sourcePaymentId", "customerName",
  "amount", "currency", "paymentMethod", "paymentDate", "note", "createdAt", "updatedAt"
)
SELECT
  "id", "idempotencyKey", "type", "purchaseContractId", "salesContractId", "sourcePaymentId", "customerName",
  "amount", "currency", "paymentMethod", "paymentDate", "note", "createdAt", "updatedAt"
FROM "payments";

DROP TABLE "payments";
ALTER TABLE "payments_fixed" RENAME TO "payments";

CREATE UNIQUE INDEX "payments_idempotencyKey_key" ON "payments"("idempotencyKey");
CREATE INDEX "payments_sourcePaymentId_idx" ON "payments"("sourcePaymentId");
CREATE INDEX "payments_customerName_idx" ON "payments"("customerName");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
