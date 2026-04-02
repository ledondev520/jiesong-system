ALTER TABLE "packing_items" ADD COLUMN "isOwnedByJiesong" BOOLEAN NOT NULL DEFAULT true;

UPDATE "packing_items"
SET "isOwnedByJiesong" = false
WHERE
  COALESCE("note", '') LIKE '%非捷淞报关%'
  OR COALESCE("note", '') LIKE '%拼船%'
  OR COALESCE("note", '') LIKE '%他方自行报关%'
  OR COALESCE("note", '') LIKE '%共用发票%';
