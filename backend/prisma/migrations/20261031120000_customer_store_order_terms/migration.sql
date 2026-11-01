-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "country" TEXT,
    "address" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'USD',
    "defaultIncoterm" TEXT NOT NULL DEFAULT 'FOB',
    "defaultPaymentTerms" TEXT,
    "defaultPortOfLoading" TEXT,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "customers_name_key" ON "customers"("name");

-- AlterTable stores
ALTER TABLE "stores" ADD COLUMN "customerId" TEXT REFERENCES "customers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stores" ADD COLUMN "code" TEXT;
ALTER TABLE "stores" ADD COLUMN "legalName" TEXT;
CREATE UNIQUE INDEX "stores_code_key" ON "stores"("code");
CREATE INDEX "stores_customerId_idx" ON "stores"("customerId");

-- AlterTable sales_contracts
ALTER TABLE "sales_contracts" ADD COLUMN "customerId" TEXT REFERENCES "customers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_contracts" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "sales_contracts" ADD COLUMN "incoterm" TEXT;
ALTER TABLE "sales_contracts" ADD COLUMN "paymentTerms" TEXT;
ALTER TABLE "sales_contracts" ADD COLUMN "portOfLoading" TEXT;
CREATE INDEX "sales_contracts_customerId_idx" ON "sales_contracts"("customerId");
