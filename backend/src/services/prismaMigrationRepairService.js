/**
 * Input: prisma、migration 目录
 * Output: Prisma migration 状态修复计划与执行
 * Pos: 后端服务层
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const REPAIR_RULES = {
  '20260321160000_add_token_usage_detail_snapshot': (snapshot) => (
    snapshot.columns.token_usages?.has('detailSnapshot')
  ),
  '20260329190000_add_agent_accounts_and_dual_actor_audit': (snapshot) => (
    snapshot.tables.has('agent_accounts')
    && snapshot.tables.has('agent_credentials')
    && snapshot.tables.has('agent_grants')
    && snapshot.columns.operation_logs?.has('actorType')
    && snapshot.columns.operation_logs?.has('agentAccountId')
    && snapshot.columns.operation_logs?.has('agentCredentialId')
    && snapshot.columns.operation_logs?.has('requestId')
    && snapshot.columns.operation_logs?.has('idempotencyKey')
  ),
  '20260402092500_add_customer_receipt_pool': (snapshot) => (
    snapshot.columns.payments?.has('sourcePaymentId')
    && snapshot.columns.payments?.has('customerName')
  ),
  '20260402094500_mark_third_party_cargo': (snapshot) => (
    snapshot.columns.packing_items?.has('isOwnedByJiesong')
  ),
  '20260402095500_add_source_party_to_packing_items': (snapshot) => (
    snapshot.columns.packing_items?.has('sourceParty')
  ),
  '20260402133500_fix_payment_self_fk': (snapshot) => (
    (snapshot.foreignKeys.payments || []).some((fk) => fk.from === 'sourcePaymentId' && fk.table === 'payments')
  ),
  '20260405144500_add_agent_replay_summaries': (snapshot) => (
    snapshot.tables.has('agent_replay_summaries')
  ),
  '20260607122054_add_notification_metadata': (snapshot) => (
    snapshot.columns.notifications?.has('metadata')
  ),
};

// 该迁移已被明确改为 no-op，因为 baseline 已创建 metadata；只允许这一条同步 checksum。
const CHECKSUM_SYNC_MIGRATIONS = new Set([
  '20260607122054_add_notification_metadata',
]);

const readRepositoryMigrations = (migrationsDir) => {
  const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const migrationSqlPath = path.join(migrationsDir, entry.name, 'migration.sql');
      if (!fs.existsSync(migrationSqlPath)) return null;
      const sql = fs.readFileSync(migrationSqlPath);
      return {
        migrationName: entry.name,
        checksum: crypto.createHash('sha256').update(sql).digest('hex'),
      };
    })
    .filter(Boolean);
};

const buildSchemaSnapshot = async (prisma) => {
  const tableRows = await prisma.$queryRawUnsafe(`SELECT name FROM sqlite_master WHERE type='table'`);
  const tables = new Set(tableRows.map((row) => row.name));
  const columns = {};
  const foreignKeys = {};

  for (const table of tables) {
    columns[table] = new Set(
      (await prisma.$queryRawUnsafe(`PRAGMA table_info("${table}")`)).map((row) => row.name),
    );
    foreignKeys[table] = (await prisma.$queryRawUnsafe(`PRAGMA foreign_key_list("${table}")`)).map((row) => ({
      from: row.from,
      table: row.table,
      to: row.to,
    }));
  }

  return {
    tables,
    columns,
    foreignKeys,
  };
};

const loadMigrationRows = async (prisma) => (
  prisma.$queryRawUnsafe(
    'SELECT id, checksum, migration_name as migrationName, started_at as startedAt, finished_at as finishedAt, rolled_back_at as rolledBackAt, logs, applied_steps_count as appliedStepsCount FROM _prisma_migrations ORDER BY started_at',
  )
);

const collectMigrationRepairPlan = ({ repositoryMigrations, appliedRows, schemaSnapshot }) => {
  const repoMap = new Map(repositoryMigrations.map((item) => [item.migrationName, item]));
  const appliedMap = new Map(appliedRows.map((item) => [item.migrationName, item]));
  const plan = [];

  Object.entries(REPAIR_RULES).forEach(([migrationName, predicate]) => {
    const repo = repoMap.get(migrationName);
    if (!repo) return;
    if (!predicate(schemaSnapshot)) return;

    const applied = appliedMap.get(migrationName);
    if (!applied) {
      plan.push({
        type: 'insert',
        migrationName,
        checksum: repo.checksum,
      });
      return;
    }

    if (!applied.finishedAt && !applied.rolledBackAt) {
      plan.push({
        type: 'mark_finished',
        migrationName,
        id: applied.id,
      });
    }

    if (
      applied.checksum
      && applied.checksum !== repo.checksum
      && CHECKSUM_SYNC_MIGRATIONS.has(migrationName)
    ) {
      plan.push({
        type: 'sync_checksum',
        migrationName,
        id: applied.id,
        checksum: repo.checksum,
      });
    }
  });

  return plan;
};

const applyMigrationRepairPlan = async (prisma, plan = []) => {
  const now = Date.now();
  for (const step of plan) {
    if (step.type === 'sync_checksum') {
      await prisma.$executeRawUnsafe(
        'UPDATE _prisma_migrations SET checksum = ?, logs = COALESCE(logs, \'\') || ? WHERE id = ?',
        step.checksum,
        '\n[repair] synchronized checksum for verified no-op migration.',
        step.id,
      );
      continue;
    }
    if (step.type === 'mark_finished') {
      await prisma.$executeRawUnsafe(
        'UPDATE _prisma_migrations SET finished_at = ?, applied_steps_count = 1, logs = COALESCE(logs, \'\') || ? WHERE id = ?',
        now,
        '\n[repair] marked applied because schema effect already exists.',
        step.id,
      );
      continue;
    }

    if (step.type === 'insert') {
      await prisma.$executeRawUnsafe(
        'INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) VALUES (?, ?, ?, ?, ?, NULL, ?, 1)',
        crypto.randomUUID(),
        step.checksum,
        now,
        step.migrationName,
        '[repair] inserted as applied because schema effect already exists.',
        now,
      );
    }
  }
};

module.exports = {
  REPAIR_RULES,
  readRepositoryMigrations,
  buildSchemaSnapshot,
  loadMigrationRows,
  collectMigrationRepairPlan,
  applyMigrationRepairPlan,
};
