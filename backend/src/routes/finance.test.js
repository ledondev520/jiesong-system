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

test('finance: 脱敏资料库路由在年月通配路由前注册且带角色校验', () => {
  const router = require('./finance');
  const summaryIndex = getRouteIndex(router, '/statements/evidence/summary', 'get');
  const listIndex = getRouteIndex(router, '/statements/evidence/documents', 'get');
  const detailIndex = getRouteIndex(router, '/statements/evidence/documents/:id', 'get');
  const periodIndex = getRouteIndex(router, '/statements/:year/:month', 'get');

  assert.ok(summaryIndex >= 0 && summaryIndex < periodIndex);
  assert.ok(listIndex >= 0 && listIndex < periodIndex);
  assert.ok(detailIndex >= 0 && detailIndex < periodIndex);
  assert.ok(router.stack[summaryIndex].route.stack.length >= 2);
  assert.ok(router.stack[listIndex].route.stack.length >= 2);
  assert.ok(router.stack[detailIndex].route.stack.length >= 2);
});
