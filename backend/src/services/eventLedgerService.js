/**
 * Input: prisma
 * Output: 统一事件流服务（规范化、过滤、分页）
 * Pos: 后端服务层
 */

const prisma = require('../utils/prisma');

const EVENT_LEDGER_SOURCES = [
  'OPERATION_LOG',
  'IMPORT_RECORD',
  'CHAT_HISTORY',
  'TOKEN_USAGE',
];

const EVENT_CATEGORIES = {
  AUDIT: 'AUDIT',
  IMPORT: 'IMPORT',
  AI: 'AI',
  AGENT: 'AGENT',
};

const normalizeArrayParam = (value) => {
  if (!value) return null;
  if (Array.isArray(value)) return value.map(v => v.trim().toUpperCase());
  return value.split(',').map(v => v.trim().toUpperCase()).filter(Boolean);
};

const normalizeStringParam = (value) => {
  if (!value) return null;
  return value.trim().toUpperCase();
};

const buildOperationLogWhere = (filters) => {
  const where = {};
  if (filters.actorType) where.actorType = filters.actorType;
  if (filters.entityType) where.entity = { contains: filters.entityType };
  if (filters.keyword) {
    where.OR = [
      { entity: { contains: filters.keyword } },
      { action: { contains: filters.keyword } },
      { oldValue: { contains: filters.keyword } },
      { newValue: { contains: filters.keyword } },
    ];
  }
  return where;
};

const buildImportRecordWhere = (filters) => {
  const where = {};
  if (filters.eventType === 'IMPORT_FAILED') {
    where.status = 'FAILED';
  }
  if (filters.keyword) {
    where.OR = [
      { fileName: { contains: filters.keyword } },
      { importedBy: { contains: filters.keyword } },
      { errorLog: { contains: filters.keyword } },
    ];
  }
  return where;
};

const buildChatHistoryWhere = (filters) => {
  const where = {};
  if (filters.keyword) {
    where.content = { contains: filters.keyword };
  }
  return where;
};

const buildTokenUsageWhere = (filters) => {
  const where = {};
  if (filters.keyword) {
    where.OR = [
      { promptBrief: { contains: filters.keyword } },
      { detailSnapshot: { contains: filters.keyword } },
    ];
  }
  return where;
};

const AGENT_ACTIONS = new Set(['AGENT_RUN', 'AGENT_REPLAY_SNAPSHOT', 'AGENT_WRITE_EXECUTE', 'AGENT_WRITE_CANCEL', 'AGENT_WRITE_FAILED']);

const normalizeOperationLog = (log) => {
  const isAgent = AGENT_ACTIONS.has(log.action);
  const category = isAgent ? EVENT_CATEGORIES.AGENT : EVENT_CATEGORIES.AUDIT;
  const eventType = isAgent ? `AGENT_${log.action}` : `AUDIT_${log.action}`;

  return {
    id: `oplog-${log.id}`,
    source: 'OPERATION_LOG',
    category,
    eventType,
    severity: 'INFO',
    actorType: log.actorType || 'USER',
    actorId: log.userId,
    agentAccountId: log.agentAccountId,
    entityType: log.entity,
    entityId: log.entityId,
    correlationId: log.requestId ? `request:${log.requestId}` : null,
    requestId: log.requestId,
    idempotencyKey: log.idempotencyKey,
    summary: `${log.action} ${log.entity} ${log.entityId}`,
    details: {
      oldValue: log.oldValue ? JSON.parse(log.oldValue) : null,
      newValue: log.newValue ? JSON.parse(log.newValue) : null,
    },
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    createdAt: log.createdAt,
  };
};

const normalizeImportRecord = (record) => {
  const category = EVENT_CATEGORIES.IMPORT;
  const eventType = record.status === 'FAILED' ? 'IMPORT_FAILED' : 'IMPORT_SUCCESS';
  const severity = record.status === 'FAILED' ? 'ERROR' : 'INFO';

  return {
    id: `import-${record.id}`,
    source: 'IMPORT_RECORD',
    category,
    eventType,
    severity,
    actorType: 'USER',
    actorId: record.importedBy,
    entityType: 'ImportRecord',
    entityId: record.id,
    correlationId: `import:${record.id}`,
    summary: `导入 ${record.fileName}: ${record.successRows}/${record.totalRows} 成功, ${record.failedRows} 失败`,
    details: {
      fileName: record.fileName,
      totalRows: record.totalRows,
      successRows: record.successRows,
      failedRows: record.failedRows,
      errorLog: record.errorLog ? JSON.parse(record.errorLog) : null,
    },
    createdAt: record.importedAt,
  };
};

