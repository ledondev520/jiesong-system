-- AlterTable
ALTER TABLE "hs_codes" ADD COLUMN "agreementRatesJson" TEXT;
ALTER TABLE "hs_codes" ADD COLUMN "basicInfoJson" TEXT;
ALTER TABLE "hs_codes" ADD COLUMN "chapterHierarchyJson" TEXT;
ALTER TABLE "hs_codes" ADD COLUMN "ciqCodesJson" TEXT;
ALTER TABLE "hs_codes" ADD COLUMN "declarationElements" TEXT;
ALTER TABLE "hs_codes" ADD COLUMN "exportTaxRate" REAL;
ALTER TABLE "hs_codes" ADD COLUMN "fetchedAt" DATETIME;
ALTER TABLE "hs_codes" ADD COLUMN "inspectionQuarantine" TEXT;
ALTER TABLE "hs_codes" ADD COLUMN "rawPayloadJson" TEXT;
ALTER TABLE "hs_codes" ADD COLUMN "rcepRatesJson" TEXT;
ALTER TABLE "hs_codes" ADD COLUMN "refundRate" REAL;
ALTER TABLE "hs_codes" ADD COLUMN "sourceUrl" TEXT;
ALTER TABLE "hs_codes" ADD COLUMN "supervisionConditions" TEXT;
ALTER TABLE "hs_codes" ADD COLUMN "taxInfoJson" TEXT;
ALTER TABLE "hs_codes" ADD COLUMN "title" TEXT;
ALTER TABLE "hs_codes" ADD COLUMN "vatRate" REAL;
