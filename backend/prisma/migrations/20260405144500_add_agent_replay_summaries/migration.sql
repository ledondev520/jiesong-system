CREATE TABLE "agent_replay_summaries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "summaryJson" TEXT NOT NULL,
    "countsJson" TEXT NOT NULL,
    "evidenceJson" TEXT NOT NULL,
    "profileJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "agent_replay_summaries_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "agent_replay_summaries_userId_sessionId_key"
ON "agent_replay_summaries"("userId", "sessionId");

CREATE INDEX "agent_replay_summaries_sessionId_idx"
ON "agent_replay_summaries"("sessionId");

CREATE INDEX "agent_replay_summaries_updatedAt_idx"
ON "agent_replay_summaries"("updatedAt");
