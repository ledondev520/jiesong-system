-- CreateTable
CREATE TABLE "browser_sessions" (
    "tokenHash" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sessionVersion" INTEGER NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "browser_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "browser_sessions_expiresAt_idx" ON "browser_sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "browser_sessions_userId_idx" ON "browser_sessions"("userId");
