-- CreateTable
CREATE TABLE "customs_declarations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "declarationNo" TEXT NOT NULL,
    "salesContractId" TEXT NOT NULL,
    "declaredAt" DATETIME,
    "exportDate" DATETIME,
    "customsBroker" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "exchangeRate" REAL,
    "totalAmount" REAL NOT NULL DEFAULT 0,
    "totalQuantity" REAL NOT NULL DEFAULT 0,
    "totalNetWeight" REAL NOT NULL DEFAULT 0,
    "totalGrossWeight" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "customs_declarations_salesContractId_fkey" FOREIGN KEY ("salesContractId") REFERENCES "sales_contracts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "customs_declaration_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customsDeclarationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "packingItemId" TEXT,
    "taxRateId" TEXT,
    "itemNo" INTEGER,
    "customsName" TEXT NOT NULL,
    "hsCode" TEXT,
    "declarationElements" TEXT,
    "quantity" REAL NOT NULL,
    "unit" TEXT,
    "unitPrice" REAL,
    "totalPrice" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "customs_declaration_items_customsDeclarationId_fkey" FOREIGN KEY ("customsDeclarationId") REFERENCES "customs_declarations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "customs_declaration_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "customs_declaration_items_packingItemId_fkey" FOREIGN KEY ("packingItemId") REFERENCES "packing_items" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "customs_declaration_items_taxRateId_fkey" FOREIGN KEY ("taxRateId") REFERENCES "tax_rates" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "forex_verifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "verificationNo" TEXT NOT NULL,
    "salesContractId" TEXT NOT NULL,
    "customsDeclarationId" TEXT,
    "bankName" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "receivedAmount" REAL NOT NULL,
    "settledAmount" REAL,
    "exchangeRate" REAL,
    "verifiedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "forex_verifications_salesContractId_fkey" FOREIGN KEY ("salesContractId") REFERENCES "sales_contracts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "forex_verifications_customsDeclarationId_fkey" FOREIGN KEY ("customsDeclarationId") REFERENCES "customs_declarations" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tax_refunds" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "refundNo" TEXT NOT NULL,
    "salesContractId" TEXT NOT NULL,
    "customsDeclarationId" TEXT NOT NULL,
    "forexVerificationId" TEXT,
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

-- CreateTable
CREATE TABLE "tax_rates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "hsCode" TEXT,
    "purchaseTaxRate" REAL NOT NULL DEFAULT 13,
    "refundRate" REAL NOT NULL,
    "effectiveFrom" DATETIME NOT NULL,
    "effectiveTo" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "tax_rates_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "customs_declarations_declarationNo_key" ON "customs_declarations"("declarationNo");

-- CreateIndex
CREATE INDEX "customs_declarations_salesContractId_idx" ON "customs_declarations"("salesContractId");

-- CreateIndex
CREATE INDEX "customs_declaration_items_customsDeclarationId_idx" ON "customs_declaration_items"("customsDeclarationId");

-- CreateIndex
CREATE INDEX "customs_declaration_items_productId_idx" ON "customs_declaration_items"("productId");

-- CreateIndex
CREATE INDEX "customs_declaration_items_packingItemId_idx" ON "customs_declaration_items"("packingItemId");

-- CreateIndex
CREATE INDEX "customs_declaration_items_taxRateId_idx" ON "customs_declaration_items"("taxRateId");

-- CreateIndex
CREATE UNIQUE INDEX "forex_verifications_verificationNo_key" ON "forex_verifications"("verificationNo");

-- CreateIndex
CREATE INDEX "forex_verifications_salesContractId_idx" ON "forex_verifications"("salesContractId");

-- CreateIndex
CREATE INDEX "forex_verifications_customsDeclarationId_idx" ON "forex_verifications"("customsDeclarationId");

-- CreateIndex
CREATE UNIQUE INDEX "tax_refunds_refundNo_key" ON "tax_refunds"("refundNo");

-- CreateIndex
CREATE INDEX "tax_refunds_salesContractId_idx" ON "tax_refunds"("salesContractId");

-- CreateIndex
CREATE INDEX "tax_refunds_customsDeclarationId_idx" ON "tax_refunds"("customsDeclarationId");

-- CreateIndex
CREATE INDEX "tax_refunds_forexVerificationId_idx" ON "tax_refunds"("forexVerificationId");

-- CreateIndex
CREATE INDEX "tax_rates_productId_isActive_idx" ON "tax_rates"("productId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "tax_rates_productId_effectiveFrom_key" ON "tax_rates"("productId", "effectiveFrom");
