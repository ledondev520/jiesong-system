-- CreateTable
CREATE TABLE "password_reset_lock" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT
);

-- CreateTable
CREATE TABLE "password_reset_challenges" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "requesterHash" TEXT NOT NULL,
    "userId" TEXT,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "codeHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "ready" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Additive only: preserve all users, password hashes, foreign keys and historical rows.
ALTER TABLE "users" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- Writer lock must exist before any recovery operation. Missing row fails closed.
INSERT INTO "password_reset_lock" ("id") VALUES (1);

-- CreateIndex
CREATE INDEX "password_reset_challenges_email_createdAt_idx" ON "password_reset_challenges"("email", "createdAt");

-- CreateIndex
CREATE INDEX "password_reset_challenges_requesterHash_createdAt_idx" ON "password_reset_challenges"("requesterHash", "createdAt");

-- CreateIndex
CREATE INDEX "password_reset_challenges_userId_idx" ON "password_reset_challenges"("userId");

-- CreateIndex
CREATE INDEX "password_reset_challenges_createdAt_idx" ON "password_reset_challenges"("createdAt");
