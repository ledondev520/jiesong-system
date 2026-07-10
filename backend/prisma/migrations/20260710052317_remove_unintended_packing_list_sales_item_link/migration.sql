/*
  Warnings:

  - You are about to drop the column `salesItemId` on the `packing_list_checks` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_packing_list_checks" (
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
    CONSTRAINT "packing_list_checks_salesContractId_fkey" FOREIGN KEY ("salesContractId") REFERENCES "sales_contracts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "packing_list_checks_salesContractFileId_fkey" FOREIGN KEY ("salesContractFileId") REFERENCES "sales_contract_files" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "packing_list_checks_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "packing_list_checks_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_packing_list_checks" ("automaticStatus", "checkedAt", "checkedById", "createdAt", "fieldMismatched", "id", "itemCheckMismatched", "parserVersion", "resultJson", "reviewNote", "reviewedAt", "reviewedById", "salesContractFileId", "salesContractId", "status", "summaryJson", "updatedAt") SELECT "automaticStatus", "checkedAt", "checkedById", "createdAt", "fieldMismatched", "id", "itemCheckMismatched", "parserVersion", "resultJson", "reviewNote", "reviewedAt", "reviewedById", "salesContractFileId", "salesContractId", "status", "summaryJson", "updatedAt" FROM "packing_list_checks";
DROP TABLE "packing_list_checks";
ALTER TABLE "new_packing_list_checks" RENAME TO "packing_list_checks";
CREATE INDEX "packing_list_checks_salesContractId_checkedAt_idx" ON "packing_list_checks"("salesContractId", "checkedAt");
CREATE INDEX "packing_list_checks_salesContractFileId_idx" ON "packing_list_checks"("salesContractFileId");
CREATE INDEX "packing_list_checks_status_idx" ON "packing_list_checks"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
