/**
 * Input: 真实 openai SDK 客户端 + 回环（127.0.0.1）模拟 SSE 服务，占位密钥，无外网
 * Output: 回退触发判定在真实 SDK 错误形态下的回归测试（连接拒绝、响应头后停滞、仅 role 分片后停滞、流内 error 事件）
 * Pos: 后端 AI 回退适配层测试（补充 fallbackClient.test.js 的假错误对象）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const OpenAI = require('openai');
const { wrapOpenAIClient } = require('./openaiProvider');
const { collectStreamedChat } = require('./streamHelpers');
const { wrapWithFallback, createBreaker } = require('./fallbackClient');

const frame = (chunk) => `data: ${JSON.stringify(chunk)}\n\n`;
const role = { choices: [{ delta: { role: 'assistant', content: '' } }] };
const part = { choices: [{ delta: { content: 'P' } }] };

const sseServer = async (mode) => {
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    req.resume();
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    if (mode === 'stall-after-headers') res.flushHeaders();
    if (mode === 'role-then-stall') res.write(frame(role));
    if (mode === 'content-then-stall') res.write(frame(role) + frame(part));
    if (mode === 'error-event') res.write(`data: ${JSON.stringify({ error: { message: 'upstream blew up' } })}\n\n`);
    if (mode === 'error-after-role') res.write(frame(role) + `data: ${JSON.stringify({ error: { message: 'upstream blew up' } })}\n\n`);
    if (mode === 'ok') res.end(frame(role) + frame(part) + 'data: [DONE]\n\n');
  });
  server.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    baseURL: `http://127.0.0.1:${server.address().port}/v1`,
    close: async () => { sockets.forEach((socket) => socket.destroy()); await new Promise((resolve) => server.close(resolve)); },
  };
};

const closedPortUrl = async () => {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return `http://127.0.0.1:${port}/v1`;
};

const realPrimary = (baseURL) => wrapOpenAIClient(
  new OpenAI({ apiKey: 'test-only-placeholder', baseURL, maxRetries: 0, timeout: 5000 }),
  { maxRetries: 1 },
);

const fallbackStream = (chunks) => ({
  controller: { abort() {} },
  async *[Symbol.asyncIterator]() { for (const chunk of chunks) yield chunk; },
});

const setup = (baseURL) => {
  const fallbackCalls = [];
  const fallbackReply = [{ choices: [{ delta: { content: 'F' } }] }, { choices: [], usage: { prompt_tokens: 2, completion_tokens: 3 } }];
  const breaker = createBreaker({ threshold: 1, cooldownMs: 60000, log: () => {} });
  const client = wrapWithFallback({
    primary: realPrimary(baseURL),
    breaker,
    deadlineMs: 2000,
    log: () => {},
    getFallback: async () => ({ chat: { completions: { create: async (body, options) => {
      fallbackCalls.push({ body, options });
      return body.stream ? fallbackStream(fallbackReply) : { choices: [{ message: { content: 'F' } }] };
    } } } }),
    getRequestOptions: (timeoutMs) => ({ timeout: timeoutMs, maxRetries: 0, signal: AbortSignal.timeout(timeoutMs) }),
  });
  return { client, breaker, fallbackCalls };
};

const runStream = (client, onChunk = () => {}) => collectStreamedChat({
  client,
  model: 'synthetic',
  messages: [{ role: 'user', content: 'hi' }],
  onChunk,
  requestOptions: { timeout: 400, maxRetries: 0, signal: AbortSignal.timeout(400) },
});

test('real SDK: connection refused through wrapOpenAIClient falls back and trips the breaker', async () => {
  const { client, breaker, fallbackCalls } = setup(await closedPortUrl());
  const result = await client.chat.completions.create({ model: 'synthetic', messages: [] }, { timeout: 2000, signal: AbortSignal.timeout(2000) });
  assert.equal(result.servedBy.provider, 'deepseek');
  assert.equal(fallbackCalls.length, 1);
  assert.equal(breaker.state, 'open');
});

for (const mode of ['stall-after-headers', 'role-then-stall', 'error-event', 'error-after-role']) {
  test(`real SDK stream (${mode}): nothing visible was sent, so DeepSeek answers and the failure is counted`, async () => {
    const server = await sseServer(mode);
    try {
      const { client, breaker, fallbackCalls } = setup(server.baseURL);
      const delivered = [];
      const result = await runStream(client, (text) => delivered.push(text));
      assert.equal(result.fullContent, 'F');
      assert.deepEqual(delivered, ['F']);
      assert.equal(result.servedBy.model, 'deepseek-flash');
      assert.equal(fallbackCalls.length, 1);
      assert.equal(breaker.state, 'open', 'a stream ending by deadline/error is a primary failure, not a success');
    } finally { await server.close(); }
  });
}

test('real SDK stream: stall after real content is not spliced; failure still counts toward the breaker', async () => {
  const server = await sseServer('content-then-stall');
  try {
    const { client, breaker, fallbackCalls } = setup(server.baseURL);
    const delivered = [];
    await assert.rejects(runStream(client, (text) => delivered.push(text)), (error) => /Timeout|Abort/.test(error.name));
    assert.deepEqual(delivered, ['P']);
    assert.equal(fallbackCalls.length, 0);
    assert.equal(breaker.state, 'open');
  } finally { await server.close(); }
});

test('real SDK stream: healthy primary is unchanged and closes/keeps the breaker closed', async () => {
  const server = await sseServer('ok');
  try {
    const { client, breaker, fallbackCalls } = setup(server.baseURL);
    const result = await runStream(client);
    assert.equal(result.fullContent, 'P');
    assert.equal(result.servedBy, undefined);
    assert.equal(fallbackCalls.length, 0);
    assert.equal(breaker.state, 'closed');
  } finally { await server.close(); }
});