const normalizeChatHistory = (chat) => ({
  id: `chat-${chat.id}`,
  source: 'CHAT_HISTORY',
  category: EVENT_CATEGORIES.AI,
  eventType: 'AI_CHAT_MESSAGE',
  severity: 'INFO',
  actorType: chat.role === 'user' ? 'USER' : 'SYSTEM',
  actorId: chat.userId,
  entityType: 'ChatSession',
  entityId: chat.sessionId,
  correlationId: `chat-session:${chat.sessionId}`,
  summary: `AI 对话: ${chat.content?.substring(0, 50) || ''}...`,
  details: {
    role: chat.role,
    content: chat.content,
    imageUrl: chat.imageUrl,
    metadata: chat.metadata,
  },
  promptTokens: chat.promptTokens,
  outputTokens: chat.outputTokens,
  modelUsed: chat.modelUsed,
  createdAt: chat.createdAt,
});

const normalizeTokenUsage = (usage) => ({
  id: `token-${usage.id}`,
  source: 'TOKEN_USAGE',
  category: EVENT_CATEGORIES.AI,
  eventType: 'AI_TOKEN_USAGE_CHAT',
  severity: 'INFO',
  actorType: 'SYSTEM',
  actorId: usage.userId,
  entityType: 'ChatSession',
  entityId: usage.sessionId,
  correlationId: `chat-session:${usage.sessionId}`,
  summary: `Token 使用: ${usage.totalTokens} tokens (${usage.model})`,
  details: {
    promptTokens: usage.promptTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    model: usage.model,
    requestType: usage.requestType,
    detailSnapshot: usage.detailSnapshot,
    promptBrief: usage.promptBrief,
  },
  createdAt: usage.createdAt,
});

const listEventLedger = async (page, pageSize, filters = {}) => {
  const normalizedFilters = {
    source: normalizeArrayParam(filters.source),
    actorType: normalizeStringParam(filters.actorType),
    entityType: normalizeStringParam(filters.entityType),
    eventType: normalizeStringParam(filters.eventType),
    category: normalizeStringParam(filters.category),
    keyword: filters.keyword?.trim() || null,
  };

  const sourcesToQuery = normalizedFilters.source || EVENT_LEDGER_SOURCES;

  // 根据 eventType 推断 source 进行优化查询
  const effectiveSources = normalizedFilters.eventType?.startsWith('AUDIT_')
    ? ['OPERATION_LOG']
    : normalizedFilters.eventType?.startsWith('IMPORT_')
    ? ['IMPORT_RECORD']
    : normalizedFilters.eventType?.startsWith('AI_')
    ? ['CHAT_HISTORY', 'TOKEN_USAGE']
    : normalizedFilters.eventType?.startsWith('AGENT_')
    ? ['OPERATION_LOG', 'CHAT_HISTORY', 'TOKEN_USAGE']
    : normalizedFilters.category === 'AGENT'
    ? ['OPERATION_LOG', 'CHAT_HISTORY', 'TOKEN_USAGE']
    : sourcesToQuery;

  const results = [];

  if (effectiveSources.includes('OPERATION_LOG')) {
    const where = buildOperationLogWhere(normalizedFilters);
    const [logs, count] = await Promise.all([
      prisma.operationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pageSize * 2,
      }),
      prisma.operationLog.count({ where }),
    ]);
    results.push(...logs.map(normalizeOperationLog).map(item => ({ ...item, _count: count })));
  }

  if (effectiveSources.includes('IMPORT_RECORD')) {
    const where = buildImportRecordWhere(normalizedFilters);
    const [records, count] = await Promise.all([
      prisma.importRecord.findMany({
        where,
        orderBy: { importedAt: 'desc' },
        take: pageSize * 2,
      }),
      prisma.importRecord.count({ where }),
    ]);
    results.push(...records.map(normalizeImportRecord).map(item => ({ ...item, _count: count })));
  }

  if (effectiveSources.includes('CHAT_HISTORY')) {
    const where = buildChatHistoryWhere(normalizedFilters);
    const [chats, count] = await Promise.all([
      prisma.chatHistory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pageSize * 2,
      }),
      prisma.chatHistory.count({ where }),
    ]);
    results.push(...chats.map(normalizeChatHistory).map(item => ({ ...item, _count: count })));
  }

  if (effectiveSources.includes('TOKEN_USAGE')) {
    const where = buildTokenUsageWhere(normalizedFilters);
    const [usages, count] = await Promise.all([
      prisma.tokenUsage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pageSize * 2,
      }),
      prisma.tokenUsage.count({ where }),
    ]);
    results.push(...usages.map(normalizeTokenUsage).map(item => ({ ...item, _count: count })));
  }

  // 按时间排序
  results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = results.reduce((sum, item) => sum + (item._count || 0), 0);
  const events = results.slice((page - 1) * pageSize, page * pageSize).map(({ _count, ...item }) => item);

  return {
    events,
    total,
    page,
    pageSize,
    sources: EVENT_LEDGER_SOURCES,
  };
};

module.exports = {
  listEventLedger,
  EVENT_LEDGER_SOURCES,
};
