/**
 * Input: node:test、假客户端（无网络、无密钥）
 * Output: DeepSeek 自动回退与熔断的单元测试
 * Pos: 后端 AI 回退适配层测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  wrapWithFallback, createBreaker, classifyFailure, buildFallbackBody, DEEPSEEK_PROFILE,
} = require('./fallbackClient');

const apiError = (status, extra = {}) => Object.assign(new Error(`status ${status}`), { name: 'APIError', status, ...extra });
const textBody = { model: 'primary-model', messages: [{ role: 'user', content: 'hi' }], temperature: 0.6, max_tokens: 20000 };
const imageBody = { ...textBody, messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } }] }] };
// 每次返回新对象：回退会给响应打非枚举 servedBy 标记，共享对象会串测试
const okResponse = () => ({ choices: [{ message: { content: 'OK' } }], usage: { prompt_tokens: 1, completion_tokens: 2 } });

const fakeClient = (handler) => {
  const calls = [];
  return { calls, chat: { completions: { create: async (body, options) => { calls.push({ body, options }); return handler(body, options, calls.length); } } } };
};
const asyncStream = (chunks, { failAt } = {}) => ({
  controller: { abort() {} },
  async *[Symbol.asyncIterator]() {
    for (let i = 0; i < chunks.length; i += 1) {
      if (i === failAt) throw apiError(503);
      yield chunks[i];
    }
    if (failAt === chunks.length) throw apiError(503);
  },
});
const collect = async (stream) => { const out = []; for await (const chunk of stream) out.push(chunk); return out; };

const build = ({ primary, fallback, threshold = 3, cooldownMs = 1000, now = () => 0, supportsImages, fallbackAvailable = true }) => {
  const logs = [];
  const log = (line) => logs.push(line);
  const breaker = createBreaker({ threshold, cooldownMs, now, log });
  const freshOptions = { timeout: 1, signal: new AbortController().signal, fresh: true };
  const client = wrapWithFallback({
    primary, breaker, log, supportsImages,
    getFallback: async () => (fallbackAvailable ? fallback : null),
    getRequestOptions: () => freshOptions,
  });
  return { client, breaker, logs, freshOptions };
};

test('primary 5xx -> same request answered by DeepSeek, tagged, DeepSeek profile applied', async () => {
  const primary = fakeClient(() => { throw apiError(503); });
  const fallback = fakeClient(okResponse);
  const { client, freshOptions } = build({ primary, fallback });
  const result = await client.chat.completions.create(textBody, { signal: 'primary-deadline' });
  assert.equal(result.choices[0].message.content, 'OK');
  assert.deepEqual(result.servedBy, { provider: 'deepseek', model: 'deepseek-flash' });
  assert.equal(Object.keys(result).includes('servedBy'), false, 'response shape is unchanged');
  const sent = fallback.calls[0];
  assert.equal(sent.body.model, DEEPSEEK_PROFILE.model);
  assert.deepEqual(sent.body.thinking, { type: 'enabled' });
  assert.equal(sent.body.reasoning_effort, 'high');
  assert.equal(sent.body.max_tokens, 8192);
  assert.equal(Object.hasOwn(sent.body, 'temperature'), false);
  assert.deepEqual(sent.body.messages, textBody.messages);
  assert.equal(sent.options, freshOptions, 'fallback gets its own deadline, not the exhausted primary one');
});

test('fallback triggers: timeout, deadline signal, network, 429, 401/404, other provider 4xx', async () => {
  const timedOut = new AbortController();
  timedOut.abort(Object.assign(new Error('t'), { name: 'TimeoutError' }));
  const cases = [
    [Object.assign(new Error('t'), { name: 'APIConnectionTimeoutError' }), undefined],
    [Object.assign(new Error('x'), { name: 'APIUserAbortError' }), timedOut.signal],
    [Object.assign(new Error('x'), { code: 'ECONNRESET' }), undefined],
    [apiError(429), undefined],
    [apiError(429, { code: 'insufficient_quota' }), undefined],
    [apiError(401), undefined],
    [apiError(404), undefined],
    [apiError(400), undefined],
    [apiError(422), undefined],
  ];
  for (const [error, signal] of cases) {
    const primary = fakeClient(() => { throw error; });
    const fallback = fakeClient(okResponse);
    const { client } = build({ primary, fallback });
    const result = await client.chat.completions.create(textBody, signal ? { signal } : {});
    assert.equal(result.servedBy.provider, 'deepseek', `${error.name}/${error.status}`);
    assert.equal(fallback.calls.length, 1);
  }
});

test('no fallback for our own errors or a user abort; the original error is thrown', async () => {
  const userAbort = new AbortController();
  userAbort.abort(Object.assign(new Error('cancel'), { name: 'AbortError' }));
  const cases = [
    [new TypeError('our bug'), {}],
    [Object.assign(new Error('cancel'), { name: 'APIUserAbortError' }), { signal: userAbort.signal }],
    [Object.assign(new Error('cancel'), { name: 'AbortError' }), {}],
  ];
  for (const [error, options] of cases) {
    const primary = fakeClient(() => { throw error; });
    const fallback = fakeClient(okResponse);
    const { client } = build({ primary, fallback });
    await assert.rejects(client.chat.completions.create(textBody, options), (thrown) => thrown === error);
    assert.equal(fallback.calls.length, 0);
  }
  assert.equal(classifyFailure(new Error('plain')), 'other');
});

test('both fail -> the primary error surfaces so existing graceful messages are unchanged', async () => {
  const primaryError = apiError(429);
  const primary = fakeClient(() => { throw primaryError; });
  const fallback = fakeClient(() => { throw apiError(500); });
  const { client, logs } = build({ primary, fallback });
  await assert.rejects(client.chat.completions.create(textBody, {}), (thrown) => thrown === primaryError);
  assert.equal(fallback.calls.length, 1, 'exactly one fallback attempt');
  assert.ok(logs.every((line) => !line.includes('hi')), 'no prompt text in logs');
  const unavailable = build({ primary, fallback, fallbackAvailable: false });
  await assert.rejects(unavailable.client.chat.completions.create(textBody, {}), (thrown) => thrown === primaryError);
});

test('primary success is untouched and never reaches DeepSeek', async () => {
  const expected = okResponse();
  const primary = fakeClient(() => expected);
  const fallback = fakeClient(okResponse);
  const { client } = build({ primary, fallback });
  const result = await client.chat.completions.create(textBody, { signal: 'x' });
  assert.equal(result, expected);
  assert.equal(result.servedBy, undefined);
  assert.equal(fallback.calls.length, 0);
  assert.deepEqual(primary.calls[0].body, textBody);
});

test('breaker: opens after N consecutive systemic failures, skips primary, half-open probe closes or reopens', async () => {
  let clock = 0;
  let primaryHealthy = false;
  const primary = fakeClient(() => { if (!primaryHealthy) throw apiError(503); return okResponse(); });
  const fallback = fakeClient(okResponse);
  const { client, breaker, logs } = build({ primary, fallback, threshold: 3, cooldownMs: 1000, now: () => clock });
  for (let i = 0; i < 3; i += 1) await client.chat.completions.create(textBody, {});
  assert.equal(primary.calls.length, 3);
  assert.equal(breaker.state, 'open');

  await client.chat.completions.create(textBody, {});
  assert.equal(primary.calls.length, 3, 'open breaker skips the primary');
  assert.equal(fallback.calls.length, 4);

  clock = 1000; // cooldown elapsed -> one probe; it fails -> reopen
  const reopened = await client.chat.completions.create(textBody, {});
  assert.equal(primary.calls.length, 4);
  assert.equal(reopened.servedBy.provider, 'deepseek');
  assert.equal(breaker.state, 'open');
  await client.chat.completions.create(textBody, {});
  assert.equal(primary.calls.length, 4, 'reopened breaker skips again');

  clock = 2000; // probe succeeds -> closed
  primaryHealthy = true;
  const probe = await client.chat.completions.create(textBody, {});
  assert.equal(probe.servedBy, undefined);
  assert.equal(probe.choices[0].message.content, 'OK');
  assert.equal(breaker.state, 'closed');
  await client.chat.completions.create(textBody, {});
  assert.equal(primary.calls.length, 6);
  assert.deepEqual(logs.filter((line) => line.includes('breaker')).map((line) => line.match(/breaker ([a-z-]+)/)[1]), ['open', 'half-open', 'open', 'half-open', 'closed']);
});

test('breaker: success resets the streak; a non-systemic 400 neither counts nor trips; only one probe is let through', async () => {
  const breaker = createBreaker({ threshold: 2, cooldownMs: 10, now: () => 0, log: () => {} });
  breaker.record(false); breaker.record(true); breaker.record(false);
  assert.equal(breaker.state, 'closed');
  const primary = fakeClient(() => { throw apiError(400); });
  const fallback = fakeClient(okResponse);
  const { client, breaker: b2 } = build({ primary, fallback, threshold: 1 });
  await client.chat.completions.create(textBody, {});
  await client.chat.completions.create(textBody, {});
  assert.equal(b2.state, 'closed');
  assert.equal(classifyFailure(apiError(400)), 'provider');
  assert.equal(classifyFailure(apiError(503)), 'systemic');

  let now = 0;
  const probing = createBreaker({ threshold: 1, cooldownMs: 10, now: () => now, log: () => {} });
  probing.record(false);
  now = 10;
  assert.equal(probing.acquire(), 'probe');
  assert.equal(probing.acquire(), 'skip', 'concurrent requests stay on the fallback while probing');
  probing.release();
  assert.equal(probing.acquire(), 'probe', 'a cancelled probe releases the slot');
});

test('image request with unsupported fallback -> primary only, existing error path', async () => {
  const error = apiError(503);
  const primary = fakeClient(() => { throw error; });
  const fallback = fakeClient(okResponse);
  const { client, breaker } = build({ primary, fallback, supportsImages: false, threshold: 1 });
  await assert.rejects(client.chat.completions.create(imageBody, {}), (thrown) => thrown === error);
  assert.equal(fallback.calls.length, 0);
  assert.equal(breaker.state, 'closed', 'image requests do not feed or consult the breaker');
  const supported = build({ primary, fallback });
  assert.equal((await supported.client.chat.completions.create(imageBody, {})).servedBy.provider, 'deepseek');
  assert.deepEqual(fallback.calls[0].body.messages, imageBody.messages, 'image parts forwarded unchanged');
});

test('streaming: creation failure and failure before the first chunk fall back; shape stays a chunk iterator', async () => {
  const streamBody = { ...textBody, stream: true };
  const fbChunks = [{ choices: [{ delta: { content: 'A' } }] }, { choices: [], usage: { prompt_tokens: 1, completion_tokens: 1 } }];

  const created = build({ primary: fakeClient(() => { throw apiError(502); }), fallback: fakeClient(() => asyncStream(fbChunks)) });
  const direct = await created.client.chat.completions.create(streamBody, {});
  assert.deepEqual(await collect(direct), fbChunks);
  assert.equal(direct.servedBy.model, 'deepseek-flash');

  const early = build({ primary: fakeClient(() => asyncStream([{ x: 1 }], { failAt: 0 })), fallback: fakeClient(() => asyncStream(fbChunks)) });
  const wrapped = await early.client.chat.completions.create(streamBody, { signal: 'primary' });
  assert.equal(wrapped.servedBy, undefined);
  assert.deepEqual(await collect(wrapped), fbChunks);
  assert.equal(wrapped.servedBy.provider, 'deepseek');
  assert.equal(wrapped.deadlineSignal, early.freshOptions.signal);
  assert.ok(wrapped.controller, 'controller is still reachable for abort');
});

test('streaming: failure after a chunk was delivered is not spliced onto DeepSeek', async () => {
  const fallback = fakeClient(() => asyncStream([{ choices: [{ delta: { content: 'B' } }] }]));
  const { client } = build({ primary: fakeClient(() => asyncStream([{ a: 1 }, { a: 2 }], { failAt: 1 })), fallback });
  const wrapped = await client.chat.completions.create({ ...textBody, stream: true }, {});
  const seen = [];
  await assert.rejects(async () => { for await (const chunk of wrapped) seen.push(chunk); }, (error) => error.status === 503);
  assert.deepEqual(seen, [{ a: 1 }]);
  assert.equal(fallback.calls.length, 0);
});

test('streaming: both fail before output -> primary error; fallback stream failing early also reports the primary error', async () => {
  const primaryError = apiError(503);
  const failingPrimary = { controller: {}, async *[Symbol.asyncIterator]() { throw primaryError; } };
  const failingFallback = { controller: {}, async *[Symbol.asyncIterator]() { throw apiError(500); } };
  const { client } = build({ primary: fakeClient(() => failingPrimary), fallback: fakeClient(() => failingFallback) });
  const wrapped = await client.chat.completions.create({ ...textBody, stream: true }, {});
  await assert.rejects(collect(wrapped), (thrown) => thrown === primaryError);
});

test('buildFallbackBody maps OpenAI-only fields and keeps tools/stream options', () => {
  const body = buildFallbackBody({
    model: 'x', messages: [], max_completion_tokens: 100, temperature: 1, tools: [{ type: 'function' }], stream: true, stream_options: { include_usage: true },
  });
  assert.equal(body.max_tokens, 100);
  assert.equal(Object.hasOwn(body, 'max_completion_tokens'), false);
  assert.equal(body.model, 'deepseek-flash');
  assert.deepEqual(body.tools, [{ type: 'function' }]);
  assert.deepEqual(body.stream_options, { include_usage: true });
});
