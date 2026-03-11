-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_tax_refunds" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "refundNo" TEXT NOT NULL,
    "salesContractId" TEXT NOT NULL,
    "customsDeclarationId" TEXT NOT NULL,
    "forexVerificationId" TEXT,
    "relation_no" TEXT,
    "invoice_no" TEXT,
    "vat_rate_type" INTEGER,
    "match_status" TEXT NOT NULL DEFAULT 'pending',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "declaredAmount" REAL NOT NULL DEFAULT 0,
    "refundableAmount" REAL NOT NULL DEFAULT 0,
    "refundedAmount" REAL NOT NULL DEFAULT 0,
    "appliedAt" DATETIME,
    "refundedAt" DATETIME,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "tax_refunds_salesContractId_fkey" FOREIGN KEY ("salesContractId") REFERENCES "sales_contracts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tax_refunds_customsDeclarationId_fkey" FOREIGN KEY ("customsDeclarationId") REFERENCES "customs_declarations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tax_refunds_forexVerificationId_fkey" FOREIGN KEY ("forexVerificationId") REFERENCES "forex_verifications" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_tax_refunds" ("appliedAt", "createdAt", "customsDeclarationId", "declaredAmount", "forexVerificationId", "id", "note", "refundNo", "refundableAmount", "refundedAmount", "refundedAt", "salesContractId", "status", "updatedAt") SELECT "appliedAt", "createdAt", "customsDeclarationId", "declaredAmount", "forexVerificationId", "id", "note", "refundNo", "refundableAmount", "refundedAmount", "refundedAt", "salesContractId", "status", "updatedAt" FROM "tax_refunds";
DROP TABLE "tax_refunds";
ALTER TABLE "new_tax_refunds" RENAME TO "tax_refunds";
CREATE UNIQUE INDEX "tax_refunds_refundNo_key" ON "tax_refunds"("refundNo");
CREATE INDEX "tax_refunds_salesContractId_idx" ON "tax_refunds"("salesContractId");
CREATE INDEX "tax_refunds_customsDeclarationId_idx" ON "tax_refunds"("customsDeclarationId");
CREATE INDEX "tax_refunds_forexVerificationId_idx" ON "tax_refunds"("forexVerificationId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
