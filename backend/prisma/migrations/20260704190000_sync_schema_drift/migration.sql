-- AlterTable
ALTER TABLE "packing_items" ADD COLUMN "hsMatchConfidence" REAL;
ALTER TABLE "packing_items" ADD COLUMN "hsMatchMethod" TEXT;
ALTER TABLE "packing_items" ADD COLUMN "invoiceNo" TEXT;
ALTER TABLE "packing_items" ADD COLUMN "manufacturer" TEXT;
ALTER TABLE "packing_items" ADD COLUMN "purchaseContractNo" TEXT;
ALTER TABLE "packing_items" ADD COLUMN "purchaseCost" REAL;
ALTER TABLE "packing_items" ADD COLUMN "specification" TEXT;
ALTER TABLE "packing_items" ADD COLUMN "supplement" TEXT;

-- AlterTable
ALTER TABLE "sales_contracts" ADD COLUMN "containerLabel" TEXT;

-- AlterTable
ALTER TABLE "token_usages" ADD COLUMN "promptBrief" TEXT;

-- CreateTable
CREATE TABLE "customs_brokers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "financial_periods" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "reportDate" DATETIME NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "balance_sheet_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "periodId" TEXT NOT NULL,
    "cashAndEquivalents" REAL,
    "shortTermInvestments" REAL,
    "accountsReceivable" REAL,
    "prepaidExpenses" REAL,
    "otherReceivables" REAL,
    "inventory" REAL,
    "totalCurrentAssets" REAL,
    "totalNonCurrentAssets" REAL,
    "totalAssets" REAL,
    "accountsPayable" REAL,
    "advancedReceipts" REAL,
    "staffWagesPayable" REAL,
    "taxesPayable" REAL,
    "otherPayables" REAL,
    "totalCurrentLiabilities" REAL,
    "totalNonCurrentLiabilities" REAL,
    "totalLiabilities" REAL,
    "paidInCapital" REAL,
    "capitalReserve" REAL,
    "surplusReserve" REAL,
    "retainedEarnings" REAL,
    "totalEquity" REAL,
    CONSTRAINT "balance_sheet_entries_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "financial_periods" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "income_statement_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "periodId" TEXT NOT NULL,
    "revenueMonth" REAL,
    "costOfSalesMonth" REAL,
    "taxesMonth" REAL,
    "sellingExpensesMonth" REAL,
    "adminExpensesMonth" REAL,
    "financialExpensesMonth" REAL,
    "investmentIncomeMonth" REAL,
    "operatingProfitMonth" REAL,
    "nonOperatingIncomeMonth" REAL,
    "nonOperatingExpensesMonth" REAL,
    "totalProfitMonth" REAL,
    "incomeTaxMonth" REAL,
    "netProfitMonth" REAL,
    "revenueYTD" REAL,
    "costOfSalesYTD" REAL,
    "taxesYTD" REAL,
    "sellingExpensesYTD" REAL,
    "adminExpensesYTD" REAL,
    "financialExpensesYTD" REAL,
    "investmentIncomeYTD" REAL,
    "operatingProfitYTD" REAL,
    "nonOperatingIncomeYTD" REAL,
    "nonOperatingExpensesYTD" REAL,
    "totalProfitYTD" REAL,
    "incomeTaxYTD" REAL,
    "netProfitYTD" REAL,
    CONSTRAINT "income_statement_entries_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "financial_periods" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "contract_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "supplierId" TEXT,
    "taxRate" INTEGER,
    "note" TEXT,
    "items" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ai_usage_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "userName" TEXT,
    "action" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_bank_transactions" (
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
    "matchedContractId" TEXT,
    "matchedContractType" TEXT,
    "matchScore" REAL,
    "matchStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "matchedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bank_transactions_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "finance_data_batches" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_bank_transactions" ("amount", "balance", "batchId", "counterpart", "createdAt", "direction", "id", "payee", "payer", "summary", "txnDate", "txnId", "txnTime", "txnType") SELECT "amount", "balance", "batchId", "counterpart", "createdAt", "direction", "id", "payee", "payer", "summary", "txnDate", "txnId", "txnTime", "txnType" FROM "bank_transactions";
DROP TABLE "bank_transactions";
ALTER TABLE "new_bank_transactions" RENAME TO "bank_transactions";
CREATE INDEX "bank_transactions_batchId_idx" ON "bank_transactions"("batchId");
CREATE INDEX "bank_transactions_txnDate_idx" ON "bank_transactions"("txnDate");
CREATE INDEX "bank_transactions_counterpart_idx" ON "bank_transactions"("counterpart");
CREATE INDEX "bank_transactions_direction_idx" ON "bank_transactions"("direction");
CREATE INDEX "bank_transactions_matchStatus_idx" ON "bank_transactions"("matchStatus");
CREATE INDEX "bank_transactions_matchedContractId_idx" ON "bank_transactions"("matchedContractId");
CREATE TABLE "new_contract_files" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseContractId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT '',
    "fileSize" INTEGER NOT NULL,
    "description" TEXT,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contract_files_purchaseContractId_fkey" FOREIGN KEY ("purchaseContractId") REFERENCES "purchase_contracts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_contract_files" ("fileName", "filePath", "fileSize", "fileType", "id", "purchaseContractId", "uploadedAt") SELECT "fileName", "filePath", "fileSize", "fileType", "id", "purchaseContractId", "uploadedAt" FROM "contract_files";
