/**
 * Input: purchases 路由模块
 * Output: 采购路由匹配顺序回归测试结果
 * Pos: 采购路由层测试，保障静态路由优先级
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const purchasesRouter = require('./purchases');

/**
 * 职责：按指定 path + method 查找在 router stack 中的顺序索引
 * 思路：
 * 1. 遍历 stack，筛选 route layer
 * 2. 匹配目标 path 与 method
 * 3. 返回首次匹配索引，不存在返回 -1
 * @param {import('express').Router} router - Express Router 实例
 * @param {string} path - 路由路径
 * @param {string} method - HTTP 方法（小写）
 * @returns {number} 路由在 stack 中的索引
 */
const getRouteIndex = (router, path, method) => {
  return router.stack.findIndex((layer) => {
    if (!layer.route) return false;
    return layer.route.path === path && Boolean(layer.route.methods?.[method]);
  });
};

test('purchases route order: /options/next-no must be before /:id for GET', () => {
  const optionsIndex = getRouteIndex(purchasesRouter, '/options/next-no', 'get');
  const idIndex = getRouteIndex(purchasesRouter, '/:id', 'get');

  assert.notEqual(optionsIndex, -1, '缺少 GET /options/next-no 路由');
  assert.notEqual(idIndex, -1, '缺少 GET /:id 路由');
  assert.ok(
    optionsIndex < idIndex,
    `路由顺序错误：/options/next-no(index=${optionsIndex}) 应在 /:id(index=${idIndex}) 之前`
  );
});

test('purchases route includes batch production detail update before status completion', () => {
  const productionIndex = getRouteIndex(purchasesRouter, '/:id/production-details', 'put');
  const statusIndex = getRouteIndex(purchasesRouter, '/:id/status', 'put');

  assert.notEqual(productionIndex, -1, '缺少 PUT /:id/production-details 路由');
  assert.notEqual(statusIndex, -1, '缺少 PUT /:id/status 路由');
  assert.ok(productionIndex < statusIndex, '生产资料路由应在状态推进路由前注册');
});

test('purchases route exposes one invoice preparation/read-write flow under the purchase contract', () => {
  assert.notEqual(getRouteIndex(purchasesRouter, '/:id/invoice-preparation', 'get'), -1);
  assert.notEqual(getRouteIndex(purchasesRouter, '/:id/invoice-numbers', 'put'), -1);
});


test('分批到货/验货写入限真实采购/仓库用户，完整验货证据可分页读取', () => {
  for (const path of ['/:id/receipts', '/:id/receipts/:receiptId/inspection']) {
    const route = purchasesRouter.stack.find(layer => layer.route?.path === path && layer.route.methods.post).route;
    const gate = route.stack.find(layer => layer.handle.isRoleAuth)?.handle;
    assert.deepEqual(gate.allowedRoles, ['ADMIN', 'PURCHASE', 'WAREHOUSE']);
    let denied;
    gate({ user: { role: 'BOSS' } }, {}, error => { denied = error; });
    assert.equal(denied.statusCode, 403);
  }
  assert.notEqual(getRouteIndex(purchasesRouter, '/:id/receipts', 'get'), -1);
  assert.notEqual(getRouteIndex(purchasesRouter, '/:id/receipts/:receiptId/inspections', 'get'), -1);
});
