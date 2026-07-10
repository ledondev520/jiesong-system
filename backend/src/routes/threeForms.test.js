/**
 * Input: threeForms 路由模块
 * Output: 出口三表预览与生成路由注册回归测试
 * Pos: 路由层测试，锁定“先预览、后生成”的 Interface
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const threeFormsRouter = require('./threeForms');

const getRouteIndex = (path, method) => threeFormsRouter.stack.findIndex((layer) => (
  layer.route?.path === path && Boolean(layer.route.methods?.[method])
));

test('threeForms: 注册权威准备度预览与生成路由', () => {
  assert.notEqual(getRouteIndex('/preview', 'post'), -1, '缺少 POST /preview');
  assert.notEqual(getRouteIndex('/generate', 'post'), -1, '缺少 POST /generate');
});
