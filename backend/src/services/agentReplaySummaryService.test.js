/**
 * Input: agentReplaySummaryService、prisma
 * Output: Agent replay summary 服务测试
 * Pos: 后端服务层测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const agentReplaySummaryService = require('./agentReplaySummaryService');

test('buildReplaySummaryRecord: 会生成独立 replay summary 持久化载荷', () => {
  const record = agentReplaySummaryService.buildReplaySummaryRecord({
    userId: 'user-1',
    sessionId: 'session-1',
    governanceReplayProfile: {
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
        tools: 2,
        recommendations: 1,
        actions: 1,
      },
    },
  });

  assert.deepEqual(record, {
    userId: 'user-1',
    sessionId: 'session-1',
    source: 'replay-summary-record',
    level: 'tools',
    summaryJson: JSON.stringify({
      tools: true,
      recommendations: true,
      actions: true,
    }),
    countsJson: JSON.stringify({
      tools: 2,
      recommendations: 1,
      actions: 1,
    }),
    evidenceJson: JSON.stringify({
      operationLogEvents: 0,
      actionLifecycleCount: 0,
    }),
    profileJson: JSON.stringify({
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
        tools: 2,
        recommendations: 1,
        actions: 1,
      },
    }),
  });
});

test('buildReplaySummaryProfileMap: 从 AgentReplaySummary 构建 session -> profile 映射', async () => {
  const originalFindMany = prisma.agentReplaySummary?.findMany;
  prisma.agentReplaySummary = prisma.agentReplaySummary || {};
  prisma.agentReplaySummary.findMany = async () => ([
    {
      sessionId: 'session-1',
      profileJson: JSON.stringify({
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
          tools: 2,
          recommendations: 1,
          actions: 1,
        },
      }),
    },
  ]);

  try {
    const map = await agentReplaySummaryService.buildReplaySummaryProfileMap('user-1', ['session-1']);
    assert.deepEqual(map.get('session-1'), {
      profile: {
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
          tools: 2,
          recommendations: 1,
          actions: 1,
        },
      },
      source: 'replay-summary-record',
    });
  } finally {
    if (originalFindMany) {
      prisma.agentReplaySummary.findMany = originalFindMany;
    } else {
      delete prisma.agentReplaySummary;
    }
  }
});

test('buildReplaySummaryProfileMap: DATABASE_URL 缺失时降级为空映射', async () => {
  const originalFindMany = prisma.agentReplaySummary?.findMany;
  prisma.agentReplaySummary = prisma.agentReplaySummary || {};
  prisma.agentReplaySummary.findMany = async () => {
    const error = new Error('Environment variable not found: DATABASE_URL.');
    error.name = 'PrismaClientInitializationError';
    throw error;
  };

  try {
    const map = await agentReplaySummaryService.buildReplaySummaryProfileMap('user-1', ['session-1']);
    assert.equal(map.size, 0);
  } finally {
    if (originalFindMany) {
      prisma.agentReplaySummary.findMany = originalFindMany;
    } else {
      delete prisma.agentReplaySummary;
    }
  }
});

test('buildReplaySummaryProfileMap: replay summary 表缺失时降级为空映射', async () => {
  const originalFindMany = prisma.agentReplaySummary?.findMany;
  prisma.agentReplaySummary = prisma.agentReplaySummary || {};
  prisma.agentReplaySummary.findMany = async () => {
    const error = new Error('The table `main.agent_replay_summaries` does not exist in the current database.');
    error.code = 'P2021';
    throw error;
  };

  try {
    const map = await agentReplaySummaryService.buildReplaySummaryProfileMap('user-1', ['session-1']);
    assert.equal(map.size, 0);
  } finally {
    if (originalFindMany) {
      prisma.agentReplaySummary.findMany = originalFindMany;
    } else {
      delete prisma.agentReplaySummary;
    }
  }
});

test('upsertReplaySummary: DATABASE_URL 缺失时跳过可选持久化', async () => {
  const originalUpsert = prisma.agentReplaySummary?.upsert;
  prisma.agentReplaySummary = prisma.agentReplaySummary || {};
  prisma.agentReplaySummary.upsert = async () => {
    const error = new Error('Environment variable not found: DATABASE_URL.');
    error.name = 'PrismaClientInitializationError';
    throw error;
  };

  try {
    const result = await agentReplaySummaryService.upsertReplaySummary({
      userId: 'user-1',
      sessionId: 'session-1',
      governanceReplayProfile: { level: 'tools' },
    });
    assert.equal(result, null);
  } finally {
    if (originalUpsert) {
      prisma.agentReplaySummary.upsert = originalUpsert;
    } else {
      delete prisma.agentReplaySummary;
    }
  }
});

test('upsertReplaySummary: replay summary 表缺失时跳过可选持久化', async () => {
  const originalUpsert = prisma.agentReplaySummary?.upsert;
  prisma.agentReplaySummary = prisma.agentReplaySummary || {};
  prisma.agentReplaySummary.upsert = async () => {
    const error = new Error('The table `main.agent_replay_summaries` does not exist in the current database.');
    error.code = 'P2021';
    throw error;
  };

  try {
    const result = await agentReplaySummaryService.upsertReplaySummary({
      userId: 'user-1',
      sessionId: 'session-1',
      governanceReplayProfile: { level: 'tools' },
    });
    assert.equal(result, null);
  } finally {
    if (originalUpsert) {
      prisma.agentReplaySummary.upsert = originalUpsert;
    } else {
      delete prisma.agentReplaySummary;
    }
  }
});
