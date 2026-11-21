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
    headers: {},
  };
  res.setHeader = (key, value) => { res.headers[key] = value; };

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

test('getModels: DeepSeek 返回当前供应商与思考模式说明', async () => {
  const config = require('../config');
  const originalAi = config.ai;
  config.ai = { provider: 'deepseek' };
  try {
    const res = createMockRes();
    await require('./aiController').getModels({}, res, (error) => { throw error; });
    assert.equal(res.payload.data.provider, 'deepseek');
    assert.match(res.payload.data.description.thinking, /deepseek-flash/);
    assert.doesNotMatch(JSON.stringify(res.payload.data.description), /Kimi/);
  } finally {
    config.ai = originalAi;
  }
});

test('anthropicCompatMessage: 告知 SDK 不要自动重试失败请求', async () => {
  const service = require('../services/anthropicCompatService');
  const originalCreate = service.createMessage;
  const failure = new Error('synthetic upstream failure');
  service.createMessage = async () => { throw failure; };
  try {
    const res = createMockRes();
    let captured;
    await require('./aiController').anthropicCompatMessage({ body: {} }, res, error => { captured = error; });
    assert.equal(res.headers['x-should-retry'], 'false');
    assert.equal(captured, failure);
  } finally { service.createMessage = originalCreate; }
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

// PR #210 re-review P2-A: 聊天的角色必须从控制器逐跳传到 getDbContext；丢角色会让 WAREHOUSE 重新看到金额（默认 null 即显示）。
test('chat: 控制器把 req.user.role 传给 aiService（hop 1，WAREHOUSE 红线）', async () => {
  const aiService = require('../services/aiService');
  const originals = { chat: aiService.chat };
  const calls = {};
  aiService.chat = async (...args) => { calls.chat = args; return { message: 'ok', tokenUsage: {}, model: 'm' }; };
  try {
    const { chat } = require('./aiController');
    for (const role of ['WAREHOUSE', 'SALES']) {
      const req = { body: { message: '应付', sessionId: 's1' }, user: { id: 'u1', role } };
      await chat(req, createMockRes(), (error) => { throw error; });
      assert.equal(calls.chat[4], role, `chat ${role}`);
    }
  } finally {
    aiService.chat = originals.chat;
  }
});
