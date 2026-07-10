/**
 * Input: sales 路由模块
 * Output: 销售路由匹配顺序回归测试结果
 * Pos: 销售路由层测试，保障静态路由优先级
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const salesRouter = require('./sales');

/**
 * 职责：按 path + method 获取路由栈索引
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

const getRouteHandlers = (router, path, method) => {
  const layer = router.stack.find((item) => item.route?.path === path && item.route.methods?.[method]);
  return layer?.route?.stack || [];
};

const invokeExportHandler = async (path) => {
  const handlers = getRouteHandlers(salesRouter, path, 'get');
  const nextCapture = { error: null };
  const req = { params: { id: 'not-found' } };
  const res = {
    setHeader() {},
    send() {},
  };

  await handlers.at(-1).handle(req, res, (error) => {
    nextCapture.error = error;
  });

  return nextCapture.error;
};

test('sales route order: /options/next-no must be before /:id for GET', () => {
  const optionsIndex = getRouteIndex(salesRouter, '/options/next-no', 'get');
  const idIndex = getRouteIndex(salesRouter, '/:id', 'get');

  assert.notEqual(optionsIndex, -1, '缺少 GET /options/next-no 路由');
  assert.notEqual(idIndex, -1, '缺少 GET /:id 路由');
  assert.ok(
    optionsIndex < idIndex,
    `路由顺序错误：/options/next-no(index=${optionsIndex}) 应在 /:id(index=${idIndex}) 之前`
  );
});

test('sales route includes PDF export endpoint', () => {
  const pdfExportIndex = getRouteIndex(salesRouter, '/:id/export-pdf', 'get');
  assert.notEqual(pdfExportIndex, -1, '缺少 GET /:id/export-pdf 路由');
});

test('sales route includes persistent packing-list check history and review endpoints', () => {
  assert.notEqual(getRouteIndex(salesRouter, '/:id/packing-list-check', 'post'), -1);
  assert.notEqual(getRouteIndex(salesRouter, '/:id/packing-list-checks', 'get'), -1);
  assert.notEqual(getRouteIndex(salesRouter, '/:id/packing-list-checks/:checkId/review', 'put'), -1);
});

test('sales export routes: 缺失合同时将404错误传给 next', async () => {
  const originalSalesContractFindUnique = prisma.salesContract.findUnique;
  prisma.salesContract.findUnique = async () => null;

  try {
    const excelError = await invokeExportHandler('/:id/export-excel');
    const pdfError = await invokeExportHandler('/:id/export-pdf');

    assert.equal(excelError?.statusCode, 404);
    assert.equal(pdfError?.statusCode, 404);
    assert.match(excelError?.message || '', /合同不存在/);
    assert.match(pdfError?.message || '', /合同不存在/);
  } finally {
    prisma.salesContract.findUnique = originalSalesContractFindUnique;
  }
});
