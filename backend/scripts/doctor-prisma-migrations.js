#!/usr/bin/env node
const path = require('node:path');
const prisma = require('../src/utils/prisma');
const {
  readRepositoryMigrations,
  buildSchemaSnapshot,
  loadMigrationRows,
  collectMigrationRepairPlan,
} = require('../src/services/prismaMigrationRepairService');
const { buildMigrationHealthReport } = require('../src/services/prismaMigrationHealthService');

async function main() {
  const migrationsDir = path.resolve(__dirname, '../prisma/migrations');
  const repositoryMigrations = readRepositoryMigrations(migrationsDir);
  const appliedRows = await loadMigrationRows(prisma);
  const schemaSnapshot = await buildSchemaSnapshot(prisma);
  const repairPlan = collectMigrationRepairPlan({
    repositoryMigrations,
    appliedRows,
    schemaSnapshot,
  });
  const report = buildMigrationHealthReport({
    repositoryMigrations,
    appliedRows,
    repairPlan,
  });

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error('[migration-doctor] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
