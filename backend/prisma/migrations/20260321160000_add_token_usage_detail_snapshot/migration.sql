-- AlterTable: optional AI output snapshot for standalone token rows (e.g. HS recommend)
ALTER TABLE "token_usages" ADD COLUMN "detailSnapshot" TEXT;
