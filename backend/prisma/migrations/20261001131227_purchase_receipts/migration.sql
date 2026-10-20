-- CreateTable
CREATE TABLE "purchase_receipts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseContractId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "arrivedAt" DATETIME NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "purchase_receipts_purchaseContractId_fkey" FOREIGN KEY ("purchaseContractId") REFERENCES "purchase_contracts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "purchase_receipts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "purchase_receipt_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "receiptId" TEXT NOT NULL,
    "purchaseItemId" TEXT NOT NULL,
    "arrivedQuantity" REAL NOT NULL,
    "acceptedQuantity" REAL NOT NULL DEFAULT 0,
    "reinspectionQuantity" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "purchase_receipt_items_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "purchase_receipts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "purchase_receipt_items_purchaseItemId_fkey" FOREIGN KEY ("purchaseItemId") REFERENCES "purchase_items" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "purchase_receipt_inspections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "receiptId" TEXT NOT NULL,
    "receiptItemId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "acceptedQuantity" REAL NOT NULL,
    "acceptedIncrement" REAL NOT NULL,
    "reinspectionQuantity" REAL NOT NULL,
    "pendingQuantity" REAL NOT NULL,
    "note" TEXT NOT NULL,
    "inspectedById" TEXT NOT NULL,
    "inspectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "purchase_receipt_inspections_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "purchase_receipts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "purchase_receipt_inspections_receiptItemId_fkey" FOREIGN KEY ("receiptItemId") REFERENCES "purchase_receipt_items" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "purchase_receipt_inspections_inspectedById_fkey" FOREIGN KEY ("inspectedById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_inventories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "purchaseItemId" TEXT,
    "receiptInspectionId" TEXT,
    "salesItemId" TEXT,
    "salesContractId" TEXT,
    "quantity" REAL NOT NULL,
    "unit" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PRODUCING',
    "inboundAt" DATETIME,
    "outboundAt" DATETIME,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "inventories_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "inventories_purchaseItemId_fkey" FOREIGN KEY ("purchaseItemId") REFERENCES "purchase_items" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "inventories_receiptInspectionId_fkey" FOREIGN KEY ("receiptInspectionId") REFERENCES "purchase_receipt_inspections" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "inventories_salesItemId_fkey" FOREIGN KEY ("salesItemId") REFERENCES "sales_items" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "inventories_salesContractId_fkey" FOREIGN KEY ("salesContractId") REFERENCES "sales_contracts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_inventories" ("createdAt", "id", "inboundAt", "note", "outboundAt", "productId", "purchaseItemId", "quantity", "salesContractId", "salesItemId", "status", "unit", "updatedAt") SELECT "createdAt", "id", "inboundAt", "note", "outboundAt", "productId", "purchaseItemId", "quantity", "salesContractId", "salesItemId", "status", "unit", "updatedAt" FROM "inventories";
DROP TABLE "inventories";
ALTER TABLE "new_inventories" RENAME TO "inventories";
CREATE INDEX "inventories_status_idx" ON "inventories"("status");
CREATE INDEX "inventories_productId_idx" ON "inventories"("productId");
CREATE INDEX "inventories_salesContractId_idx" ON "inventories"("salesContractId");
CREATE INDEX "inventories_receiptInspectionId_idx" ON "inventories"("receiptInspectionId");
CREATE INDEX "inventories_createdAt_idx" ON "inventories"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "purchase_receipts_purchaseContractId_arrivedAt_idx" ON "purchase_receipts"("purchaseContractId", "arrivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_receipts_purchaseContractId_requestId_key" ON "purchase_receipts"("purchaseContractId", "requestId");

-- CreateIndex
CREATE INDEX "purchase_receipt_items_purchaseItemId_idx" ON "purchase_receipt_items"("purchaseItemId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_receipt_items_receiptId_purchaseItemId_key" ON "purchase_receipt_items"("receiptId", "purchaseItemId");

-- CreateIndex
CREATE INDEX "purchase_receipt_inspections_receiptItemId_inspectedAt_idx" ON "purchase_receipt_inspections"("receiptItemId", "inspectedAt");

-- CreateIndex
CREATE INDEX "purchase_receipt_inspections_receiptId_inspectedAt_idx" ON "purchase_receipt_inspections"("receiptId", "inspectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_receipt_inspections_receiptId_requestId_receiptItemId_key" ON "purchase_receipt_inspections"("receiptId", "requestId", "receiptItemId");
