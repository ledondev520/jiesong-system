/** Synthetic HTTP tests of the actual shared limiter; no production credentials or data. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { createApiRateLimiter, exposeApiRateLimitHeaders, globalApiKey } = require('./apiRateLimit');
const { strictRateLimit } = require('./rateLimit');

async function fixture(t, trust = false) {
  const app = express(); app.set('trust proxy', trust);
  const limiter = createApiRateLimiter(); app.use(limiter, exposeApiRateLimitHeaders);
  app.use(express.json());
  let reached = 0;
  app.get('/probe', (_req, res) => { reached += 1; res.json({ ok: true }); });
  app.post('/login', strictRateLimit({ windowMs: 900000, max: 10, keyGenerator: (req) => `synthetic-api-rate:${req.ip}:${req.body.username}` }), (_req, res) => res.json({ ok: true }));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => { server.closeAllConnections(); await new Promise((r) => server.close(r)); });
  return { base: `http://127.0.0.1:${server.address().port}`, limiter, app, reached: () => reached };
}

test('global API limiter admits exactly 100/min and rejects before parsing, preserving headers/JSON', async (t) => {
  const f = await fixture(t);
  assert.equal(f.app.get('trust proxy'), false);
  for (let i = 0; i < 100; i += 1) {
    const response = await fetch(`${f.base}/probe`, { headers: { 'X-Forwarded-For': `198.51.100.${(i % 200) + 1}` } });
    assert.equal(response.status, 200, `request ${i + 1}`);
    assert.equal(response.headers.get('x-ratelimit-limit'), '100');
    assert.equal(Number(response.headers.get('x-ratelimit-remaining')), 99 - i);
    assert.ok(Number(response.headers.get('x-ratelimit-reset')) > Date.now());
    await response.arrayBuffer();
  }
  // Rotating spoofed proxy headers never grants another source bucket; bad JSON never reaches parsing.
  const blocked = await fetch(`${f.base}/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Forwarded-For': '203.0.113.99' }, body: '{bad' });
  assert.equal(blocked.status, 429); const body = await blocked.json();
  assert.deepEqual(Object.keys(body).sort(), ['message', 'retryAfter', 'success']);
  assert.equal(body.success, false); assert.equal(body.message, '请求过于频繁，请稍后再试');
  assert.ok(body.retryAfter > 0 && body.retryAfter <= 60); assert.equal(Number(blocked.headers.get('retry-after')), body.retryAfter);
  assert.equal(blocked.headers.get('x-ratelimit-remaining'), '0'); assert.equal(f.reached(), 100);
  await f.limiter.resetKey('127.0.0.1'); // Explicit synthetic counter reset, never a production bypass.
  assert.equal((await fetch(`${f.base}/probe`)).status, 200);
});

test('canonical IP keys unify IPv4 mappings and IPv6 /56 while explicit proxy trust stays opt-in', async (t) => {
  assert.equal(globalApiKey({ ip: '::ffff:192.0.2.4' }), globalApiKey({ ip: '192.0.2.4' }));
  assert.equal(globalApiKey({ ip: '2001:db8:abcd:1200::1' }), globalApiKey({ ip: '2001:db8:abcd:12ff::7' }));
  assert.notEqual(globalApiKey({ ip: '2001:db8:abcd:1200::1' }), globalApiKey({ ip: '2001:db8:abcd:1300::1' }));
  const f = await fixture(t, ['127.0.0.1/32', '::1/128']);
  for (let i = 0; i < 100; i += 1) {
    const response = await fetch(`${f.base}/probe`, { headers: { 'X-Forwarded-For': `198.51.100.${i + 1}, 2001:db8:abcd:12${i.toString(16).padStart(2, '0')}::1` } });
    assert.equal(response.status, 200); await response.arrayBuffer();
  }
  assert.equal((await fetch(`${f.base}/probe`, { headers: { 'X-Forwarded-For': '2001:db8:abcd:12ff::2' } })).status, 429);
  assert.equal((await fetch(`${f.base}/probe`, { headers: { 'X-Forwarded-For': '2001:db8:abcd:1300::1' } })).status, 200);
});

test('existing tighter login 10/15min remains in force underneath the global budget', async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 11; i += 1) {
    const response = await fetch(`${f.base}/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'synthetic-login-limit' }) });
    assert.equal(response.status, i < 10 ? 200 : 429);
    if (i === 10) assert.ok((await response.json()).retryAfter > 60);
    else await response.arrayBuffer();
  }
  const source = fs.readFileSync(path.resolve(__dirname, '../app.js'), 'utf8');
  assert.ok(source.indexOf('app.use(createApiRateLimiter(), exposeApiRateLimitHeaders)') < source.indexOf('app.use(express.json'));
  assert.match(source, /app\.set\('trust proxy', config\.trustedProxyCidrs\?\.length \? config\.trustedProxyCidrs : false\)/);
  assert.ok(source.indexOf('app.use(express.json') < source.indexOf("app.use('/api/v1', routes)"));
});