DROP TABLE "contract_files";
ALTER TABLE "new_contract_files" RENAME TO "contract_files";
CREATE TABLE "new_invoice_records" (
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
    "matchedContractId" TEXT,
    "matchedContractType" TEXT,
    "matchScore" REAL,
    "matchStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "matchedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invoice_records_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "finance_data_batches" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_invoice_records" ("amount", "batchId", "buyer", "buyerTaxId", "createdAt", "id", "invCode", "invDate", "invDateFull", "invNo", "invoiceType", "isPositive", "issuer", "itemName", "qty", "remark", "riskLevel", "seller", "sellerTaxId", "spec", "status", "tax", "taxClassCode", "taxRate", "total", "unit", "unitPrice") SELECT "amount", "batchId", "buyer", "buyerTaxId", "createdAt", "id", "invCode", "invDate", "invDateFull", "invNo", "invoiceType", "isPositive", "issuer", "itemName", "qty", "remark", "riskLevel", "seller", "sellerTaxId", "spec", "status", "tax", "taxClassCode", "taxRate", "total", "unit", "unitPrice" FROM "invoice_records";
DROP TABLE "invoice_records";
ALTER TABLE "new_invoice_records" RENAME TO "invoice_records";
CREATE INDEX "invoice_records_batchId_idx" ON "invoice_records"("batchId");
CREATE INDEX "invoice_records_invDate_idx" ON "invoice_records"("invDate");
CREATE INDEX "invoice_records_seller_idx" ON "invoice_records"("seller");
CREATE INDEX "invoice_records_status_idx" ON "invoice_records"("status");
CREATE INDEX "invoice_records_matchStatus_idx" ON "invoice_records"("matchStatus");
CREATE INDEX "invoice_records_matchedContractId_idx" ON "invoice_records"("matchedContractId");
CREATE TABLE "new_notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "link" TEXT,
    "metadata" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_notifications" ("content", "createdAt", "id", "isRead", "metadata", "title", "type", "userId") SELECT "content", "createdAt", "id", "isRead", "metadata", "title", "type", "userId" FROM "notifications";
DROP TABLE "notifications";
ALTER TABLE "new_notifications" RENAME TO "notifications";
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");
CREATE TABLE "new_operation_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorType" TEXT NOT NULL DEFAULT 'USER',
    "userId" TEXT,
    "agentAccountId" TEXT,
    "agentCredentialId" TEXT,
    "requestId" TEXT,
    "idempotencyKey" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "operation_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "operation_logs_agentAccountId_fkey" FOREIGN KEY ("agentAccountId") REFERENCES "agent_accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "operation_logs_agentCredentialId_fkey" FOREIGN KEY ("agentCredentialId") REFERENCES "agent_credentials" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_operation_logs" ("action", "actorType", "agentAccountId", "agentCredentialId", "createdAt", "entity", "entityId", "id", "idempotencyKey", "ipAddress", "newValue", "oldValue", "requestId", "userAgent", "userId") SELECT "action", "actorType", "agentAccountId", "agentCredentialId", "createdAt", "entity", "entityId", "id", "idempotencyKey", "ipAddress", "newValue", "oldValue", "requestId", "userAgent", "userId" FROM "operation_logs";
DROP TABLE "operation_logs";
ALTER TABLE "new_operation_logs" RENAME TO "operation_logs";
CREATE INDEX "operation_logs_userId_idx" ON "operation_logs"("userId");
CREATE INDEX "operation_logs_actorType_idx" ON "operation_logs"("actorType");
CREATE INDEX "operation_logs_agentAccountId_idx" ON "operation_logs"("agentAccountId");
CREATE INDEX "operation_logs_agentCredentialId_idx" ON "operation_logs"("agentCredentialId");
CREATE INDEX "operation_logs_entity_entityId_idx" ON "operation_logs"("entity", "entityId");
CREATE INDEX "operation_logs_createdAt_idx" ON "operation_logs"("createdAt");
CREATE TABLE "new_sales_contract_files" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "salesContractId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT '',
    "fileSize" INTEGER NOT NULL,
    "description" TEXT,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sales_contract_files_salesContractId_fkey" FOREIGN KEY ("salesContractId") REFERENCES "sales_contracts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_sales_contract_files" ("fileName", "filePath", "fileSize", "fileType", "id", "salesContractId", "uploadedAt") SELECT "fileName", "filePath", "fileSize", "fileType", "id", "salesContractId", "uploadedAt" FROM "sales_contract_files";
DROP TABLE "sales_contract_files";
ALTER TABLE "new_sales_contract_files" RENAME TO "sales_contract_files";
CREATE INDEX "sales_contract_files_salesContractId_idx" ON "sales_contract_files"("salesContractId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "financial_periods_year_month_key" ON "financial_periods"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "balance_sheet_entries_periodId_key" ON "balance_sheet_entries"("periodId");

-- CreateIndex
CREATE UNIQUE INDEX "income_statement_entries_periodId_key" ON "income_statement_entries"("periodId");

-- CreateIndex
CREATE INDEX "contract_templates_type_idx" ON "contract_templates"("type");

-- CreateIndex
CREATE INDEX "contract_templates_createdBy_idx" ON "contract_templates"("createdBy");

-- CreateIndex
CREATE INDEX "ai_usage_logs_userId_idx" ON "ai_usage_logs"("userId");

-- CreateIndex
CREATE INDEX "ai_usage_logs_action_idx" ON "ai_usage_logs"("action");

-- CreateIndex
CREATE INDEX "ai_usage_logs_createdAt_idx" ON "ai_usage_logs"("createdAt");

-- CreateIndex
CREATE INDEX "purchase_contracts_status_idx" ON "purchase_contracts"("status");

-- CreateIndex
CREATE INDEX "purchase_contracts_supplierId_idx" ON "purchase_contracts"("supplierId");

-- CreateIndex
CREATE INDEX "purchase_contracts_createdAt_idx" ON "purchase_contracts"("createdAt");

