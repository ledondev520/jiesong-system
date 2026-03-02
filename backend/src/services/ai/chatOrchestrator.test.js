/**
 * Input: chatOrchestrator、contextService、prisma
 * Output: AI 会话编排模型选择与上下文构造测试
 * Pos: 后端 AI 服务测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../../utils/prisma');
const contextService = require('./contextService');

const modulePath = require.resolve('./chatOrchestrator');

const loadBuildChatSession = () => {
  delete require.cache[modulePath];
  return require('./chatOrchestrator').buildChatSession;
};

const clearModuleCache = () => {
  delete require.cache[modulePath];
};

test('buildChatSession: 默认模型场景会查询历史并拼装消息', async () => {
  const originals = {
    findMany: prisma.chatHistory.findMany,
    getDbContext: contextService.getDbContext,
  };
  let findManyArgs = null;

  prisma.chatHistory.findMany = async (args) => {
    findManyArgs = args;
    return [{ role: 'assistant', content: '历史回复' }];
  };
  contextService.getDbContext = async (message) => `\n【数据库参考信息】${message}`;

  try {
    const buildChatSession = loadBuildChatSession();
    const result = await buildChatSession({
      userId: 'u-1',
      sessionId: 's-1',
      message: '今天库存情况',
      imageUrl: '',
      defaultModel: 'gpt-default',
      visionModel: 'gpt-vision',
      thinkingModel: 'gpt-thinking',
      useThinkingModel: false,
    });

    assert.deepEqual(findManyArgs, {
      where: { userId: 'u-1', sessionId: 's-1' },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });
    assert.equal(result.model, 'gpt-default');
    assert.equal(result.needsVision, false);
    assert.equal(result.history.length, 1);
    assert.equal(result.messages[0].role, 'system');
    assert.equal(result.messages[0].content.includes('数据库参考信息'), true);
    assert.equal(result.messages[result.messages.length - 1].content, '今天库存情况');
  } finally {
    prisma.chatHistory.findMany = originals.findMany;
    contextService.getDbContext = originals.getDbContext;
    clearModuleCache();
  }
});

test('buildChatSession: 当前请求带图时强制使用视觉模型', async () => {
  const originals = {
    findMany: prisma.chatHistory.findMany,
    getDbContext: contextService.getDbContext,
  };

  prisma.chatHistory.findMany = async () => [{ role: 'assistant', content: 'ok' }];
  contextService.getDbContext = async () => '';

  try {
    const buildChatSession = loadBuildChatSession();
    const result = await buildChatSession({
      userId: 'u-1',
      sessionId: 's-1',
      message: '识别这张图',
      imageUrl: 'https://img.test/current.png',
      defaultModel: 'gpt-default',
      visionModel: 'gpt-vision',
      thinkingModel: 'gpt-thinking',
      useThinkingModel: true,
    });

    assert.equal(result.needsVision, true);
    assert.equal(result.model, 'gpt-vision');
    assert.equal(Array.isArray(result.messages[result.messages.length - 1].content), true);
  } finally {
    prisma.chatHistory.findMany = originals.findMany;
    contextService.getDbContext = originals.getDbContext;
    clearModuleCache();
  }
});

test('buildChatSession: 历史消息带图时也使用视觉模型', async () => {
  const originals = {
    findMany: prisma.chatHistory.findMany,
    getDbContext: contextService.getDbContext,
  };

  prisma.chatHistory.findMany = async () => [{
    role: 'user',
    content: '这是历史图片',
    imageUrl: 'https://img.test/history.png',
  }];
  contextService.getDbContext = async () => '';

  try {
    const buildChatSession = loadBuildChatSession();
    const result = await buildChatSession({
      userId: 'u-1',
      sessionId: 's-1',
      message: '继续分析',
      imageUrl: '',
      defaultModel: 'gpt-default',
      visionModel: 'gpt-vision',
      thinkingModel: 'gpt-thinking',
      useThinkingModel: true,
    });

    assert.equal(result.needsVision, true);
    assert.equal(result.model, 'gpt-vision');
  } finally {
    prisma.chatHistory.findMany = originals.findMany;
    contextService.getDbContext = originals.getDbContext;
    clearModuleCache();
  }
});

test('buildChatSession: thinking 模式无图片时优先 thinking 模型并支持兜底', async () => {
  const originals = {
    findMany: prisma.chatHistory.findMany,
    getDbContext: contextService.getDbContext,
  };

  prisma.chatHistory.findMany = async () => [];
  contextService.getDbContext = async () => '';

  try {
    const buildChatSession = loadBuildChatSession();
    const preferThinking = await buildChatSession({
      userId: 'u-1',
      sessionId: 's-1',
      message: '给我分析下走势',
      imageUrl: '',
      defaultModel: 'gpt-default',
      visionModel: 'gpt-vision',
      thinkingModel: 'gpt-thinking',
      useThinkingModel: true,
    });

    const fallbackDefault = await buildChatSession({
      userId: 'u-1',
      sessionId: 's-1',
      message: '再来一条',
      imageUrl: '',
      defaultModel: 'gpt-default',
      visionModel: 'gpt-vision',
      thinkingModel: '',
      useThinkingModel: true,
    });

    assert.equal(preferThinking.needsVision, false);
    assert.equal(preferThinking.model, 'gpt-thinking');
    assert.equal(fallbackDefault.model, 'gpt-default');
  } finally {
    prisma.chatHistory.findMany = originals.findMany;
    contextService.getDbContext = originals.getDbContext;
    clearModuleCache();
  }
});
