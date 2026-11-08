/**
 * Input: 桩化的 containerService 与 WAREHOUSE / SALES 角色
 * Output: A68：货柜读接口响应对 WAREHOUSE 不含合同总额、已收金额与收款记录，其他角色原样
 * Pos: 后端控制器测试
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const containerService = require('../services/containerService');
const containers = require('./containerController');

const row = () => ({ id: 'c1', status: 'CONFIRMED', totalAmount: 1234, receivedAmount: 321, payments: [{ id: 'p1', amount: 321 }] });

const call = async (t, name, method, result, role) => {
  const original = containerService[method];
  containerService[method] = async () => result;
  t.after(() => { containerService[method] = original; });
  let body;
  const res = { status() { return this; }, json(value) { body = value; } };
  await containers[name]({ params: { id: 'c1' }, query: {}, user: { id: 'u1', role } }, res, (e) => { throw e; });
  return body.data;
};

const cases = [
  ['GET /containers', 'list', 'list', () => ({ items: [row()], total: 1 }), (d) => d.items[0]],
  ['GET /containers/:id', 'getById', 'getById', row, (d) => d],
  ['GET /containers/:id/items-summary', 'getItemsSummary', 'getItemsSummary', () => ({ itemCount: 2, totalBoxes: 5, totalAmount: 1234 }), (d) => d],
];

for (const [label, name, method, make, pick] of cases) {
  test(`A68：${label} 对 WAREHOUSE 去掉总额/已收/收款记录，其他角色原样`, async (t) => {
    const wh = pick(await call(t, name, method, make(), 'WAREHOUSE'));
    for (const key of ['totalAmount', 'receivedAmount', 'payments']) assert.equal(key in wh, false, key);
    const sa = pick(await call(t, name, method, make(), 'SALES'));
    assert.equal(sa.totalAmount, 1234);
  });
}
