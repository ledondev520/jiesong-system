-- CreateTable
CREATE TABLE "packing_list_checks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "salesContractId" TEXT NOT NULL,
    "salesContractFileId" TEXT NOT NULL,
    "checkedById" TEXT,
    "reviewedById" TEXT,
    "automaticStatus" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "summaryJson" TEXT NOT NULL,
    "resultJson" TEXT,
    "fieldMismatched" INTEGER NOT NULL DEFAULT 0,
    "itemCheckMismatched" INTEGER NOT NULL DEFAULT 0,
    "parserVersion" TEXT NOT NULL DEFAULT '2026-07',
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    "reviewNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "salesItemId" TEXT,
    CONSTRAINT "packing_list_checks_salesContractId_fkey" FOREIGN KEY ("salesContractId") REFERENCES "sales_contracts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "packing_list_checks_salesContractFileId_fkey" FOREIGN KEY ("salesContractFileId") REFERENCES "sales_contract_files" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "packing_list_checks_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "packing_list_checks_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "packing_list_checks_salesItemId_fkey" FOREIGN KEY ("salesItemId") REFERENCES "sales_items" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "packing_list_checks_salesContractId_checkedAt_idx" ON "packing_list_checks"("salesContractId", "checkedAt");

-- CreateIndex
CREATE INDEX "packing_list_checks_salesContractFileId_idx" ON "packing_list_checks"("salesContractFileId");

-- CreateIndex
CREATE INDEX "packing_list_checks_status_idx" ON "packing_list_checks"("status");
