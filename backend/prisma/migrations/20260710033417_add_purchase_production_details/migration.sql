-- AlterTable
ALTER TABLE "purchase_contracts" ADD COLUMN "productionCompletedAt" DATETIME;

-- AlterTable
ALTER TABLE "purchase_items" ADD COLUMN "boxes" INTEGER;
ALTER TABLE "purchase_items" ADD COLUMN "grossWeight" REAL;
ALTER TABLE "purchase_items" ADD COLUMN "height" REAL;
ALTER TABLE "purchase_items" ADD COLUMN "length" REAL;
ALTER TABLE "purchase_items" ADD COLUMN "netWeight" REAL;
ALTER TABLE "purchase_items" ADD COLUMN "volume" REAL;
ALTER TABLE "purchase_items" ADD COLUMN "width" REAL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_packing_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "salesContractId" TEXT NOT NULL,
    "purchaseItemId" TEXT,
    "productId" TEXT NOT NULL,
    "storeId" TEXT,
    "isOwnedByJiesong" BOOLEAN NOT NULL DEFAULT true,
    "sourceParty" TEXT,
    "quantity" REAL NOT NULL,
    "unit" TEXT,
    "boxes" INTEGER,
    "grossWeight" REAL,
    "netWeight" REAL,
    "volume" REAL,
    "unitPrice" REAL,
    "totalPrice" REAL,
    "supplement" TEXT,
    "specification" TEXT,
    "manufacturer" TEXT,
    "invoiceNo" TEXT,
    "purchaseContractNo" TEXT,
    "purchaseCost" REAL,
    "hsMatchConfidence" REAL,
    "hsMatchMethod" TEXT,
    "length" REAL,
    "width" REAL,
    "height" REAL,
    "posX" REAL,
    "posY" REAL,
    "posZ" REAL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "packing_items_salesContractId_fkey" FOREIGN KEY ("salesContractId") REFERENCES "sales_contracts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "packing_items_purchaseItemId_fkey" FOREIGN KEY ("purchaseItemId") REFERENCES "purchase_items" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "packing_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "packing_items_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_packing_items" ("boxes", "createdAt", "grossWeight", "height", "hsMatchConfidence", "hsMatchMethod", "id", "invoiceNo", "isOwnedByJiesong", "length", "manufacturer", "netWeight", "note", "posX", "posY", "posZ", "productId", "purchaseContractNo", "purchaseCost", "quantity", "salesContractId", "sourceParty", "specification", "storeId", "supplement", "totalPrice", "unit", "unitPrice", "updatedAt", "volume", "width") SELECT "boxes", "createdAt", "grossWeight", "height", "hsMatchConfidence", "hsMatchMethod", "id", "invoiceNo", "isOwnedByJiesong", "length", "manufacturer", "netWeight", "note", "posX", "posY", "posZ", "productId", "purchaseContractNo", "purchaseCost", "quantity", "salesContractId", "sourceParty", "specification", "storeId", "supplement", "totalPrice", "unit", "unitPrice", "updatedAt", "volume", "width" FROM "packing_items";
DROP TABLE "packing_items";
ALTER TABLE "new_packing_items" RENAME TO "packing_items";
CREATE INDEX "packing_items_salesContractId_idx" ON "packing_items"("salesContractId");
CREATE INDEX "packing_items_purchaseItemId_idx" ON "packing_items"("purchaseItemId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
