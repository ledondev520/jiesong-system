-- CreateTable
CREATE TABLE "hs_codes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hsCode" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "taxRate" REAL NOT NULL,
    "unit" TEXT,
    "note" TEXT,
    "effectiveDate" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "hs_codes_hsCode_key" ON "hs_codes"("hsCode");

-- CreateIndex
CREATE INDEX "hs_codes_productName_idx" ON "hs_codes"("productName");
