/**
 * Input: tax module route files + route index
 * Output: 出口退税模块路由覆盖测试
 * Pos: 后端路由层测试，确保税退模块 CRUD 入口已注册
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const customsDeclarationsRouter = require('./customsDeclarations');
const forexVerificationsRouter = require('./forexVerifications');
const taxRefundsRouter = require('./taxRefunds');
const taxRatesRouter = require('./taxRates');
const indexRouter = require('./index');

const getRouteIndex = (router, path, method) => {
  return router.stack.findIndex((layer) => {
    if (!layer.route) return false;
    return layer.route.path === path && Boolean(layer.route.methods?.[method]);
  });
};

const assertCrudRoutes = (router, label) => {
  assert.notEqual(getRouteIndex(router, '/', 'get'), -1, `${label} 缺少 GET /`);
  assert.notEqual(getRouteIndex(router, '/', 'post'), -1, `${label} 缺少 POST /`);
  assert.notEqual(getRouteIndex(router, '/:id', 'get'), -1, `${label} 缺少 GET /:id`);
  assert.notEqual(getRouteIndex(router, '/:id', 'put'), -1, `${label} 缺少 PUT /:id`);
  assert.notEqual(getRouteIndex(router, '/:id', 'delete'), -1, `${label} 缺少 DELETE /:id`);
};

test('tax modules: customs declarations router exposes CRUD routes', () => {
  assertCrudRoutes(customsDeclarationsRouter, 'customsDeclarations');
  const autoDraftIndex = getRouteIndex(customsDeclarationsRouter, '/auto-drafts', 'post');
  const detailIndex = getRouteIndex(customsDeclarationsRouter, '/:id', 'get');

  assert.notEqual(autoDraftIndex, -1, 'customsDeclarations 缺少 POST /auto-drafts');
  assert.ok(autoDraftIndex < detailIndex, 'customsDeclarations /auto-drafts 必须位于 /:id 之前');
});

test('tax modules: forex verifications router exposes CRUD routes', () => {
  assertCrudRoutes(forexVerificationsRouter, 'forexVerifications');
});

test('tax modules: tax refunds router exposes CRUD routes', () => {
  assertCrudRoutes(taxRefundsRouter, 'taxRefunds');
  const autoDraftIndex = getRouteIndex(taxRefundsRouter, '/auto-drafts', 'post');
  const exportIndex = getRouteIndex(taxRefundsRouter, '/export', 'post');
  const workbenchIndex = getRouteIndex(taxRefundsRouter, '/workbench', 'get');
  const invoiceVerificationIndex = getRouteIndex(taxRefundsRouter, '/workbench/:salesContractId/invoice-verification', 'get');
  const detailIndex = getRouteIndex(taxRefundsRouter, '/:id', 'get');

  assert.notEqual(autoDraftIndex, -1, 'taxRefunds 缺少 POST /auto-drafts');
  assert.notEqual(exportIndex, -1, 'taxRefunds 缺少 POST /export');
  assert.notEqual(workbenchIndex, -1, 'taxRefunds 缺少 GET /workbench');
  assert.notEqual(invoiceVerificationIndex, -1, 'taxRefunds 缺少 GET /workbench/:salesContractId/invoice-verification');
  assert.ok(autoDraftIndex < detailIndex, 'taxRefunds /auto-drafts 必须位于 /:id 之前');
  assert.ok(exportIndex < detailIndex, 'taxRefunds /export 必须位于 /:id 之前');
  assert.ok(workbenchIndex < detailIndex, 'taxRefunds /workbench 必须位于 /:id 之前');
});

test('tax modules: tax rates router exposes CRUD routes', () => {
  assertCrudRoutes(taxRatesRouter, 'taxRates');
});

test('tax modules: route index mounts all module routers', () => {
  const mountedPaths = indexRouter.stack
    .filter((layer) => layer.name === 'router' && layer.regexp)
    .map((layer) => String(layer.regexp));

  assert.ok(
    mountedPaths.some((entry) => entry.includes('customs-declarations')),
    '缺少 /customs-declarations 路由挂载',
  );
  assert.ok(
    mountedPaths.some((entry) => entry.includes('forex-verifications')),
    '缺少 /forex-verifications 路由挂载',
  );
  assert.ok(
    mountedPaths.some((entry) => entry.includes('tax-refunds')),
    '缺少 /tax-refunds 路由挂载',
  );
  assert.ok(
    mountedPaths.some((entry) => entry.includes('tax-rates')),
    '缺少 /tax-rates 路由挂载',
  );
});
