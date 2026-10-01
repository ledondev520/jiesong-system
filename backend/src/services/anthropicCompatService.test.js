const test = require('node:test');
const assert = require('node:assert/strict');
const anthropicCompatService = require('./anthropicCompatService');

const buildResponse = (content, model) => ({
  id: `response-${model}`,
  choices: [{
    message: { content },
    finish_reason: 'stop',
  }],
  usage: { prompt_tokens: 3, completion_tokens: 2 },
});

test('createMessageWithClient: 配置模型不可用时自动降级到稳定模型', async () => {
  const attempts = [];
  const client = {
    chat: {
      completions: {
        create: async ({ model }) => {
          attempts.push(model);
          if (attempts.length === 1) {
            const error = new Error('Not found the model or Permission denied');
            error.status = 404;
            throw error;
          }
          return buildResponse('运行正常', model);
        },
      },
    },
  };

  const result = await anthropicCompatService.createMessageWithClient({
    payload: {
      model: 'configured-model',
      messages: [{ role: 'user', content: '检查状态' }],
    },
    client,
    defaultModel: 'configured-model',
    fallbackModel: 'stable-model',
  });

  assert.deepEqual(attempts, ['configured-model', 'stable-model']);
  assert.equal(result.model, 'stable-model');
  assert.equal(result.content[0].text, '运行正常');
});

test('createMessageWithClient: 非模型可用性错误不执行盲目重试', async () => {
  const attempts = [];
  const expected = new Error('rate limit');
  expected.status = 429;
  const client = {
    chat: {
      completions: {
        create: async ({ model }) => {
          attempts.push(model);
          throw expected;
        },
      },
    },
  };

  await assert.rejects(
    anthropicCompatService.createMessageWithClient({
      payload: { model: 'configured-model', messages: [] },
      client,
      defaultModel: 'configured-model',
      fallbackModel: 'stable-model',
    }),
    expected,
  );
  assert.deepEqual(attempts, ['configured-model']);
});

test('createMessageWithClient: 401 权限错误不重复尝试备用模型', async () => {
  const expected = Object.assign(new Error('Permission denied'), { status: 401 });
  const attempts = [];
  const client = { chat: { completions: { create: async ({ model }) => { attempts.push(model); throw expected; } } } };
  await assert.rejects(anthropicCompatService.createMessageWithClient({
    payload: { model: 'configured-model', messages: [] }, client,
    defaultModel: 'configured-model', fallbackModel: 'stable-model',
  }), expected);
  assert.deepEqual(attempts, ['configured-model']);
});

test('createMessageWithClient: 相同 404 备用模型只请求一次，带完整请求 deadline', async () => {
  const expected = Object.assign(new Error('model not found'), { status: 404 });
  const attempts = [];
  let requestOptions;
  const client = { chat: { completions: { create: async ({ model }, options) => { requestOptions = options; attempts.push(model); throw expected; } } } };
  await assert.rejects(anthropicCompatService.createMessageWithClient({
    payload: { model: 'same-model', messages: [] }, client,
    defaultModel: 'same-model', fallbackModel: 'same-model',
  }), expected);
  assert.deepEqual(attempts, ['same-model']);
  assert.ok(requestOptions.signal instanceof AbortSignal);
  assert.equal(requestOptions.maxRetries, 0);
  assert.ok(requestOptions.timeout <= 30000);
});

test('createMessage: 适配调用使用管理员配置的温度', async () => {
  const aiService = require('./aiService');
  const originalModels = aiService.getConfiguredModels;
  const originalClient = aiService.getOpenAIClient;
  let body;
  aiService.getConfiguredModels = async () => ({ defaultModel: 'configured-model', temperature: 0.9 });
  aiService.getOpenAIClient = () => ({ chat: { completions: { create: async (args) => { body = args; return buildResponse('OK', args.model); } } } });
  try {
    await anthropicCompatService.createMessage({ messages: [{ role: 'user', content: 'synthetic' }] });
    assert.equal(body.model, 'configured-model');
    assert.equal(body.temperature, 0.9);
  } finally {
    aiService.getConfiguredModels = originalModels;
    aiService.getOpenAIClient = originalClient;
  }
});
