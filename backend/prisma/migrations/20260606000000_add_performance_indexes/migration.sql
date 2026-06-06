-- CreateIndex
CREATE INDEX "sales_contracts_status_idx" ON "sales_contracts"("status");

-- CreateIndex
CREATE INDEX "sales_contracts_portId_idx" ON "sales_contracts"("portId");

-- CreateIndex
CREATE INDEX "sales_contracts_createdAt_idx" ON "sales_contracts"("createdAt");

-- CreateIndex
CREATE INDEX "inventories_status_idx" ON "inventories"("status");

-- CreateIndex
CREATE INDEX "inventories_productId_idx" ON "inventories"("productId");

-- CreateIndex
CREATE INDEX "inventories_salesContractId_idx" ON "inventories"("salesContractId");

-- CreateIndex
CREATE INDEX "inventories_createdAt_idx" ON "inventories"("createdAt");

-- CreateIndex
CREATE INDEX "purchase_items_purchaseContractId_idx" ON "purchase_items"("purchaseContractId");

-- CreateIndex
CREATE INDEX "purchase_items_productId_idx" ON "purchase_items"("productId");

-- CreateIndex
CREATE INDEX "sales_items_salesContractId_idx" ON "sales_items"("salesContractId");

-- CreateIndex
CREATE INDEX "sales_items_productId_idx" ON "sales_items"("productId");

-- CreateIndex
CREATE INDEX "payments_type_idx" ON "payments"("type");

-- CreateIndex
CREATE INDEX "payments_purchaseContractId_idx" ON "payments"("purchaseContractId");

-- CreateIndex
CREATE INDEX "payments_salesContractId_idx" ON "payments"("salesContractId");

-- CreateIndex
CREATE INDEX "payments_createdAt_idx" ON "payments"("createdAt");
