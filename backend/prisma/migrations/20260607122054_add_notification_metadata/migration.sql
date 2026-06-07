-- Add notification metadata used by Agent credential and inventory alert Modules.
ALTER TABLE "notifications" ADD COLUMN "metadata" TEXT;
