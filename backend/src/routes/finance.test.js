/**
 * Input: finance 模块
 * Output: 模块导出冒烟测试
 * Pos: 自动补齐基础测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');

test('finance: 模块可正常加载并导出', () => {
  const mod = require('./finance');
  assert.ok(mod !== undefined);
});

const getRouteIndex = (router, routePath, method) => router.stack.findIndex((layer) => (
  layer.route?.path === routePath && layer.route.methods?.[method]
));

test('finance: 月报上传必须先预览再确认，不暴露直接写入或目录扫描路由', () => {
  const router = require('./finance');

  assert.notEqual(getRouteIndex(router, '/statements/import-file/preview', 'post'), -1);
  assert.notEqual(getRouteIndex(router, '/statements/import-file/confirm', 'post'), -1);
  assert.notEqual(getRouteIndex(router, '/statements/import-bundle/preview', 'post'), -1);
  assert.notEqual(getRouteIndex(router, '/statements/import-bundle/confirm', 'post'), -1);
  assert.equal(getRouteIndex(router, '/statements/import-file', 'post'), -1);
  assert.equal(getRouteIndex(router, '/statements/import-folder', 'post'), -1);
});
