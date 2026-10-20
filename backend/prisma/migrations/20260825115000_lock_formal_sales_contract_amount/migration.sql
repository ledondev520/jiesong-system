ALTER TABLE "sales_contracts" ADD COLUMN "amountSource" TEXT NOT NULL DEFAULT 'DERIVED';
ALTER TABLE "sales_contracts" ADD COLUMN "amountVerifiedAt" DATETIME;

CREATE INDEX "sales_contracts_amountSource_idx" ON "sales_contracts"("amountSource");
