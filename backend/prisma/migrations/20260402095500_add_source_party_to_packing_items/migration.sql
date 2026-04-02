ALTER TABLE "packing_items" ADD COLUMN "sourceParty" TEXT;

UPDATE "packing_items"
SET "sourceParty" = CASE
  WHEN "isOwnedByJiesong" = 1 THEN NULL
  WHEN COALESCE("manufacturer", '') <> '' THEN "manufacturer"
  WHEN COALESCE("purchaseContractNo", '') <> '' THEN "purchaseContractNo"
  ELSE '第三方拼柜'
END
WHERE "isOwnedByJiesong" = 0;
