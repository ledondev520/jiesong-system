-- CreateTable
CREATE TABLE "email_registration_challenges" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "ready" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "email_registration_challenges_email_createdAt_idx" ON "email_registration_challenges"("email", "createdAt");

-- CreateIndex
CREATE INDEX "email_registration_challenges_createdAt_idx" ON "email_registration_challenges"("createdAt");
