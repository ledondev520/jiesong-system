/**
 * Input: inventory 路由模块
 * Output: 库存路由静态优先级回归测试结果
 * Pos: 库存路由层测试，保障静态路由不被动态路由覆盖
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const inventoryRouter = require('./inventory');

/**
 * 职责：按 path + method 获取路由栈索引。
 * @param {import('express').Router} router Router实例
 * @param {string} path 路由path
 * @param {string} method HTTP方法（小写）
 * @returns {number} 索引，不存在返回-1
 */
const getRouteIndex = (router, path, method) => {
  return router.stack.findIndex((layer) => {
    if (!layer.route) return false;
    return layer.route.path === path && Boolean(layer.route.methods?.[method]);
  });
};

test('inventory route order: /batch-status must be before /:id for PUT', () => {
  const batchIndex = getRouteIndex(inventoryRouter, '/batch-status', 'put');
  const idStatusIndex = getRouteIndex(inventoryRouter, '/:id/status', 'put');

  assert.notEqual(batchIndex, -1, '缺少 PUT /batch-status 路由');
  assert.notEqual(idStatusIndex, -1, '缺少 PUT /:id/status 路由');
  assert.ok(
    batchIndex < idStatusIndex,
    `路由顺序错误：/batch-status(index=${batchIndex}) 应在 /:id/status(index=${idStatusIndex}) 之前`
  );
});

test('inventory route order: /alerts must be before /:id for GET', () => {
  const alertsIndex = getRouteIndex(inventoryRouter, '/alerts', 'get');
  const idIndex = getRouteIndex(inventoryRouter, '/:id', 'get');

  assert.notEqual(alertsIndex, -1, '缺少 GET /alerts 路由');
  assert.notEqual(idIndex, -1, '缺少 GET /:id 路由');
  assert.ok(
    alertsIndex < idIndex,
    `路由顺序错误：/alerts(index=${alertsIndex}) 应在 /:id(index=${idIndex}) 之前`,
  );
});
