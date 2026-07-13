-- CreateTable
CREATE TABLE "cash_flow_statement_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "periodId" TEXT NOT NULL,
    "salesCashMonth" REAL,
    "otherOperatingCashInflowMonth" REAL,
    "purchaseCashPaidMonth" REAL,
    "employeeCashPaidMonth" REAL,
    "taxCashPaidMonth" REAL,
    "otherOperatingCashPaidMonth" REAL,
    "netOperatingCashFlowMonth" REAL,
    "netInvestingCashFlowMonth" REAL,
    "netFinancingCashFlowMonth" REAL,
    "netCashIncreaseMonth" REAL,
    "openingCashMonth" REAL,
    "endingCashMonth" REAL,
    "salesCashYTD" REAL,
    "otherOperatingCashInflowYTD" REAL,
    "purchaseCashPaidYTD" REAL,
    "employeeCashPaidYTD" REAL,
    "taxCashPaidYTD" REAL,
    "otherOperatingCashPaidYTD" REAL,
    "netOperatingCashFlowYTD" REAL,
    "netInvestingCashFlowYTD" REAL,
    "netFinancingCashFlowYTD" REAL,
    "netCashIncreaseYTD" REAL,
    "openingCashYTD" REAL,
    "endingCashYTD" REAL,
    CONSTRAINT "cash_flow_statement_entries_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "financial_periods" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "account_balance_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "periodId" TEXT NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "rowType" TEXT NOT NULL,
    "accountCode" TEXT,
    "accountName" TEXT NOT NULL,
    "openingDebit" REAL,
    "openingCredit" REAL,
    "periodDebit" REAL,
    "periodCredit" REAL,
    "yearDebit" REAL,
    "yearCredit" REAL,
    "endingDebit" REAL,
    "endingCredit" REAL,
    CONSTRAINT "account_balance_entries_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "financial_periods" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "general_ledger_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "periodId" TEXT NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "rowType" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "entryDate" DATETIME,
    "voucherNumber" TEXT,
    "summary" TEXT NOT NULL,
    "debit" REAL,
    "credit" REAL,
    "direction" TEXT,
    "balance" REAL,
    CONSTRAINT "general_ledger_entries_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "financial_periods" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "financial_data_sources" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "periodId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "financial_data_sources_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "financial_periods" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "cash_flow_statement_entries_periodId_key" ON "cash_flow_statement_entries"("periodId");

-- CreateIndex
CREATE INDEX "account_balance_entries_periodId_accountCode_idx" ON "account_balance_entries"("periodId", "accountCode");

-- CreateIndex
CREATE UNIQUE INDEX "account_balance_entries_periodId_sourceRow_key" ON "account_balance_entries"("periodId", "sourceRow");

-- CreateIndex
CREATE INDEX "general_ledger_entries_periodId_accountCode_entryDate_idx" ON "general_ledger_entries"("periodId", "accountCode", "entryDate");

-- CreateIndex
CREATE INDEX "general_ledger_entries_periodId_voucherNumber_idx" ON "general_ledger_entries"("periodId", "voucherNumber");

-- CreateIndex
CREATE UNIQUE INDEX "general_ledger_entries_periodId_sourceRow_key" ON "general_ledger_entries"("periodId", "sourceRow");

-- CreateIndex
CREATE INDEX "financial_data_sources_sha256_idx" ON "financial_data_sources"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "financial_data_sources_periodId_type_key" ON "financial_data_sources"("periodId", "type");
