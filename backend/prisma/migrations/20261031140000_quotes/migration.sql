-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quoteNo" TEXT NOT NULL,
    "customerId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "incoterm" TEXT NOT NULL DEFAULT 'FOB',
    "paymentTerms" TEXT,
    "portOfLoading" TEXT,
    "validUntil" DATETIME,
    "spotRate" REAL,
    "pricingRate" REAL,
    "pricingRevision" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalAmount" REAL NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "sentAt" DATETIME,
    "acceptedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "quotes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "quotes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "quotes_quoteNo_key" ON "quotes"("quoteNo");
CREATE INDEX "quotes_status_idx" ON "quotes"("status");
CREATE INDEX "quotes_customerId_idx" ON "quotes"("customerId");

-- CreateTable
CREATE TABLE "quote_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quoteId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "storeId" TEXT,
    "quantity" REAL NOT NULL,
    "unit" TEXT,
    "specification" TEXT,
    "costCny" REAL,
    "costSupplierId" TEXT,
    "costContractNo" TEXT,
    "markup" REAL,
    "formulaPrice" REAL,
    "unitPrice" REAL NOT NULL,
    "isManualPrice" BOOLEAN NOT NULL DEFAULT false,
    "totalPrice" REAL NOT NULL,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "quote_items_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "quote_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "quote_items_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "quote_items_quoteId_idx" ON "quote_items"("quoteId");
CREATE INDEX "quote_items_productId_idx" ON "quote_items"("productId");

-- AlterTable sales_contracts
ALTER TABLE "sales_contracts" ADD COLUMN "quoteId" TEXT REFERENCES "quotes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "sales_contracts_quoteId_key" ON "sales_contracts"("quoteId");
