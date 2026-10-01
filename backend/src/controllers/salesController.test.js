/**
 * Input: salesController 模块
 * Output: 模块导出冒烟测试
 * Pos: 自动补齐基础测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');

test('salesController: 模块可正常加载并导出', () => {
  const mod = require('./salesController');
  assert.ok(mod !== undefined);
});

test('销售列表透传状态、发运期间、全量搜索与真实分页', async () => {
  const service = require('../services/salesService');
  const controller = require('./salesController');
  const original = service.getSalesContracts;
  let args; let payload;
  service.getSalesContracts = async (value) => { args = value; return { contracts: [{ id: 'synthetic-101' }], total: 121 }; };
  try {
    const res = { status() { return this; }, json(value) { payload = value; } };
    await controller.list({ query: { page: '6', pageSize: '20', keyword: '目标门店', shipped: 'true', shippedFrom: '2026-09-01', shippedTo: '2026-09-30', lite: 'true' } }, res, (error) => { throw error; });
    assert.deepEqual(args, { page: 6, pageSize: 20, status: undefined, storeId: undefined, keyword: '目标门店', shipped: 'true', shippedFrom: '2026-09-01', shippedTo: '2026-09-30', lite: true });
    assert.equal(payload.data.pagination.page, 6); assert.equal(payload.data.pagination.total, 121);
  } finally { service.getSalesContracts = original; }
});
