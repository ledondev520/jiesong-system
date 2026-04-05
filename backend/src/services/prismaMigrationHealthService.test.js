/**
 * Input: prismaMigrationHealthService
 * Output: Prisma migration health 诊断服务测试
 * Pos: 后端服务层测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMigrationHealthReport } = require('./prismaMigrationHealthService');

test('buildMigrationHealthReport: 能区分 applied / repaired / pending / blocking 状态', () => {
  const repositoryMigrations = [
    { migrationName: '20260321160000_add_token_usage_detail_snapshot', checksum: 'c1' },
    { migrationName: '20260329190000_add_agent_accounts_and_dual_actor_audit', checksum: 'c2' },
    { migrationName: '20260405144500_add_agent_replay_summaries', checksum: 'c3' },
    { migrationName: '20260406090000_future_change', checksum: 'c4' },
    { migrationName: '20260406100000_broken_change', checksum: 'c5' },
  ];
  const appliedRows = [
    {
      id: 'm1',
      migrationName: '20260321160000_add_token_usage_detail_snapshot',
      finishedAt: null,
      rolledBackAt: null,
    },
    {
      id: 'm2',
      migrationName: '20260329190000_add_agent_accounts_and_dual_actor_audit',
      finishedAt: 123,
      rolledBackAt: null,
    },
  ];
  const repairPlan = [
    {
      type: 'mark_finished',
      migrationName: '20260321160000_add_token_usage_detail_snapshot',
      id: 'm1',
    },
    {
      type: 'insert',
      migrationName: '20260405144500_add_agent_replay_summaries',
      checksum: 'c3',
    },
  ];

  const report = buildMigrationHealthReport({
    repositoryMigrations,
    appliedRows,
    repairPlan,
  });

  assert.equal(report.status, 'pending');
  assert.deepEqual(report.summary, {
    totalRepositoryMigrations: 5,
    appliedCount: 1,
    repairedCount: 2,
    pendingCount: 2,
    blockingCount: 0,
  });
  assert.deepEqual(report.items, [
    {
      migrationName: '20260321160000_add_token_usage_detail_snapshot',
      status: 'repaired',
      repairAction: 'mark_finished',
    },
    {
      migrationName: '20260329190000_add_agent_accounts_and_dual_actor_audit',
      status: 'applied',
      repairAction: null,
    },
    {
      migrationName: '20260405144500_add_agent_replay_summaries',
      status: 'repaired',
      repairAction: 'insert',
    },
    {
      migrationName: '20260406090000_future_change',
      status: 'pending',
      repairAction: null,
    },
    {
      migrationName: '20260406100000_broken_change',
      status: 'pending',
      repairAction: null,
    },
  ]);
});
