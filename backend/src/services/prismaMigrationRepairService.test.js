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
