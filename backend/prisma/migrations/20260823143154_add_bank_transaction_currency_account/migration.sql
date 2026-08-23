-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_bank_transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "bankName" TEXT,
    "accountNoMasked" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "txnTime" TEXT NOT NULL,
    "txnDate" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "payer" TEXT,
    "payee" TEXT,
    "summary" TEXT,
    "txnType" TEXT,
    "txnId" TEXT,
    "balance" REAL,
    "counterpart" TEXT,
    "direction" TEXT NOT NULL,
    "matchedContractId" TEXT,
    "matchedContractType" TEXT,
    "matchScore" REAL,
    "matchStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "matchedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bank_transactions_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "finance_data_batches" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_bank_transactions" ("amount", "balance", "batchId", "counterpart", "createdAt", "direction", "id", "matchScore", "matchStatus", "matchedAt", "matchedContractId", "matchedContractType", "payee", "payer", "summary", "txnDate", "txnId", "txnTime", "txnType") SELECT "amount", "balance", "batchId", "counterpart", "createdAt", "direction", "id", "matchScore", "matchStatus", "matchedAt", "matchedContractId", "matchedContractType", "payee", "payer", "summary", "txnDate", "txnId", "txnTime", "txnType" FROM "bank_transactions";
DROP TABLE "bank_transactions";
ALTER TABLE "new_bank_transactions" RENAME TO "bank_transactions";
CREATE INDEX "bank_transactions_batchId_idx" ON "bank_transactions"("batchId");
CREATE INDEX "bank_transactions_currency_accountNoMasked_txnDate_idx" ON "bank_transactions"("currency", "accountNoMasked", "txnDate");
CREATE INDEX "bank_transactions_txnDate_idx" ON "bank_transactions"("txnDate");
CREATE INDEX "bank_transactions_counterpart_idx" ON "bank_transactions"("counterpart");
CREATE INDEX "bank_transactions_direction_idx" ON "bank_transactions"("direction");
CREATE INDEX "bank_transactions_matchStatus_idx" ON "bank_transactions"("matchStatus");
CREATE INDEX "bank_transactions_matchedContractId_idx" ON "bank_transactions"("matchedContractId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
