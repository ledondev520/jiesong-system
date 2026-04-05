#!/usr/bin/env node
const path = require('node:path');
const prisma = require('../src/utils/prisma');
const {
  readRepositoryMigrations,
  buildSchemaSnapshot,
  loadMigrationRows,
  collectMigrationRepairPlan,
  applyMigrationRepairPlan,
} = require('../src/services/prismaMigrationRepairService');

async function main() {
  const migrationsDir = path.resolve(__dirname, '../prisma/migrations');
  const repositoryMigrations = readRepositoryMigrations(migrationsDir);
  const appliedRows = await loadMigrationRows(prisma);
  const schemaSnapshot = await buildSchemaSnapshot(prisma);
  const plan = collectMigrationRepairPlan({
    repositoryMigrations,
    appliedRows,
    schemaSnapshot,
  });

  if (!plan.length) {
    console.log('[migration-repair] no repair needed');
    return;
  }

  console.log(`[migration-repair] applying ${plan.length} repair step(s)`);
  plan.forEach((step) => console.log(`[migration-repair] ${step.type} ${step.migrationName}`));
  await applyMigrationRepairPlan(prisma, plan);
  console.log('[migration-repair] done');
}

main()
  .catch((error) => {
    console.error('[migration-repair] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
