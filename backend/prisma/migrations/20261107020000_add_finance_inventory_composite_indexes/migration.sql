-- CreateIndex
CREATE INDEX "bank_transactions_currency_matchStatus_direction_idx" ON "bank_transactions"("currency", "matchStatus", "direction");

-- CreateIndex
CREATE INDEX "bank_transactions_currency_txnDate_idx" ON "bank_transactions"("currency", "txnDate");

-- CreateIndex
CREATE INDEX "inventories_productId_status_salesItemId_inboundAt_idx" ON "inventories"("productId", "status", "salesItemId", "inboundAt");

-- CreateIndex
CREATE INDEX "invoice_records_matchStatus_status_isPositive_idx" ON "invoice_records"("matchStatus", "status", "isPositive");

-- CreateIndex
CREATE INDEX "invoice_records_seller_status_isPositive_idx" ON "invoice_records"("seller", "status", "isPositive");

-- CreateIndex
CREATE INDEX "payments_purchaseContractId_type_currency_idx" ON "payments"("purchaseContractId", "type", "currency");

-- CreateIndex
CREATE INDEX "payments_salesContractId_type_currency_idx" ON "payments"("salesContractId", "type", "currency");

-- CreateIndex
CREATE INDEX "payments_type_paymentDate_idx" ON "payments"("type", "paymentDate");
