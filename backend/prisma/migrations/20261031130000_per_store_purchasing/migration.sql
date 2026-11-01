-- AlterTable purchase_items
ALTER TABLE "purchase_items" ADD COLUMN "storeId" TEXT REFERENCES "stores" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "purchase_items_storeId_idx" ON "purchase_items"("storeId");

-- AlterTable purchase_contracts
ALTER TABLE "purchase_contracts" ADD COLUMN "salesContractId" TEXT REFERENCES "sales_contracts" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "purchase_contracts_salesContractId_idx" ON "purchase_contracts"("salesContractId");
