/**
 * Input: eventLedgerService、prisma
 * Output: 统一事件流服务测试（规范化、过滤、分页）
 * Pos: 后端服务层测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const eventLedgerService = require('./eventLedgerService');

const withStubbedLedgerSources = async (overrides, callback) => {
  const original = {
    operationLogFindMany: prisma.operationLog.findMany,
    operationLogCount: prisma.operationLog.count,
    importRecordFindMany: prisma.importRecord.findMany,
    importRecordCount: prisma.importRecord.count,
    chatHistoryFindMany: prisma.chatHistory.findMany,
    chatHistoryCount: prisma.chatHistory.count,
    tokenUsageFindMany: prisma.tokenUsage.findMany,
    tokenUsageCount: prisma.tokenUsage.count,
  };

  Object.assign(prisma.operationLog, {
    findMany: overrides.operationLogFindMany || original.operationLogFindMany,
    count: overrides.operationLogCount || original.operationLogCount,
  });
  Object.assign(prisma.importRecord, {
    findMany: overrides.importRecordFindMany || original.importRecordFindMany,
    count: overrides.importRecordCount || original.importRecordCount,
  });
  Object.assign(prisma.chatHistory, {
    findMany: overrides.chatHistoryFindMany || original.chatHistoryFindMany,
    count: overrides.chatHistoryCount || original.chatHistoryCount,
  });
  Object.assign(prisma.tokenUsage, {
    findMany: overrides.tokenUsageFindMany || original.tokenUsageFindMany,
    count: overrides.tokenUsageCount || original.tokenUsageCount,
  });

  try {
    await callback();
  } finally {
    prisma.operationLog.findMany = original.operationLogFindMany;
    prisma.operationLog.count = original.operationLogCount;
    prisma.importRecord.findMany = original.importRecordFindMany;
    prisma.importRecord.count = original.importRecordCount;
    prisma.chatHistory.findMany = original.chatHistoryFindMany;
    prisma.chatHistory.count = original.chatHistoryCount;
    prisma.tokenUsage.findMany = original.tokenUsageFindMany;
    prisma.tokenUsage.count = original.tokenUsageCount;
  }
};

test('listEventLedger: 合并四类来源并输出统一事件结构', async () => {
  await withStubbedLedgerSources(
    {
      operationLogFindMany: async () => ([
        {
          id: 'log-1',
          actorType: 'USER',
          userId: 'user-1',
          agentAccountId: null,
          requestId: 'req-1',
          idempotencyKey: null,
          action: 'UPDATE',
          entity: 'Store',
          entityId: 'store-1',
          oldValue: '{"name":"旧门店"}',
          newValue: '{"name":"新门店"}',
          ipAddress: '127.0.0.1',
          userAgent: 'jest',
          createdAt: new Date('2026-04-02T08:00:00.000Z'),
        },
      ]),
      operationLogCount: async () => 1,
      importRecordFindMany: async () => ([
        {
          id: 'import-1',
          fileName: 'payments-demo.csv',
          totalRows: 12,
          successRows: 10,
          failedRows: 2,
          status: 'FAILED',
          errorLog: '[{"row":2,"error":"bad row"}]',
          importedAt: new Date('2026-04-02T09:00:00.000Z'),
          importedBy: 'user-2',
        },
      ]),
      importRecordCount: async () => 1,
      chatHistoryFindMany: async () => ([
        {
          id: 'chat-1',
          userId: 'user-3',
          sessionId: 'session-1',
          role: 'assistant',
          content: '已为你找到相关合同',
          imageUrl: null,
          metadata: null,
          promptTokens: 12,
          outputTokens: 34,
          modelUsed: 'kimi-k2',
          createdAt: new Date('2026-04-02T07:00:00.000Z'),
        },
      ]),
      chatHistoryCount: async () => 1,
      tokenUsageFindMany: async () => ([
        {
          id: 'token-1',
          userId: 'user-3',
          sessionId: 'session-1',
          model: 'kimi-k2',
          promptTokens: 50,
          outputTokens: 25,
          totalTokens: 75,
          requestType: 'chat',
          detailSnapshot: 'summary',
          promptBrief: '查一下 EXP260001',
          createdAt: new Date('2026-04-02T10:00:00.000Z'),
        },
      ]),
      tokenUsageCount: async () => 1,
    },
    async () => {
      const result = await eventLedgerService.listEventLedger(1, 3, {});

      assert.equal(result.total, 4);
      assert.equal(result.events.length, 3);
      assert.deepEqual(result.sources, eventLedgerService.EVENT_LEDGER_SOURCES);

      assert.equal(result.events[0].source, 'TOKEN_USAGE');
      assert.equal(result.events[0].category, 'AI');
      assert.equal(result.events[0].eventType, 'AI_TOKEN_USAGE_CHAT');
      assert.equal(result.events[0].actorType, 'SYSTEM');
      assert.equal(result.events[0].entityType, 'ChatSession');
      assert.equal(result.events[0].entityId, 'session-1');
      assert.equal(result.events[0].correlationId, 'chat-session:session-1');

      assert.equal(result.events[1].source, 'IMPORT_RECORD');
      assert.equal(result.events[1].eventType, 'IMPORT_FAILED');
      assert.equal(result.events[1].severity, 'ERROR');
      assert.equal(result.events[1].actorType, 'USER');
      assert.match(result.events[1].summary, /payments-demo\.csv/);

      assert.equal(result.events[2].source, 'OPERATION_LOG');
      assert.equal(result.events[2].eventType, 'AUDIT_UPDATE');
      assert.equal(result.events[2].entityType, 'Store');
      assert.equal(result.events[2].requestId, 'req-1');
    },
  );
});

test('listEventLedger: eventType=IMPORT_FAILED 时只查询导入失败事件', async () => {
  const calls = {
    importCountArgs: null,
    importFindArgs: null,
    operationTouched: false,
    chatTouched: false,
    tokenTouched: false,
  };

  await withStubbedLedgerSources(
    {
      operationLogFindMany: async () => {
        calls.operationTouched = true;
        return [];
      },
      operationLogCount: async () => {
        calls.operationTouched = true;
        return 0;
      },
      importRecordFindMany: async (args) => {
        calls.importFindArgs = args;
        return [];
      },
      importRecordCount: async (args) => {
        calls.importCountArgs = args;
        return 0;
      },
      chatHistoryFindMany: async () => {
        calls.chatTouched = true;
        return [];
      },
      chatHistoryCount: async () => {
        calls.chatTouched = true;
        return 0;
      },
      tokenUsageFindMany: async () => {
        calls.tokenTouched = true;
        return [];
      },
      tokenUsageCount: async () => {
        calls.tokenTouched = true;
        return 0;
      },
    },
    async () => {
      const result = await eventLedgerService.listEventLedger(2, 15, {
        eventType: 'IMPORT_FAILED',
        keyword: 'demo',
      });

      assert.deepEqual(result.events, []);
      assert.equal(result.total, 0);
      assert.equal(calls.operationTouched, false);
      assert.equal(calls.chatTouched, false);
      assert.equal(calls.tokenTouched, false);
      assert.deepEqual(calls.importCountArgs.where, {
        status: 'FAILED',
        OR: [
          { fileName: { contains: 'demo' } },
          { importedBy: { contains: 'demo' } },
          { errorLog: { contains: 'demo' } },
        ],
      });
      assert.deepEqual(calls.importFindArgs.where, calls.importCountArgs.where);
      assert.equal(calls.importFindArgs.take, 30);
    },
  );
});

test('listEventLedger: AGENT_RUN 事件保留 routePlan 与 toolTraceSummary 明细', async () => {
  await withStubbedLedgerSources(
    {
      operationLogFindMany: async () => ([
        {
          id: 'log-agent-1',
          actorType: 'USER',
          userId: 'user-7',
          agentAccountId: null,
          requestId: 'req-agent-1',
          idempotencyKey: null,
          action: 'AGENT_RUN',
          entity: 'AgentRuntime',
          entityId: 'session-agent-1',
          oldValue: null,
          newValue: JSON.stringify({
            agentType: 'unified',
            routePlan: { mode: 'cross-domain', selectedDomains: ['finance', 'inventory'] },
            toolTraceSummary: {
              totalCalls: 3,
              failureCount: 1,
              items: [{ name: 'SearchEntities' }, { name: 'GetInventoryOverview' }],
            },
          }),
          ipAddress: '127.0.0.1',
          userAgent: 'jest',
          createdAt: new Date('2026-04-04T00:00:00.000Z'),
        },
      ]),
      operationLogCount: async () => 1,
      importRecordFindMany: async () => [],
      importRecordCount: async () => 0,
      chatHistoryFindMany: async () => [],
      chatHistoryCount: async () => 0,
      tokenUsageFindMany: async () => [],
      tokenUsageCount: async () => 0,
    },
    async () => {
      const result = await eventLedgerService.listEventLedger(1, 10, { category: 'AGENT' });

      assert.equal(result.total, 1);
      assert.equal(result.events[0].category, 'AGENT');
      assert.equal(result.events[0].eventType, 'AGENT_AGENT_RUN');
      assert.equal(result.events[0].details.newValue.routePlan.mode, 'cross-domain');
      assert.equal(result.events[0].details.newValue.toolTraceSummary.totalCalls, 3);
      assert.equal(result.events[0].details.newValue.toolTraceSummary.failureCount, 1);
    },
  );
});

test('listEventLedger: AGENT_REPLAY_SNAPSHOT 事件归类为 AGENT 并保留 replay profile', async () => {
  await withStubbedLedgerSources(
    {
      operationLogFindMany: async () => ([
        {
          id: 'log-agent-snapshot-1',
          actorType: 'USER',
          userId: 'user-8',
          agentAccountId: null,
          requestId: 'req-agent-snapshot-1',
          idempotencyKey: null,
          action: 'AGENT_REPLAY_SNAPSHOT',
          entity: 'AgentRuntimeReplay',
          entityId: 'session-agent-snapshot-1',
          oldValue: null,
          newValue: JSON.stringify({
            governanceReplayProfile: {
              available: true,
              source: 'replay-snapshot-log',
              level: 'tools',
              counts: { tools: 2, recommendations: 1, actions: 1 },
            },
          }),
          ipAddress: '127.0.0.1',
          userAgent: 'jest',
          createdAt: new Date('2026-04-05T00:00:00.000Z'),
        },
      ]),
      operationLogCount: async () => 1,
      importRecordFindMany: async () => [],
      importRecordCount: async () => 0,
      chatHistoryFindMany: async () => [],
      chatHistoryCount: async () => 0,
      tokenUsageFindMany: async () => [],
      tokenUsageCount: async () => 0,
    },
    async () => {
      const result = await eventLedgerService.listEventLedger(1, 10, { category: 'AGENT' });

      assert.equal(result.total, 1);
      assert.equal(result.events[0].category, 'AGENT');
      assert.equal(result.events[0].eventType, 'AGENT_AGENT_REPLAY_SNAPSHOT');
      assert.equal(result.events[0].details.newValue.governanceReplayProfile.source, 'replay-snapshot-log');
      assert.equal(result.events[0].details.newValue.governanceReplayProfile.counts.tools, 2);
    },
  );
});
