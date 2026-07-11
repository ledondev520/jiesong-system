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
