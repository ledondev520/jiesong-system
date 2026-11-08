-- AlterTable
ALTER TABLE "inventories" ADD COLUMN "lotNo" TEXT;
ALTER TABLE "inventories" ADD COLUMN "binLocation" TEXT;

-- CreateIndex
CREATE INDEX "inventories_lotNo_idx" ON "inventories"("lotNo");

-- CreateIndex
CREATE INDEX "inventories_binLocation_idx" ON "inventories"("binLocation");
