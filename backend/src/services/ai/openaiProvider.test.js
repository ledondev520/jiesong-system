/**
 * Input: 伪造的 OpenAI 客户端（无网络、无密钥）
 * Output: 请求体整形、429/5xx 有限重试、不重试的错误、deadline 与流式安全
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { wrapOpenAIClient, normalizeRequestBody, isRetryable, retryDelayMs } = require('./openaiProvider');

const apiError = (status, extra = {}) => Object.assign(new Error(`synthetic ${status}`), { status, ...extra });
const fakeClient = (steps) => {
  const calls = [];
  return {
    calls,
    chat: { completions: { create: async (body, options) => {
      calls.push({ body, options });
      const step = steps[Math.min(calls.length - 1, steps.length - 1)];
      if (step instanceof Error) throw step;
      return step;
    } } },
  };
};
const noSleep = () => { const waits = []; const fn = async (ms) => { waits.push(ms); }; fn.waits = waits; return fn; };

test('body: max_tokens → max_completion_tokens (clamped), temperature/thinking dropped, rest kept', () => {
  const body = { model: 'm', messages: [{ role: 'user', content: 'hi' }], stream: true, stream_options: { include_usage: true },
    temperature: 0.6, max_tokens: 99999, thinking: { type: 'enabled' }, reasoning_effort: 'high', tools: [] };
  const shaped = normalizeRequestBody(body, { maxOutputTokens: 16000 });
  assert.equal(shaped.max_completion_tokens, 16000);
  for (const key of ['max_tokens', 'temperature', 'thinking', 'reasoning_effort']) assert.equal(Object.hasOwn(shaped, key), false, key);
  assert.deepEqual(shaped.stream_options, { include_usage: true });
  assert.equal(shaped.stream, true);
  assert.equal(normalizeRequestBody({ model: 'm' }).max_completion_tokens, undefined);
  assert.equal(normalizeRequestBody({ max_tokens: 4096 }).max_completion_tokens, 4096);
  assert.equal(body.max_tokens, 99999, 'the caller body is not mutated');
});

test('retryable: 429 and 5xx only; quota, auth, bad request and timeouts are not', () => {
  for (const status of [429, 500, 502, 503, 529]) assert.equal(isRetryable(apiError(status)), true, String(status));
  for (const status of [400, 401, 403, 404, 422]) assert.equal(isRetryable(apiError(status)), false, String(status));
  assert.equal(isRetryable(apiError(429, { code: 'insufficient_quota' })), false);
  assert.equal(isRetryable(Object.assign(new Error('x'), { name: 'AbortError' })), false);
  assert.equal(isRetryable(null), false);
});

test('delay: Retry-After wins (capped), otherwise deterministic exponential backoff', () => {
  assert.equal(retryDelayMs(apiError(429, { headers: { 'retry-after': '2' } }), 0), 2000);
  assert.equal(retryDelayMs(apiError(429, { headers: new Map([['retry-after', '60']]) }), 0), 4000);
  assert.equal(retryDelayMs(apiError(503), 0), 500);
  assert.equal(retryDelayMs(apiError(503), 1), 1000);
  assert.equal(retryDelayMs(apiError(503), 10), 4000);
});

test('create: a 429 then success retries once and returns the stream', async () => {
  const stream = { synthetic: 'stream' };
  const client = fakeClient([apiError(429, { headers: { 'retry-after': '1' } }), stream]);
  const sleep = noSleep();
  const wrapped = wrapOpenAIClient(client, { maxRetries: 1, sleep });
  const signal = AbortSignal.timeout(5000);
  assert.equal(await wrapped.chat.completions.create({ model: 'm', max_tokens: 10, temperature: 1 }, { signal }), stream);
  assert.equal(client.calls.length, 2);
  assert.deepEqual(sleep.waits, [1000]);
  assert.equal(client.calls[1].options.signal, signal, 'every attempt shares the same deadline signal');
  assert.equal(client.calls[1].body.max_completion_tokens, 10);
});

test('create: retries are bounded; the last error is thrown unchanged', async () => {
  const error = apiError(503);
  const client = fakeClient([error]);
  await assert.rejects(wrapOpenAIClient(client, { maxRetries: 2, sleep: noSleep() }).chat.completions.create({ model: 'm' }), (e) => e === error);
  assert.equal(client.calls.length, 3);
  const none = fakeClient([error]);
  await assert.rejects(wrapOpenAIClient(none, { maxRetries: 0, sleep: noSleep() }).chat.completions.create({ model: 'm' }));
  assert.equal(none.calls.length, 1, 'maxRetries 0 means a single upstream call');
});

test('create: non-retryable errors and an already-expired deadline make exactly one call', async () => {
  for (const status of [400, 401, 404]) {
    const client = fakeClient([apiError(status)]);
    await assert.rejects(wrapOpenAIClient(client, { maxRetries: 2, sleep: noSleep() }).chat.completions.create({ model: 'm' }));
    assert.equal(client.calls.length, 1, String(status));
  }
  const expired = AbortSignal.abort(new Error('deadline'));
  const client = fakeClient([apiError(503)]);
  await assert.rejects(wrapOpenAIClient(client, { maxRetries: 2, sleep: noSleep() }).chat.completions.create({ model: 'm' }, { signal: expired }), /synthetic 503/);
  assert.equal(client.calls.length, 1);
});

test('create: the deadline firing during the backoff wait stops retrying with the abort reason', async () => {
  const controller = new AbortController();
  const client = fakeClient([apiError(429, { headers: { 'retry-after': '3' } })]);
  const wrapped = wrapOpenAIClient(client, { maxRetries: 2 }); // real abortable sleep
  const pending = wrapped.chat.completions.create({ model: 'm' }, { signal: controller.signal });
  setTimeout(() => controller.abort(new Error('full-response deadline')), 20);
  await assert.rejects(pending, /full-response deadline/);
  assert.equal(client.calls.length, 1);
});

test('streams are never replayed: an error while iterating propagates, create is called once', async () => {
  const stream = (async function* failing() { yield { choices: [{ delta: { content: 'a' } }] }; throw apiError(500); })();
  const client = fakeClient([stream]);
  const result = await wrapOpenAIClient(client, { maxRetries: 2, sleep: noSleep() }).chat.completions.create({ model: 'm', stream: true });
  const seen = [];
  await assert.rejects((async () => { for await (const chunk of result) seen.push(chunk.choices[0].delta.content); })(), /synthetic 500/);
  assert.deepEqual(seen, ['a']);
  assert.equal(client.calls.length, 1);
});
