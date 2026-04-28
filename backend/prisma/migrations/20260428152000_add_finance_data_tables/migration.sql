-- CreateTable
CREATE TABLE "finance_data_batches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "recordCount" INTEGER NOT NULL,
    "dataStartDate" TEXT,
    "dataEndDate" TEXT,
    "note" TEXT,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bank_transactions_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "finance_data_batches" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "invoice_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "invNo" TEXT,
    "invCode" TEXT,
    "seller" TEXT NOT NULL,
    "sellerTaxId" TEXT,
    "buyer" TEXT,
    "buyerTaxId" TEXT,
    "invDate" TEXT NOT NULL,
    "invDateFull" TEXT,
    "itemName" TEXT,
    "spec" TEXT,
    "unit" TEXT,
    "qty" REAL,
    "unitPrice" REAL,
    "amount" REAL NOT NULL,
    "taxRate" TEXT,
    "tax" REAL NOT NULL,
    "total" REAL NOT NULL,
    "invoiceType" TEXT,
    "status" TEXT NOT NULL,
    "isPositive" TEXT NOT NULL,
    "riskLevel" TEXT,
    "issuer" TEXT,
    "remark" TEXT,
    "taxClassCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invoice_records_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "finance_data_batches" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "bank_transactions_batchId_idx" ON "bank_transactions"("batchId");

-- CreateIndex
CREATE INDEX "bank_transactions_txnDate_idx" ON "bank_transactions"("txnDate");

-- CreateIndex
CREATE INDEX "bank_transactions_counterpart_idx" ON "bank_transactions"("counterpart");

-- CreateIndex
CREATE INDEX "bank_transactions_direction_idx" ON "bank_transactions"("direction");

-- CreateIndex
CREATE INDEX "invoice_records_batchId_idx" ON "invoice_records"("batchId");

-- CreateIndex
CREATE INDEX "invoice_records_invDate_idx" ON "invoice_records"("invDate");

-- CreateIndex
CREATE INDEX "invoice_records_seller_idx" ON "invoice_records"("seller");

-- CreateIndex
CREATE INDEX "invoice_records_status_idx" ON "invoice_records"("status");
