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

test('DeepSeek adapter: thinking 与工具回合的 reasoning_content 完整往返', async () => {
  const initial = anthropicCompatService.mapKimiResponseToAnthropic({ model: 'deepseek-flash', response: {
    choices: [{ message: { content: '', reasoning_content: 'synthetic reasoning', tool_calls: [{ id: 'tool-1', type: 'function', function: { name: 'synthetic_echo', arguments: '{"value":1}' } }] }, finish_reason: 'tool_calls' }],
    usage: { prompt_tokens: 3, completion_tokens: 5 },
  } });
  assert.equal(initial.content[0].type, 'thinking');
  assert.equal(initial.content[0].thinking, 'synthetic reasoning');
  let body;
  const client = { chat: { completions: { create: async (value) => { body = value; return buildResponse('OK', value.model); } } } };
  await anthropicCompatService.createMessageWithClient({
    payload: { messages: [{ role: 'assistant', content: initial.content }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: '1' }] }] },
    client, defaultModel: 'deepseek-flash', fallbackModel: 'deepseek-flash',
    modelOptions: { thinking: { type: 'enabled' }, reasoning_effort: 'high' },
  });
  assert.equal(body.messages[0].reasoning_content, 'synthetic reasoning');
  assert.equal(body.messages[0].tool_calls[0].id, 'tool-1');
  assert.deepEqual(body.messages[1], { role: 'tool', tool_call_id: 'tool-1', content: '1' });
  assert.deepEqual(body.thinking, { type: 'enabled' });
  assert.equal(body.reasoning_effort, 'high');
});

test('DeepSeek adapter: 用户 base64/url 图像与文本顺序不丢失', async () => {
  let body;
  const client = { chat: { completions: { create: async (value) => { body = value; return buildResponse('OK', value.model); } } } };
  await anthropicCompatService.createMessageWithClient({
    payload: { messages: [{ role: 'user', content: [
      { type: 'text', text: 'synthetic image' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'synthetic-base64' } },
      { type: 'image', source: { type: 'url', url: 'https://synthetic.invalid/image.png' } },
    ] }] }, client, defaultModel: 'deepseek-flash',
  });
  assert.deepEqual(body.messages[0].content, [
    { type: 'text', text: 'synthetic image' },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,synthetic-base64' } },
    { type: 'image_url', image_url: { url: 'https://synthetic.invalid/image.png' } },
  ]);
});

test('DeepSeek legacy: 缺失思考的旧文本/工具历史补空串，Kimi 不增加字段', async () => {
  for (const deep of [true, false]) {
    let body;
    const client = { chat: { completions: { create: async (value) => { body = value; return buildResponse('OK', value.model); } } } };
    await anthropicCompatService.createMessageWithClient({
      payload: { messages: [
        { role: 'assistant', content: 'synthetic old answer' },
        { role: 'user', content: 'synthetic follow-up' },
        { role: 'assistant', content: [{ type: 'tool_use', id: 'old-tool', name: 'synthetic_echo', input: { value: 1 } }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'old-tool', content: '1' }] },
        { role: 'assistant', content: 'synthetic answer', reasoning_content: 'existing synthetic thought' },
      ] }, client, defaultModel: deep ? 'deepseek-flash' : 'kimi-model',
      modelOptions: deep ? { model: 'deepseek-flash', thinking: { type: 'enabled' }, reasoning_effort: 'high' } : {},
    });
    if (deep) {
      assert.equal(body.messages[0].reasoning_content, '');
      assert.equal(body.messages[2].reasoning_content, '');
    } else {
      assert.equal(Object.hasOwn(body.messages[0], 'reasoning_content'), false);
      assert.equal(Object.hasOwn(body.messages[2], 'reasoning_content'), false);
    }
    assert.equal(body.messages[4].reasoning_content, 'existing synthetic thought');
    assert.equal(body.messages[2].tool_calls[0].id, 'old-tool');
  }
});
