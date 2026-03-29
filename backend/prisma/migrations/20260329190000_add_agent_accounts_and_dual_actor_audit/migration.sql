PRAGMA foreign_keys=OFF;

CREATE TABLE "agent_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "defaultMode" TEXT NOT NULL DEFAULT 'READ_INGEST',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "agent_accounts_slug_key" ON "agent_accounts"("slug");

CREATE TABLE "agent_credentials" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentAccountId" TEXT NOT NULL,
    "credentialKey" TEXT NOT NULL,
    "label" TEXT,
    "secretHash" TEXT NOT NULL,
    "secretPreview" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" DATETIME,
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    CONSTRAINT "agent_credentials_agentAccountId_fkey" FOREIGN KEY ("agentAccountId") REFERENCES "agent_accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "agent_credentials_credentialKey_key" ON "agent_credentials"("credentialKey");
CREATE INDEX "agent_credentials_agentAccountId_status_idx" ON "agent_credentials"("agentAccountId", "status");

CREATE TABLE "agent_grants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentAccountId" TEXT NOT NULL,
    "agentCredentialId" TEXT,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "scopeJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_grants_agentAccountId_fkey" FOREIGN KEY ("agentAccountId") REFERENCES "agent_accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "agent_grants_agentCredentialId_fkey" FOREIGN KEY ("agentCredentialId") REFERENCES "agent_credentials" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "agent_grants_agentAccountId_resource_action_idx" ON "agent_grants"("agentAccountId", "resource", "action");
CREATE UNIQUE INDEX "agent_grants_agentAccountId_agentCredentialId_resource_action_key" ON "agent_grants"("agentAccountId", "agentCredentialId", "resource", "action");

CREATE TABLE "new_operation_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorType" TEXT NOT NULL DEFAULT 'USER',
    "userId" TEXT,
    "agentAccountId" TEXT,
    "agentCredentialId" TEXT,
    "requestId" TEXT,
    "idempotencyKey" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "operation_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "operation_logs_agentAccountId_fkey" FOREIGN KEY ("agentAccountId") REFERENCES "agent_accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "operation_logs_agentCredentialId_fkey" FOREIGN KEY ("agentCredentialId") REFERENCES "agent_credentials" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_operation_logs" (
    "id",
    "actorType",
    "userId",
    "agentAccountId",
    "agentCredentialId",
    "requestId",
    "idempotencyKey",
    "action",
    "entity",
    "entityId",
    "oldValue",
    "newValue",
    "ipAddress",
    "userAgent",
    "createdAt"
)
SELECT
    "id",
    'USER',
    "userId",
    NULL,
    NULL,
    NULL,
    NULL,
    "action",
    "entity",
    "entityId",
    "oldValue",
    "newValue",
    "ipAddress",
    "userAgent",
    "createdAt"
FROM "operation_logs";

DROP TABLE "operation_logs";
ALTER TABLE "new_operation_logs" RENAME TO "operation_logs";

CREATE INDEX "operation_logs_userId_idx" ON "operation_logs"("userId");
CREATE INDEX "operation_logs_actorType_idx" ON "operation_logs"("actorType");
CREATE INDEX "operation_logs_agentAccountId_idx" ON "operation_logs"("agentAccountId");
CREATE INDEX "operation_logs_agentCredentialId_idx" ON "operation_logs"("agentCredentialId");
CREATE INDEX "operation_logs_entity_entityId_idx" ON "operation_logs"("entity", "entityId");
CREATE INDEX "operation_logs_createdAt_idx" ON "operation_logs"("createdAt");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
