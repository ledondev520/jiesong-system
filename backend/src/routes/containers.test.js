/**
 * Input: containers 路由模块
 * Output: 货柜路由匹配顺序回归测试结果
 * Pos: 货柜路由层测试，保障静态路由优先级
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const containersRouter = require('./containers');

const getRouteIndex = (router, path, method) => {
  return router.stack.findIndex((layer) => {
    if (!layer.route) return false;
    return layer.route.path === path && Boolean(layer.route.methods?.[method]);
  });
};

test('containers route order: /next-no/:portId must be before /:id for GET', () => {
  const nextNoIndex = getRouteIndex(containersRouter, '/next-no/:portId', 'get');
  const idIndex = getRouteIndex(containersRouter, '/:id', 'get');

  assert.notEqual(nextNoIndex, -1, '缺少 GET /next-no/:portId 路由');
  assert.notEqual(idIndex, -1, '缺少 GET /:id 路由');
  assert.ok(
    nextNoIndex < idIndex,
    `路由顺序错误：/next-no/:portId(index=${nextNoIndex}) 应在 /:id(index=${idIndex}) 之前`
  );
});

test('containers route includes visualization endpoint', () => {
  const visualizationIndex = getRouteIndex(containersRouter, '/:id/visualization', 'get');
  assert.notEqual(visualizationIndex, -1, '缺少 GET /:id/visualization 路由');
});
