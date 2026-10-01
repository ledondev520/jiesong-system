/**
 * Input: streamHelpers
 * Output: AI 流式响应聚合测试
 * Pos: 后端 AI 服务测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { collectStreamedChat } = require('./streamHelpers');

const createAsyncStream = (chunks) => ({
  [Symbol.asyncIterator]: async function* generator() {
    for (const chunk of chunks) {
      yield chunk;
    }
  },
});

test('collectStreamedChat: thinking 模型聚合文本与推理分片', async () => {
  let createArgs = null;
  const textChunks = [];
  const thinkingChunks = [];

  const client = {
    chat: {
      completions: {
        create: async (args) => {
          createArgs = args;
          return createAsyncStream([
            { choices: [{ delta: { reasoning_content: '先判断库存' } }] },
            { choices: [{ delta: { content: '库存数量是' } }] },
            { choices: [{ delta: { reasoning_content: '再输出结论', content: ' 120 件。' } }] },
            { choices: [{ delta: { reasoning_content: '' } }] },
          ]);
        },
      },
    },
  };

  const result = await collectStreamedChat({
    client,
    model: 'gpt-thinking',
    messages: [{ role: 'user', content: '查询库存' }],
    isThinkingModel: true,
    onChunk: (chunk) => textChunks.push(chunk),
    onThinking: (chunk) => thinkingChunks.push(chunk),
  });

  assert.equal(createArgs.model, 'gpt-thinking');
  assert.equal(createArgs.temperature, 1);
  assert.equal(createArgs.max_tokens, 16000);
  assert.equal(createArgs.stream, true);
  assert.equal(result.fullContent, '库存数量是 120 件。');
  assert.equal(result.thinkingContent, '先判断库存再输出结论');
  assert.deepEqual(textChunks, ['库存数量是', ' 120 件。']);
  assert.deepEqual(thinkingChunks, ['先判断库存', '再输出结论']);
});

test('collectStreamedChat: 普通模型使用默认参数并可缺省回调', async () => {
  let createArgs = null;

  const client = {
    chat: {
      completions: {
        create: async (args) => {
          createArgs = args;
          return createAsyncStream([
            { choices: [{ delta: {} }] },
            { choices: [{ delta: { content: '你好' } }] },
            { choices: [{ delta: { content: '，世界' } }] },
          ]);
        },
      },
    },
  };

  const result = await collectStreamedChat({
    client,
    model: 'gpt-default',
    messages: [{ role: 'user', content: '打个招呼' }],
  });

  assert.equal(createArgs.model, 'gpt-default');
  assert.equal(createArgs.temperature, 0.6);
  assert.equal(createArgs.max_tokens, undefined);
  assert.equal(createArgs.stream, true);
  assert.equal(result.fullContent, '你好，世界');
  assert.equal(result.thinkingContent, '');
});

test('collectStreamedChat: 转交 SDK request options 并保留流末 usage', async () => {
  const signal = AbortSignal.timeout(1000);
  const requestOptions = { signal, timeout: 1000, maxRetries: 0 };
  let args;
  let options;
  const client = { chat: { completions: { create: async (body, suppliedOptions) => {
    args = body;
    options = suppliedOptions;
    return createAsyncStream([
      { choices: [{ delta: { content: 'OK' } }] },
      { choices: [], usage: { prompt_tokens: 12, completion_tokens: 15 } },
    ]);
  } } } };
  const result = await collectStreamedChat({ client, model: 'synthetic-model', messages: [], requestOptions });
  assert.deepEqual(args.stream_options, { include_usage: true });
  assert.equal(options, requestOptions);
  assert.equal(result.fullContent, 'OK');
  assert.deepEqual(result.tokenUsage, { promptTokens: 12, outputTokens: 15 });
});

test('collectStreamedChat: 超时不把半截输出当作完成，回调异常释放流', async () => {
  const deadline = new AbortController();
  const expected = new DOMException('synthetic deadline', 'TimeoutError');
  let aborted = false;
  const stream = {
    controller: { abort() { aborted = true; } },
    async *[Symbol.asyncIterator]() { yield { choices: [{ delta: { content: 'partial' } }] }; deadline.abort(expected); },
  };
  const client = { chat: { completions: { create: async () => stream } } };
  await assert.rejects(collectStreamedChat({ client, model: 'synthetic', messages: [], requestOptions: { signal: deadline.signal } }), expected);
  assert.equal(aborted, true);
  aborted = false;
  const callbackError = new Error('synthetic callback error');
  await assert.rejects(collectStreamedChat({ client, model: 'synthetic', messages: [], onChunk() { throw callbackError; } }), callbackError);
  assert.equal(aborted, true);
});
