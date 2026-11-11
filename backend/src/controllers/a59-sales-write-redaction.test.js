/**
 * Input: 桩化的销售 service 与 WAREHOUSE / SALES 角色
 * Output: A59 OD-7：销售写接口响应对 WAREHOUSE 不含合同总额、已收金额与收款记录，其他角色原样
 * Pos: 后端控制器测试
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const salesService = require('../services/salesService');
const sales = require('./salesController');

const row = () => ({
  id: 'c1', status: 'CONFIRMED', totalAmount: 1234, receivedAmount: 321,
  payments: [{ id: 'p1', amount: 321 }], _revertInfo: undefined, _applyInfo: undefined,
});

const call = async (t, target, name, service, method, role, req = {}) => {
  const original = service[method];
  service[method] = async () => row();
  t.after(() => { service[method] = original; });
  let body;
  const res = { status() { return this; }, json(value) { body = value; } };
  await target[name]({ params: { id: 'c1' }, body: { status: 'CONFIRMED' }, headers: {}, query: {}, user: { id: 'u1', role }, ...req }, res, (e) => { throw e; });
  return body.data;
};

const cases = [
  ['POST /sales', sales, 'create', salesService, 'createSalesContract'],
  ['PUT /sales/:id', sales, 'update', salesService, 'updateSalesContract'],
  ['PUT /sales/:id/status', sales, 'updateStatus', salesService, 'updateSalesStatus'],
];

for (const [label, target, name, service, method] of cases) {
  test(`A59 OD-7：${label} 对 WAREHOUSE 去掉总额/已收/收款记录，保留状态`, async (t) => {
    const wh = await call(t, target, name, service, method, 'WAREHOUSE');
    for (const key of ['totalAmount', 'receivedAmount', 'payments']) assert.equal(key in wh, false, key);
    assert.equal(wh.status, 'CONFIRMED');
    const sa = await call(t, target, name, service, method, 'SALES');
    assert.equal(sa.totalAmount, 1234);
    assert.equal(sa.receivedAmount, 321);
    assert.equal(sa.payments.length, 1);
  });
}
