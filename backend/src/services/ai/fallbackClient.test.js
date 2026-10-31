/**
 * Input: node:test、假客户端（无网络、无密钥）
 * Output: DeepSeek 自动回退与熔断的单元测试
 * Pos: 后端 AI 回退适配层测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const OpenAI = require('openai');
const { collectStreamedChat } = require('./streamHelpers');
const {
  wrapWithFallback, createBreaker, classifyFailure, buildFallbackBody, DEEPSEEK_PROFILE,
} = require('./fallbackClient');

// 真实 SDK 错误类（name 均为 'Error'，靠 instanceof 区分）
const apiError = (status, extra = {}) => Object.assign(new OpenAI.APIError(status, { message: `status ${status}` }, `status ${status}`, new Headers()), extra);
const content = (text) => ({ choices: [{ delta: { content: text } }] });
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

const build = ({ primary, fallback, threshold = 3, cooldownMs = 1000, now = () => 0, supportsImages, fallbackAvailable = true, wallClock = () => 0 }) => {
  const logs = [];
  const log = (line) => logs.push(line);
  const breaker = createBreaker({ threshold, cooldownMs, now, log });
  const freshOptions = { signal: new AbortController().signal, fresh: true };
  const requestedTimeouts = [];
  const client = wrapWithFallback({
    primary, breaker, log, supportsImages, now: wallClock, deadlineMs: 30000,
    getFallback: async () => (fallbackAvailable ? fallback : null),
    getRequestOptions: (timeoutMs) => { requestedTimeouts.push(timeoutMs); return { ...freshOptions, timeout: timeoutMs }; },
  });
  return { client, breaker, logs, freshOptions, requestedTimeouts };
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
  assert.equal(sent.options.signal, freshOptions.signal, 'fallback gets its own deadline, not the exhausted primary one');
});

test('fallback triggers: timeout, deadline signal, network, 429, 401/404, other provider 4xx', async () => {
  const timedOut = new AbortController();
  timedOut.abort(Object.assign(new Error('t'), { name: 'TimeoutError' }));
  const cases = [
    [new OpenAI.APIConnectionTimeoutError(), undefined],
    [new OpenAI.APIConnectionError({ cause: Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }) }), undefined],
    [new OpenAI.APIUserAbortError(), timedOut.signal],
    [Object.assign(new Error('x'), { cause: Object.assign(new Error('reset'), { code: 'ECONNRESET' }) }), undefined],
    [new OpenAI.APIError(undefined, { message: 'stream error event' }, 'stream error event', new Headers()), undefined],
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
    [new OpenAI.APIUserAbortError(), { signal: userAbort.signal }],
    [new OpenAI.APIUserAbortError(), {}],
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
  assert.equal(classifyFailure(Object.assign(new Error('x'), { name: 'APIConnectionError' })), 'other', 'name alone proves nothing');
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
  const fbChunks = [content('A'), { choices: [], usage: { prompt_tokens: 1, completion_tokens: 1 } }];

  const created = build({ primary: fakeClient(() => { throw apiError(502); }), fallback: fakeClient(() => asyncStream(fbChunks)) });
  const direct = await created.client.chat.completions.create(streamBody, {});
  assert.deepEqual(await collect(direct), fbChunks);
  assert.equal(direct.servedBy.model, 'deepseek-flash');

  const early = build({ primary: fakeClient(() => asyncStream([content('x')], { failAt: 0 })), fallback: fakeClient(() => asyncStream(fbChunks)) });
  const wrapped = await early.client.chat.completions.create(streamBody, { signal: 'primary' });
  assert.equal(wrapped.servedBy, undefined);
  assert.deepEqual(await collect(wrapped), fbChunks);
  assert.equal(wrapped.servedBy.provider, 'deepseek');
  assert.equal(wrapped.deadlineSignal, early.freshOptions.signal);
  assert.ok(wrapped.controller, 'controller is still reachable for abort');
});

test('streaming: failure after a chunk was delivered is not spliced onto DeepSeek', async () => {
  const fallback = fakeClient(() => asyncStream([content('B')]));
  const { client } = build({ primary: fakeClient(() => asyncStream([content('a1'), content('a2')], { failAt: 1 })), fallback });
  const wrapped = await client.chat.completions.create({ ...textBody, stream: true }, {});
  const seen = [];
  await assert.rejects(async () => { for await (const chunk of wrapped) seen.push(chunk); }, (error) => error.status === 503);
  assert.deepEqual(seen, [content('a1')]);
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

test('overall budget: fallback deadline is min(deadline, 50s - elapsed); no fallback when under 3s remain', async () => {
  let clock = 0;
  const primary = fakeClient(() => { clock += 30000; throw apiError(503); });
  const fallback = fakeClient(okResponse);
  const slow = build({ primary, fallback, wallClock: () => clock });
  const result = await slow.client.chat.completions.create(textBody, {});
  assert.equal(result.servedBy.provider, 'deepseek');
  assert.deepEqual(slow.requestedTimeouts, [20000], 'primary used 30s of the 50s budget');
  assert.equal(fallback.calls[0].options.timeout, 20000);

  clock = 0;
  const fast = build({ primary: fakeClient(() => { clock += 100; throw apiError(503); }), fallback: fakeClient(okResponse), wallClock: () => clock });
  await fast.client.chat.completions.create(textBody, {});
  assert.deepEqual(fast.requestedTimeouts, [30000], 'a quick failure still gets the full 30s');

  clock = 0;
  const error = apiError(503);
  const spent = fakeClient(() => { clock += 48000; throw error; });
  const none = fakeClient(okResponse);
  const late = build({ primary: spent, fallback: none, wallClock: () => clock });
  await assert.rejects(late.client.chat.completions.create(textBody, {}), (thrown) => thrown === error);
  assert.equal(none.calls.length, 0, 'under 3s left -> primary error, no fallback call');
});

test('breaker open: DeepSeek failure tries the primary once in the remaining budget; primary error wins if it fails too', async () => {
  const breaker = (primary, fallback) => {
    const built = build({ primary, fallback, threshold: 1 });
    built.breaker.record(false); // open
    return built;
  };
  const healthy = breaker(fakeClient(okResponse), fakeClient(() => { throw apiError(500); }));
  const answered = await healthy.client.chat.completions.create(textBody, {});
  assert.equal(answered.servedBy, undefined, 'primary answered');
  assert.equal(healthy.requestedTimeouts.length, 1);

  const primaryError = apiError(503);
  const bothDown = breaker(fakeClient(() => { throw primaryError; }), fakeClient(() => { throw apiError(500); }));
  await assert.rejects(bothDown.client.chat.completions.create(textBody, {}), (thrown) => thrown === primaryError);
  assert.equal(bothDown.logs.filter((line) => line.includes('using deepseek')).length, 0, 'no second fallback attempt');
});

test('stream: empty role/usage chunks are held back; only content/reasoning/tool_calls count as delivered', async () => {
  const role = { choices: [{ delta: { role: 'assistant', content: '' } }] };
  const fbChunks = [content('F')];
  const stalls = { controller: {}, async *[Symbol.asyncIterator]() { yield role; throw apiError(503); } };
  const fell = build({ primary: fakeClient(() => stalls), fallback: fakeClient(() => asyncStream(fbChunks)) });
  assert.deepEqual(await collect(await fell.client.chat.completions.create({ ...textBody, stream: true }, {})), fbChunks);

  for (const delta of [{ reasoning_content: 'r' }, { tool_calls: [{ index: 0 }] }]) {
    const chunk = { choices: [{ delta }] };
    const delivered = { controller: {}, async *[Symbol.asyncIterator]() { yield role; yield chunk; throw apiError(503); } };
    const kept = build({ primary: fakeClient(() => delivered), fallback: fakeClient(() => asyncStream(fbChunks)) });
    const seen = [];
    await assert.rejects(async () => { for await (const c of await kept.client.chat.completions.create({ ...textBody, stream: true }, {})) seen.push(c); });
    assert.deepEqual(seen, [role, chunk], 'held role chunk is released before the first real chunk');
  }

  const usageOnly = [{ choices: [], usage: { prompt_tokens: 1 } }];
  const ended = build({ primary: fakeClient(() => asyncStream(usageOnly)), fallback: fakeClient(okResponse) });
  assert.deepEqual(await collect(await ended.client.chat.completions.create({ ...textBody, stream: true }, {})), usageOnly, 'held chunks are flushed on a clean end');
});

test('half-open probe whose stream ends cleanly (even empty) closes the breaker', async () => {
  let clock = 0;
  const primary = fakeClient(() => asyncStream([]));
  const { client, breaker } = build({ primary, fallback: fakeClient(okResponse), threshold: 1, cooldownMs: 10, now: () => clock });
  breaker.record(false);
  clock = 10;
  await collect(await client.chat.completions.create({ ...textBody, stream: true }, {}));
  assert.equal(breaker.state, 'closed');
});

test('breaker open + DeepSeek fails: the primary-retry stream is judged by its own deadline, not the spent caller signal', async () => {
  const spent = AbortSignal.abort(Object.assign(new Error('t'), { name: 'TimeoutError' }));
  const { client, breaker } = build({ primary: fakeClient(() => asyncStream([content('hello'), content(' world')])), fallback: fakeClient(() => { throw apiError(500); }), threshold: 1 });
  breaker.record(false);
  const seen = [];
  const result = await collectStreamedChat({
    client, model: 'm', messages: [], onChunk: (text) => seen.push(text), requestOptions: { signal: spent },
  });
  assert.equal(result.fullContent, 'hello world');
  assert.deepEqual(seen, ['hello', ' world']);
});

test('breaker open + DeepSeek fails + primary-retry stream fails early: no second DeepSeek call, primary error surfaces', async () => {
  const primaryError = apiError(503);
  const failing = { controller: {}, async *[Symbol.asyncIterator]() { throw primaryError; } };
  const fallback = fakeClient(() => { throw apiError(500); });
  const { client, breaker } = build({ primary: fakeClient(() => failing), fallback, threshold: 1 });
  breaker.record(false);
  const wrapped = await client.chat.completions.create({ ...textBody, stream: true }, {});
  await assert.rejects(collect(wrapped), (thrown) => thrown === primaryError);
  assert.equal(fallback.calls.length, 1);
});

test('DeepSeek stream that sends only a role chunk then errors surfaces the primary error', async () => {
  const primaryError = apiError(503);
  const failingPrimary = { controller: {}, async *[Symbol.asyncIterator]() { throw primaryError; } };
  const roleThenError = { controller: {}, async *[Symbol.asyncIterator]() { yield { choices: [{ delta: { role: 'assistant', content: '' } }] }; throw apiError(500); } };
  const { client } = build({ primary: fakeClient(() => failingPrimary), fallback: fakeClient(() => roleThenError) });
  await assert.rejects(collect(await client.chat.completions.create({ ...textBody, stream: true }, {})), (thrown) => thrown === primaryError);
});
