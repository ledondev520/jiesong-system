-- AlterTable
ALTER TABLE "invoice_records" ADD COLUMN "matchSource" TEXT;

-- Conservative backfill: only MATCHED rows with a score below 100 are provably automatic
-- (manualMatch always wrote 100). Score 100 or null score stays MANUAL, i.e. never re-matched.
UPDATE "invoice_records" SET "matchSource" = CASE
  WHEN "matchScore" IS NOT NULL AND "matchScore" < 100 THEN 'AUTO'
  ELSE 'MANUAL'
END WHERE "matchStatus" = 'MATCHED';
