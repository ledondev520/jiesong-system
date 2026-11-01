-- CreateTable
CREATE TABLE "agent_pending_actions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "params" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sessionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "failureReason" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "agent_pending_actions_userId_idx" ON "agent_pending_actions"("userId");

-- CreateIndex
CREATE INDEX "agent_pending_actions_expiresAt_idx" ON "agent_pending_actions"("expiresAt");
