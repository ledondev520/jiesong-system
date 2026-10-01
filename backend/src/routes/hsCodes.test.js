/**
 * Input: hsCodes route + route index
 * Output: HSCode 路由注册测试
 * Pos: 后端路由层测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const hsCodesRouter = require('./hsCodes');
const indexRouter = require('./index');

const getRouteIndex = (router, path, method) => {
  return router.stack.findIndex((layer) => {
    if (!layer.route) return false;
    return layer.route.path === path && Boolean(layer.route.methods?.[method]);
  });
};

test('hsCodes: router exposes search, detail and manual evidence update routes', () => {
  assert.notEqual(getRouteIndex(hsCodesRouter, '/search', 'get'), -1, '缺少 GET /search');
  assert.notEqual(getRouteIndex(hsCodesRouter, '/:code', 'get'), -1, '缺少 GET /:code');
  assert.notEqual(getRouteIndex(hsCodesRouter, '/:code', 'put'), -1, '缺少 PUT /:code');
});

test('hsCodes: route index mounts /hs-codes router', () => {
  const mountedPaths = indexRouter.stack
    .filter((layer) => layer.name === 'router' && layer.regexp)
    .map((layer) => String(layer.regexp));

  assert.ok(
    mountedPaths.some((entry) => entry.includes('hs-codes')),
    '缺少 /hs-codes 路由挂载',
  );
});

test('hsCodes: 已缓存的推荐立即返回，不再模拟 AI 等待', async (t) => {
  const aiCache = require('../utils/aiCache');
  const cached = { hsCode: '1234567890', source: 'synthetic-test-cache' };
  t.mock.method(aiCache, 'get', () => cached);
  const originalDelay = aiCache.simulateDelay;
  let delayCalls = 0;
  aiCache.simulateDelay = async () => { delayCalls++; };
  t.after(() => {
    if (originalDelay === undefined) delete aiCache.simulateDelay;
    else aiCache.simulateDelay = originalDelay;
  });
  const route = hsCodesRouter.stack.find((layer) => layer.route?.path === '/ai-recommend').route;
  const handler = route.stack.at(-1).handle;
  const res = { status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; } };
  await handler({ body: { productDescription: 'synthetic cache validation' } }, res, (error) => { throw error; });
  assert.deepEqual(res.payload.data, cached);
  assert.equal(delayCalls, 0);
});
