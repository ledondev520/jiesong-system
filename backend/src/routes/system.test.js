/**
 * Input: system 模块
 * Output: 模块导出冒烟测试
 * Pos: 自动补齐基础测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const systemRouter = require('./system');

test('system: 模块可正常加载并导出', () => {
  const mod = require('./system');
  assert.ok(mod !== undefined);
});

const getRouteIndex = (router, path, method) => {
  return router.stack.findIndex((layer) => {
    if (!layer.route) return false;
    return layer.route.path === path && Boolean(layer.route.methods?.[method]);
  });
};

test('system route includes CSV export endpoint', () => {
  const index = getRouteIndex(systemRouter, '/export/:type', 'get');
  assert.notEqual(index, -1, '缺少 GET /export/:type 路由');
});

test('system route includes PDF export endpoint', () => {
  const index = getRouteIndex(systemRouter, '/export/:type/pdf', 'get');
  assert.notEqual(index, -1, '缺少 GET /export/:type/pdf 路由');
});

test('system route includes operation logs CSV export endpoint', () => {
  const index = getRouteIndex(systemRouter, '/logs/export/csv', 'get');
  assert.notEqual(index, -1, '缺少 GET /logs/export/csv 路由');
});
