-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN "bankAccountName" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "bankBranch" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "bankCode" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_contract_files" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseContractId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT '',
    "fileSize" INTEGER NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "checksum" TEXT,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contract_files_purchaseContractId_fkey" FOREIGN KEY ("purchaseContractId") REFERENCES "purchase_contracts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_contract_files" ("description", "fileName", "filePath", "fileSize", "fileType", "id", "mimeType", "purchaseContractId", "uploadedAt") SELECT "description", "fileName", "filePath", "fileSize", "fileType", "id", "mimeType", "purchaseContractId", "uploadedAt" FROM "contract_files";
DROP TABLE "contract_files";
ALTER TABLE "new_contract_files" RENAME TO "contract_files";
CREATE INDEX "contract_files_purchaseContractId_idx" ON "contract_files"("purchaseContractId");
CREATE INDEX "contract_files_category_idx" ON "contract_files"("category");
CREATE TABLE "new_sales_contract_files" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "salesContractId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT '',
    "fileSize" INTEGER NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "checksum" TEXT,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sales_contract_files_salesContractId_fkey" FOREIGN KEY ("salesContractId") REFERENCES "sales_contracts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_sales_contract_files" ("description", "fileName", "filePath", "fileSize", "fileType", "id", "mimeType", "salesContractId", "uploadedAt") SELECT "description", "fileName", "filePath", "fileSize", "fileType", "id", "mimeType", "salesContractId", "uploadedAt" FROM "sales_contract_files";
DROP TABLE "sales_contract_files";
ALTER TABLE "new_sales_contract_files" RENAME TO "sales_contract_files";
CREATE INDEX "sales_contract_files_salesContractId_idx" ON "sales_contract_files"("salesContractId");
CREATE INDEX "sales_contract_files_category_idx" ON "sales_contract_files"("category");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
