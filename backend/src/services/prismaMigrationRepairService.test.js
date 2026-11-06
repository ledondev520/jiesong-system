/**
 * Input: prismaMigrationRepairService
 * Output: Prisma migration repair 规则测试
 * Pos: 后端服务层测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { collectMigrationRepairPlan } = require('./prismaMigrationRepairService');

test('collectMigrationRepairPlan: 会为已存在 schema effect 的失败/缺失 migration 生成修复计划', () => {
  const repositoryMigrations = [
    { migrationName: '20260321160000_add_token_usage_detail_snapshot', checksum: 'c1' },
    { migrationName: '20260329190000_add_agent_accounts_and_dual_actor_audit', checksum: 'c2' },
    { migrationName: '20260405144500_add_agent_replay_summaries', checksum: 'c3' },
  ];
  const appliedRows = [
    {
      id: 'm1',
      migrationName: '20260321160000_add_token_usage_detail_snapshot',
      finishedAt: null,
      rolledBackAt: null,
    },
  ];
  const schemaSnapshot = {
    tables: new Set(['agent_accounts', 'agent_credentials', 'agent_grants', 'agent_replay_summaries']),
    columns: {
      token_usages: new Set(['detailSnapshot']),
      operation_logs: new Set(['actorType', 'agentAccountId', 'agentCredentialId', 'requestId', 'idempotencyKey']),
    },
    foreignKeys: {},
  };

  const plan = collectMigrationRepairPlan({
    repositoryMigrations,
    appliedRows,
    schemaSnapshot,
  });

  assert.deepEqual(plan, [
    {
      type: 'mark_finished',
      migrationName: '20260321160000_add_token_usage_detail_snapshot',
      id: 'm1',
    },
    {
      type: 'insert',
      migrationName: '20260329190000_add_agent_accounts_and_dual_actor_audit',
      checksum: 'c2',
    },
    {
      type: 'insert',
      migrationName: '20260405144500_add_agent_replay_summaries',
      checksum: 'c3',
    },
  ]);
});

test('collectMigrationRepairPlan: 仅对已确认 no-op 且 schema effect 存在的迁移同步校验和', () => {
  const plan = collectMigrationRepairPlan({
    repositoryMigrations: [{
      migrationName: '20260607122054_add_notification_metadata',
      checksum: 'current-checksum',
    }],
    appliedRows: [{
      id: 'notification-migration',
      migrationName: '20260607122054_add_notification_metadata',
      checksum: 'old-checksum',
      finishedAt: new Date(),
      rolledBackAt: null,
    }],
    schemaSnapshot: {
      tables: new Set(['notifications']),
      columns: { notifications: new Set(['metadata']) },
      foreignKeys: {},
    },
  });

  assert.deepEqual(plan, [{
    type: 'sync_checksum',
    migrationName: '20260607122054_add_notification_metadata',
    id: 'notification-migration',
    checksum: 'current-checksum',
  }]);
});

test('findStrayMigrationEntries: 只放行 migration.sql 目录与 migration_lock.toml，散落 .sql/空目录被拒', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { findStrayMigrationEntries } = require('./prismaMigrationRepairService');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'synthetic-migrations-'));
  try {
    fs.mkdirSync(path.join(dir, '20260101000000_ok'));
    fs.writeFileSync(path.join(dir, '20260101000000_ok', 'migration.sql'), '-- ok');
    fs.writeFileSync(path.join(dir, 'migration_lock.toml'), 'provider = "sqlite"');
    assert.deepEqual(findStrayMigrationEntries(dir), []);
    fs.writeFileSync(path.join(dir, '20260402133700_flat.sql'), '-- never applied');
    fs.mkdirSync(path.join(dir, '20260102000000_empty'));
    assert.deepEqual(findStrayMigrationEntries(dir), ['20260102000000_empty', '20260402133700_flat.sql']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('仓库 prisma/migrations 没有会被 Prisma 忽略的散落文件（P0-10 回归）', () => {
  const path = require('node:path');
  const { findStrayMigrationEntries } = require('./prismaMigrationRepairService');
  assert.deepEqual(findStrayMigrationEntries(path.resolve(__dirname, '../../prisma/migrations')), []);
});
