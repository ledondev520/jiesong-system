-- A101: rawPayloadJson had no reader (backend or frontend); the parsed columns keep every value the app uses.
-- One-way door: take the consistent SQLite snapshot first. Space is reclaimed only by a later VACUUM.
ALTER TABLE "hs_codes" DROP COLUMN "rawPayloadJson";
