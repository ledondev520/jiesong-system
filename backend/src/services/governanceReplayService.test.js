/**
 * Input: governanceReplayService
 * Output: AI 治理回放分类服务测试
 * Pos: 后端服务层测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildGovernanceReplayProfile,
  buildGovernanceReplayLevel,
  buildGovernanceReplaySource,
} = require('./governanceReplayService');

test('buildGovernanceReplayProfile: 能从 metadata 构建完整 replay profile', () => {
  const profile = buildGovernanceReplayProfile({
    toolTraceSummary: { totalCalls: 3 },
    actionRecommendations: [{ code: 'finance.follow-up' }],
    pendingActionSummary: [{ actionId: 'pa-1' }, { actionId: 'pa-2' }],
  });

  assert.deepEqual(profile, {
    available: true,
    source: 'session-metadata',
    level: 'tools',
    evidence: {
      operationLogEvents: 0,
      actionLifecycleCount: 0,
    },
    summary: {
      tools: true,
      recommendations: true,
      actions: true,
    },
    counts: {
      tools: 3,
      recommendations: 1,
      actions: 2,
    },
  });
});

test('buildGovernanceReplayProfile: 有动作生命周期日志时升级为 metadata+operation-log 来源', () => {
  const profile = buildGovernanceReplayProfile(
    {
      pendingActionSummary: [{ actionId: 'pa-1' }],
    },
    {
      pendingActionSummary: [
        {
          actionId: 'pa-1',
          status: 'executed',
          timeline: [
            { type: 'created', status: 'pending', at: '2026-04-05T01:00:00.000Z' },
            { type: 'executed', status: 'executed', at: '2026-04-05T01:05:00.000Z' },
          ],
        },
      ],
    },
  );

  assert.deepEqual(profile, {
    available: true,
    source: 'session-metadata+operation-log',
    level: 'actions',
    evidence: {
      operationLogEvents: 1,
      actionLifecycleCount: 1,
    },
    summary: {
      tools: false,
      recommendations: false,
      actions: true,
    },
    counts: {
      tools: 0,
      recommendations: 0,
      actions: 1,
    },
  });
});

test('buildGovernanceReplayProfile: 优先复用 metadata 中已持久化的 replay profile 快照', () => {
  const profile = buildGovernanceReplayProfile({
    governanceReplayProfile: {
      available: true,
      source: 'session-metadata',
      level: 'recommendations',
      evidence: {
        operationLogEvents: 0,
        actionLifecycleCount: 0,
      },
      summary: {
        tools: false,
        recommendations: true,
        actions: false,
      },
      counts: {
        tools: 0,
        recommendations: 2,
        actions: 0,
      },
    },
  });

  assert.deepEqual(profile, {
    available: true,
    source: 'session-metadata',
    level: 'recommendations',
    evidence: {
      operationLogEvents: 0,
      actionLifecycleCount: 0,
    },
    summary: {
      tools: false,
      recommendations: true,
      actions: false,
    },
    counts: {
      tools: 0,
      recommendations: 2,
      actions: 0,
    },
  });
});

test('buildGovernanceReplayProfile: metadata 缺失时可回退到独立 persisted profile 来源', () => {
  const profile = buildGovernanceReplayProfile(
    {},
    {
      persistedProfile: {
        available: true,
        source: 'agent-run-log',
        level: 'recommendations',
        evidence: {
          operationLogEvents: 0,
          actionLifecycleCount: 0,
        },
        summary: {
          tools: false,
          recommendations: true,
          actions: false,
        },
        counts: {
          tools: 0,
          recommendations: 2,
          actions: 0,
        },
      },
      persistedSource: 'agent-run-log',
    },
  );

  assert.deepEqual(profile, {
    available: true,
    source: 'agent-run-log',
    level: 'recommendations',
    evidence: {
      operationLogEvents: 0,
      actionLifecycleCount: 0,
    },
    summary: {
      tools: false,
      recommendations: true,
      actions: false,
    },
    counts: {
      tools: 0,
      recommendations: 2,
      actions: 0,
    },
  });
});

test('buildGovernanceReplayProfile: metadata 缺失时可回退到 replay snapshot 持久化来源', () => {
  const profile = buildGovernanceReplayProfile(
    {},
    {
      persistedProfile: {
        available: true,
        source: 'replay-snapshot-log',
        level: 'tools',
        evidence: {
          operationLogEvents: 0,
          actionLifecycleCount: 0,
        },
        summary: {
          tools: true,
          recommendations: true,
          actions: true,
        },
        counts: {
          tools: 3,
          recommendations: 1,
          actions: 1,
        },
      },
      persistedSource: 'replay-snapshot-log',
    },
  );

  assert.deepEqual(profile, {
    available: true,
    source: 'replay-snapshot-log',
    level: 'tools',
    evidence: {
      operationLogEvents: 0,
      actionLifecycleCount: 0,
    },
    summary: {
      tools: true,
      recommendations: true,
      actions: true,
    },
    counts: {
      tools: 3,
      recommendations: 1,
      actions: 1,
    },
  });
});

test('buildGovernanceReplayProfile: metadata 缺失时可回退到 replay summary 持久化来源', () => {
  const profile = buildGovernanceReplayProfile(
    {},
    {
      persistedProfile: {
        available: true,
        source: 'replay-summary-record',
        level: 'tools',
        evidence: {
          operationLogEvents: 0,
          actionLifecycleCount: 0,
        },
        summary: {
          tools: true,
          recommendations: true,
          actions: true,
        },
        counts: {
          tools: 4,
          recommendations: 2,
          actions: 1,
        },
      },
      persistedSource: 'replay-summary-record',
    },
  );

  assert.deepEqual(profile, {
    available: true,
    source: 'replay-summary-record',
    level: 'tools',
    evidence: {
      operationLogEvents: 0,
      actionLifecycleCount: 0,
    },
    summary: {
      tools: true,
      recommendations: true,
      actions: true,
    },
    counts: {
      tools: 4,
      recommendations: 2,
      actions: 1,
    },
  });
});

test('buildGovernanceReplayProfile: 无 replay metadata 时返回 none profile', () => {
  const profile = buildGovernanceReplayProfile({});

  assert.deepEqual(profile, {
    available: false,
    source: 'none',
    level: 'none',
    evidence: {
      operationLogEvents: 0,
      actionLifecycleCount: 0,
    },
    summary: {
      tools: false,
      recommendations: false,
      actions: false,
    },
    counts: {
      tools: 0,
      recommendations: 0,
      actions: 0,
    },
  });
  assert.equal(buildGovernanceReplayLevel(profile.summary), 'none');
  assert.equal(buildGovernanceReplaySource({}), 'none');
});
