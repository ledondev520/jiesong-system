/**
 * Input: ai 模块
 * Output: 模块导出冒烟测试
 * Pos: 自动补齐基础测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const aiRouter = require('./ai');

const getRouteIndex = (router, path, method) => {
  return router.stack.findIndex((layer) => {
    if (!layer.route) return false;
    return layer.route.path === path && Boolean(layer.route.methods?.[method]);
  });
};

test('ai: 模块可正常加载并导出', () => {
  const mod = require('./ai');
  assert.ok(mod !== undefined);
});

test('ai route includes agent runtime prompt endpoint', () => {
  const index = getRouteIndex(aiRouter, '/agents/prompt', 'post');
  assert.notEqual(index, -1, '缺少 POST /agents/prompt 路由');
});

test('ai route includes agent tool registry endpoint', () => {
  const index = getRouteIndex(aiRouter, '/agents/tools', 'get');
  assert.notEqual(index, -1, '缺少 GET /agents/tools 路由');
});
