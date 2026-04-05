/**
 * Input: aiController 模块
 * Output: 模块导出冒烟测试
 * Pos: 自动补齐基础测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');

const createMockRes = () => {
  const res = {
    statusCode: null,
    payload: null,
  };

  res.status = (code) => {
    res.statusCode = code;
    return res;
  };

  res.json = (payload) => {
    res.payload = payload;
    return res;
  };

  return res;
};

test('aiController: 模块可正常加载并导出', () => {
  const mod = require('./aiController');
  assert.ok(mod !== undefined);
});

test('aiController: 暴露 agentPrompt 控制器', () => {
  const mod = require('./aiController');
  assert.equal(typeof mod.agentPrompt, 'function');
});

test('aiController: 暴露 agentToolRegistry 控制器', () => {
  const mod = require('./aiController');
  assert.equal(typeof mod.agentToolRegistry, 'function');
});

test('getChatHistory: 回传 metadata 中的 pendingActionSummary', async () => {
  const aiController = require('./aiController');
  const originalFindMany = prisma.chatHistory.findMany;
  const originalCount = prisma.chatHistory.count;
  const originalOperationLogFindMany = prisma.operationLog.findMany;

  prisma.chatHistory.findMany = async () => ([
    {
      id: 'msg-1',
      sessionId: 'session-1',
      role: 'assistant',
      content: '已生成待确认动作',
      imageUrl: null,
      metadata: JSON.stringify({
        agentType: 'unified',
        actionRecommendations: [],
        pendingActionSummary: [
          {
            actionId: 'pa-1',
            actionType: 'CreateTaxRefundDraft',
            description: '补建退税草稿：已具备退税前置条件',
            status: 'pending',
            createdAt: '2026-04-04T12:00:00.000Z',
          },
        ],
      }),
      promptTokens: 10,
      outputTokens: 20,
      modelUsed: 'kimi',
      createdAt: '2026-04-04T12:00:00.000Z',
    },
  ]);
  prisma.chatHistory.count = async () => 1;
  prisma.operationLog.findMany = async () => ([
    {
      entityId: 'pa-1',
      action: 'AGENT_WRITE_EXECUTE',
      newValue: JSON.stringify({
        status: 'executed',
        result: { detail: '已创建退税草稿' },
      }),
      createdAt: '2026-04-04T12:05:00.000Z',
    },
  ]);

  try {
    const req = {
      user: { id: 'user-1' },
      query: { sessionId: 'session-1', page: '1', pageSize: '50' },
    };
    const res = createMockRes();
    let capturedError = null;
    const next = (error) => {
      capturedError = error;
    };

    await aiController.getChatHistory(req, res, next);

    assert.equal(capturedError, null);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.data.items[0].governanceReplayAvailable, true);
    assert.deepEqual(res.payload.data.items[0].governanceReplayCounts, {
      tools: 0,
      recommendations: 0,
      actions: 1,
    });
    assert.equal(res.payload.data.items[0].governanceReplayLevel, 'actions');
    assert.equal(res.payload.data.items[0].governanceReplaySource, 'session-metadata+operation-log');
    assert.deepEqual(res.payload.data.items[0].governanceReplayProfile, {
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
    assert.deepEqual(res.payload.data.items[0].governanceReplaySummary, {
      tools: false,
      recommendations: false,
      actions: true,
    });
    assert.deepEqual(res.payload.data.items[0].pendingActionSummary, [
      {
        actionId: 'pa-1',
        actionType: 'CreateTaxRefundDraft',
        description: '补建退税草稿：已具备退税前置条件',
        status: 'executed',
        createdAt: '2026-04-04T12:00:00.000Z',
        resultDetail: '已创建退税草稿',
        timeline: [
          {
            type: 'created',
            status: 'pending',
            detail: '补建退税草稿：已具备退税前置条件',
            at: '2026-04-04T12:00:00.000Z',
          },
          {
            type: 'executed',
            status: 'executed',
            detail: '已创建退税草稿',
            at: '2026-04-04T12:05:00.000Z',
          },
        ],
      },
    ]);
  } finally {
    prisma.chatHistory.findMany = originalFindMany;
    prisma.chatHistory.count = originalCount;
    prisma.operationLog.findMany = originalOperationLogFindMany;
  }
});

test('getSessions: 会话列表包含 pendingActionSummary 摘要', async () => {
  const aiController = require('./aiController');
  const originalChatHistoryGroupBy = prisma.chatHistory.groupBy;
  const originalTokenUsageGroupBy = prisma.tokenUsage.groupBy;
  const originalTokenUsageFindMany = prisma.tokenUsage.findMany;
  const originalChatHistoryFindMany = prisma.chatHistory.findMany;
  const originalOperationLogFindMany = prisma.operationLog.findMany;

  prisma.chatHistory.groupBy = async () => ([
    { sessionId: 'session-1', _max: { createdAt: '2026-04-04T12:00:00.000Z' }, _count: { _all: 2 } },
  ]);
  prisma.tokenUsage.groupBy = async () => ([
    { sessionId: 'session-1', _sum: { totalTokens: 100 } },
  ]);
  prisma.tokenUsage.findMany = async () => ([
    { sessionId: 'session-1', model: 'kimi' },
  ]);
  prisma.chatHistory.findMany = async () => ([
    {
      sessionId: 'session-1',
      content: '帮我诊断退税链路',
      metadata: JSON.stringify({
        agentType: 'unified',
        routePlan: { mode: 'cross-domain', selectedDomains: ['trade-compliance'] },
        toolTraceSummary: { totalCalls: 2, failureCount: 0, totalDurationMs: 15 },
        actionRecommendations: [
          {
            code: 'trade-compliance.prepare-tax-refund',
            title: '补建退税草稿',
            domain: 'trade-compliance',
            priority: 'high',
            executionMode: 'manual',
            reason: '退税前置条件已满足',
          },
        ],
        pendingActionSummary: [
          {
            actionId: 'pa-1',
            actionType: 'CreateTaxRefundDraft',
            description: '补建退税草稿：已具备退税前置条件',
            status: 'pending',
            createdAt: '2026-04-04T12:00:00.000Z',
          },
        ],
      }),
    },
  ]);
  prisma.operationLog.findMany = async () => ([
    {
      entityId: 'pa-1',
      action: 'AGENT_WRITE_CANCEL',
      newValue: JSON.stringify({
        status: 'cancelled',
        detail: '用户取消操作',
      }),
      createdAt: '2026-04-04T12:06:00.000Z',
    },
  ]);

  try {
    const req = { user: { id: 'user-1' } };
    const res = createMockRes();
    let capturedError = null;
    const next = (error) => {
      capturedError = error;
    };

    await aiController.getSessions(req, res, next);

    assert.equal(capturedError, null);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.data[0].governanceReplayAvailable, true);
    assert.deepEqual(res.payload.data[0].governanceReplayCounts, {
      tools: 2,
      recommendations: 1,
      actions: 1,
    });
    assert.equal(res.payload.data[0].governanceReplayLevel, 'tools');
    assert.equal(res.payload.data[0].governanceReplaySource, 'session-metadata+operation-log');
    assert.deepEqual(res.payload.data[0].governanceReplayProfile, {
      available: true,
      source: 'session-metadata+operation-log',
      level: 'tools',
      evidence: {
        operationLogEvents: 1,
        actionLifecycleCount: 1,
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
    });
    assert.deepEqual(res.payload.data[0].governanceReplaySummary, {
      tools: true,
      recommendations: true,
      actions: true,
    });
    assert.deepEqual(res.payload.data[0].pendingActionSummary, [
      {
        actionId: 'pa-1',
        actionType: 'CreateTaxRefundDraft',
        description: '补建退税草稿：已具备退税前置条件',
        status: 'cancelled',
        createdAt: '2026-04-04T12:00:00.000Z',
        resultDetail: '用户取消操作',
        timeline: [
          {
            type: 'created',
            status: 'pending',
            detail: '补建退税草稿：已具备退税前置条件',
            at: '2026-04-04T12:00:00.000Z',
          },
          {
            type: 'cancelled',
            status: 'cancelled',
            detail: '用户取消操作',
            at: '2026-04-04T12:06:00.000Z',
          },
        ],
      },
    ]);
  } finally {
    prisma.chatHistory.groupBy = originalChatHistoryGroupBy;
    prisma.tokenUsage.groupBy = originalTokenUsageGroupBy;
    prisma.tokenUsage.findMany = originalTokenUsageFindMany;
    prisma.chatHistory.findMany = originalChatHistoryFindMany;
    prisma.operationLog.findMany = originalOperationLogFindMany;
  }
});

test('getSessions: 原始 replay 字段缺失时仍可复用 metadata 中已持久化的 governanceReplayProfile', async () => {
  const aiController = require('./aiController');
  const originalChatHistoryGroupBy = prisma.chatHistory.groupBy;
  const originalTokenUsageGroupBy = prisma.tokenUsage.groupBy;
  const originalTokenUsageFindMany = prisma.tokenUsage.findMany;
  const originalChatHistoryFindMany = prisma.chatHistory.findMany;
  const originalOperationLogFindMany = prisma.operationLog.findMany;

  prisma.chatHistory.groupBy = async () => ([
    { sessionId: 'session-profile-only', _max: { createdAt: '2026-04-05T02:00:00.000Z' }, _count: { _all: 1 } },
  ]);
  prisma.tokenUsage.groupBy = async () => ([
    { sessionId: 'session-profile-only', _sum: { totalTokens: 10 } },
  ]);
  prisma.tokenUsage.findMany = async () => ([
    { sessionId: 'session-profile-only', model: 'kimi' },
  ]);
  prisma.chatHistory.findMany = async () => ([
    {
      sessionId: 'session-profile-only',
      content: '帮我看 replay profile',
      metadata: JSON.stringify({
        agentType: 'unified',
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
      }),
    },
  ]);
  prisma.operationLog.findMany = async () => ([]);

  try {
    const req = { user: { id: 'user-1' } };
    const res = createMockRes();
    let capturedError = null;
    const next = (error) => {
      capturedError = error;
    };

    await aiController.getSessions(req, res, next);

    assert.equal(capturedError, null);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload.data[0].governanceReplayProfile, {
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
    assert.equal(res.payload.data[0].governanceReplayLevel, 'recommendations');
    assert.deepEqual(res.payload.data[0].governanceReplayCounts, {
      tools: 0,
      recommendations: 2,
      actions: 0,
    });
  } finally {
    prisma.chatHistory.groupBy = originalChatHistoryGroupBy;
    prisma.tokenUsage.groupBy = originalTokenUsageGroupBy;
    prisma.tokenUsage.findMany = originalTokenUsageFindMany;
    prisma.chatHistory.findMany = originalChatHistoryFindMany;
    prisma.operationLog.findMany = originalOperationLogFindMany;
  }
});

test('getSessions: chat metadata 缺失时可回退到 AGENT_RUN 日志里的 replay profile', async () => {
  const aiController = require('./aiController');
  const originalChatHistoryGroupBy = prisma.chatHistory.groupBy;
  const originalTokenUsageGroupBy = prisma.tokenUsage.groupBy;
  const originalTokenUsageFindMany = prisma.tokenUsage.findMany;
  const originalChatHistoryFindMany = prisma.chatHistory.findMany;
  const originalOperationLogFindMany = prisma.operationLog.findMany;

  prisma.chatHistory.groupBy = async () => ([
    { sessionId: 'session-agent-run-only', _max: { createdAt: '2026-04-05T03:00:00.000Z' }, _count: { _all: 1 } },
  ]);
  prisma.tokenUsage.groupBy = async () => ([
    { sessionId: 'session-agent-run-only', _sum: { totalTokens: 10 } },
  ]);
  prisma.tokenUsage.findMany = async () => ([
    { sessionId: 'session-agent-run-only', model: 'kimi' },
  ]);
  prisma.chatHistory.findMany = async () => ([
    {
      sessionId: 'session-agent-run-only',
      content: '帮我看 replay profile fallback',
      metadata: JSON.stringify({
        agentType: 'unified',
      }),
    },
  ]);
  prisma.operationLog.findMany = async (args) => {
    const actions = args?.where?.action?.in || [];
    if (actions.includes('AGENT_RUN')) {
      return [
        {
          entityId: 'session-agent-run-only',
          action: 'AGENT_RUN',
          newValue: JSON.stringify({
            governanceReplayProfile: {
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
          }),
          createdAt: '2026-04-05T03:00:00.000Z',
        },
      ];
    }
    return [];
  };

  try {
    const req = { user: { id: 'user-1' } };
    const res = createMockRes();
    let capturedError = null;
    const next = (error) => {
      capturedError = error;
    };

    await aiController.getSessions(req, res, next);

    assert.equal(capturedError, null);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload.data[0].governanceReplayProfile, {
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
    assert.equal(res.payload.data[0].governanceReplaySource, 'agent-run-log');
  } finally {
    prisma.chatHistory.groupBy = originalChatHistoryGroupBy;
    prisma.tokenUsage.groupBy = originalTokenUsageGroupBy;
    prisma.tokenUsage.findMany = originalTokenUsageFindMany;
    prisma.chatHistory.findMany = originalChatHistoryFindMany;
    prisma.operationLog.findMany = originalOperationLogFindMany;
  }
});

test('getSessions: AGENT_REPLAY_SNAPSHOT 优先于 AGENT_RUN 作为 replay baseline 来源', async () => {
  const aiController = require('./aiController');
  const originalChatHistoryGroupBy = prisma.chatHistory.groupBy;
  const originalTokenUsageGroupBy = prisma.tokenUsage.groupBy;
  const originalTokenUsageFindMany = prisma.tokenUsage.findMany;
  const originalChatHistoryFindMany = prisma.chatHistory.findMany;
  const originalOperationLogFindMany = prisma.operationLog.findMany;

  prisma.chatHistory.groupBy = async () => ([
    { sessionId: 'session-replay-snapshot', _max: { createdAt: '2026-04-05T04:00:00.000Z' }, _count: { _all: 1 } },
  ]);
  prisma.tokenUsage.groupBy = async () => ([
    { sessionId: 'session-replay-snapshot', _sum: { totalTokens: 20 } },
  ]);
  prisma.tokenUsage.findMany = async () => ([
    { sessionId: 'session-replay-snapshot', model: 'kimi' },
  ]);
  prisma.chatHistory.findMany = async () => ([
    {
      sessionId: 'session-replay-snapshot',
      content: '帮我看 replay snapshot fallback',
      metadata: JSON.stringify({
        agentType: 'unified',
      }),
    },
  ]);
  prisma.operationLog.findMany = async (args) => {
    if (Array.isArray(args?.where?.action) || args?.where?.action?.in) {
      return [
        {
          entityId: 'session-replay-snapshot',
          action: 'AGENT_REPLAY_SNAPSHOT',
          newValue: JSON.stringify({
            governanceReplayProfile: {
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
          }),
          createdAt: '2026-04-05T04:01:00.000Z',
        },
        {
          entityId: 'session-replay-snapshot',
          action: 'AGENT_RUN',
          newValue: JSON.stringify({
            governanceReplayProfile: {
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
          }),
          createdAt: '2026-04-05T04:00:00.000Z',
        },
      ];
    }
    return [];
  };

  try {
    const req = { user: { id: 'user-1' } };
    const res = createMockRes();
    let capturedError = null;
    const next = (error) => {
      capturedError = error;
    };

    await aiController.getSessions(req, res, next);

    assert.equal(capturedError, null);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.data[0].governanceReplaySource, 'replay-snapshot-log');
    assert.deepEqual(res.payload.data[0].governanceReplayProfile, {
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
  } finally {
    prisma.chatHistory.groupBy = originalChatHistoryGroupBy;
    prisma.tokenUsage.groupBy = originalTokenUsageGroupBy;
    prisma.tokenUsage.findMany = originalTokenUsageFindMany;
    prisma.chatHistory.findMany = originalChatHistoryFindMany;
    prisma.operationLog.findMany = originalOperationLogFindMany;
  }
});

test('getSessions: AgentReplaySummary 优先于回放快照与 AGENT_RUN 作为 replay baseline 来源', async () => {
  const aiController = require('./aiController');
  const originalChatHistoryGroupBy = prisma.chatHistory.groupBy;
  const originalTokenUsageGroupBy = prisma.tokenUsage.groupBy;
  const originalTokenUsageFindMany = prisma.tokenUsage.findMany;
  const originalChatHistoryFindMany = prisma.chatHistory.findMany;
  const originalOperationLogFindMany = prisma.operationLog.findMany;
  const originalAgentReplaySummaryFindMany = prisma.agentReplaySummary?.findMany;

  prisma.chatHistory.groupBy = async () => ([
    { sessionId: 'session-replay-summary', _max: { createdAt: '2026-04-05T05:00:00.000Z' }, _count: { _all: 1 } },
  ]);
  prisma.tokenUsage.groupBy = async () => ([
    { sessionId: 'session-replay-summary', _sum: { totalTokens: 20 } },
  ]);
  prisma.tokenUsage.findMany = async () => ([
    { sessionId: 'session-replay-summary', model: 'kimi' },
  ]);
  prisma.chatHistory.findMany = async () => ([
    {
      sessionId: 'session-replay-summary',
      content: '帮我看 replay summary fallback',
      metadata: JSON.stringify({
        agentType: 'unified',
      }),
    },
  ]);
  prisma.operationLog.findMany = async () => ([
    {
      entityId: 'session-replay-summary',
      action: 'AGENT_REPLAY_SNAPSHOT',
      newValue: JSON.stringify({
        governanceReplayProfile: {
          available: true,
          source: 'replay-snapshot-log',
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
      }),
      createdAt: '2026-04-05T05:00:00.000Z',
    },
  ]);
  prisma.agentReplaySummary = prisma.agentReplaySummary || {};
  prisma.agentReplaySummary.findMany = async () => ([
    {
      sessionId: 'session-replay-summary',
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
          tools: 4,
          recommendations: 2,
          actions: 1,
        },
      }),
    },
  ]);

  try {
    const req = { user: { id: 'user-1' } };
    const res = createMockRes();
    let capturedError = null;
    const next = (error) => {
      capturedError = error;
    };

    await aiController.getSessions(req, res, next);

    assert.equal(capturedError, null);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.data[0].governanceReplaySource, 'replay-summary-record');
    assert.deepEqual(res.payload.data[0].governanceReplayProfile, {
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
  } finally {
    prisma.chatHistory.groupBy = originalChatHistoryGroupBy;
    prisma.tokenUsage.groupBy = originalTokenUsageGroupBy;
    prisma.tokenUsage.findMany = originalTokenUsageFindMany;
    prisma.chatHistory.findMany = originalChatHistoryFindMany;
    prisma.operationLog.findMany = originalOperationLogFindMany;
    if (originalAgentReplaySummaryFindMany) {
      prisma.agentReplaySummary.findMany = originalAgentReplaySummaryFindMany;
    } else {
      delete prisma.agentReplaySummary;
    }
  }
});
