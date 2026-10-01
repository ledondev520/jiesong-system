/**
 * Input: HSCIQ service with isolated cache, synthetic fetch responses and bounded timers
 * Output: Transport timeout, safe errors, request sharing and cache separation regressions
 * Pos: HSCIQ external read Interface tests; no real credentials, cache files or network
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createError } = require('../middleware/errorHandler');

const loadService = (fetch, { dailyCount = 0, timeoutMs } = {}) => {
  const module = { exports: {} };
  const requestedTimeouts = [];
  const context = {
    module, __dirname, console,
    process: { env: timeoutMs ? { HSCIQ_TIMEOUT_MS: String(timeoutMs) } : {} },
    AbortSignal: { timeout: (ms) => { requestedTimeouts.push(ms); return AbortSignal.timeout(25); } },
    setTimeout: () => 1,
    fetch,
    require: (name) => {
      // This placeholder is non-production, used only by the synthetic fetch in this VM.
      if (name === '../config') return { hsciq: { apiKey: 'non-production-test-placeholder', baseUrl: 'https://www.hsciq.com/mcp' } };
      if (name === '../middleware/errorHandler') return { createError };
      if (name === 'fs') return {
        existsSync: () => true,
        readFileSync: () => JSON.stringify({ entries: [], dailyCount, dailyDate: new Date().toISOString().slice(0, 10) }),
        writeFileSync: () => {},
      };
      return require(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'hsciqService.js'), 'utf8'), context);
  return { service: module.exports, requestedTimeouts };
};

const response = (data) => ({ ok: true, json: async () => ({ ok: true, data }) });

test('getCodeDetail: concurrent public detail requests share one upstream call', async () => {
  let calls = 0;
  const { service } = loadService(async () => {
    calls += 1;
    await new Promise(resolve => setImmediate(resolve));
    return response({ code: '3926909090' });
  });
  const results = await Promise.all([
    service.getCodeDetail('3926909090', 'CN'),
    service.getCodeDetail('3926909090', 'CN'),
  ]);
  assert.equal(calls, 1);
  assert.equal(results[0], results[1]);
  assert.equal(service.getUsageStats().used, 1);
});

test('searchCode: active-code and historical-code filters use separate caches', async () => {
  let calls = 0;
  const { service } = loadService(async (_url, options) => {
    calls += 1;
    const args = JSON.parse(options.body).arguments;
    return response({ items: [{ activeOnly: args.filterFailureCode }] });
  });
  const active = await service.searchCode('自行车', { filterFailureCode: true });
  const historical = await service.searchCode('自行车', { filterFailureCode: false });
  assert.equal(active.items[0].activeOnly, true);
  assert.equal(historical.items[0].activeOnly, false);
  assert.equal(calls, 2);
  await service.searchCode('自行车', { filterFailureCode: false });
  assert.equal(calls, 2);
});

test('getCodeDetail: total timeout covers response-body waits and allows retry', async () => {
  let calls = 0;
  const { service, requestedTimeouts } = loadService(async (_url, options) => {
    calls += 1;
    if (calls > 1) return response({ code: '3926909090' });
    return {
      ok: true,
      json: () => new Promise((_resolve, reject) => {
        if (options.signal) options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
        else setTimeout(() => reject(new Error('missing total timeout')), 40);
      }),
    };
  }, { timeoutMs: 8000 });
  // Keep the event loop alive while the synthetic AbortSignal timer is unref'ed.
  const keepAlive = setTimeout(() => {}, 100);
  try {
    await assert.rejects(service.getCodeDetail('3926909090'), error => error.statusCode === 504);
    const retry = await service.getCodeDetail('3926909090');
    assert.equal(retry.code, '3926909090');
    assert.equal(requestedTimeouts[0], 8000);
  } finally {
    clearTimeout(keepAlive);
  }
});

test('getCodeDetail: upstream authentication and business errors expose no response body', async () => {
  for (const ok of [false, true]) {
    const { service } = loadService(async () => ({
      ok, status: 401,
      text: async () => 'private-provider-response-do-not-retain',
      json: async () => ({ ok: false, error: 'private-provider-response-do-not-retain' }),
    }));
    await assert.rejects(service.getCodeDetail('3926909090'), error => {
      assert.equal(error.statusCode, 502);
      assert.ok(!error.message.includes('private-provider-response'));
      return true;
    });
  }
});

test('getCodeDetail: pending distinct requests reserve the remaining daily quota', async () => {
  let calls = 0;
  let complete;
  const { service } = loadService(async () => {
    calls += 1;
    await new Promise(resolve => { complete = resolve; });
    return response({ code: '3926909090' });
  }, { dailyCount: 149 });
  const first = service.getCodeDetail('3926909090');
  try {
    assert.equal(service.hasQuota(), false);
    const second = service.getCodeDetail('7318159090');
    complete();
    await assert.rejects(second, /上限/);
    await first;
    assert.equal(calls, 1);
    assert.equal(service.getUsageStats().used, 150);
  } finally {
    complete?.();
  }
});
