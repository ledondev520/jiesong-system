/**
 * Input: 桩化的 containerService 与 WAREHOUSE / SALES 角色
 * Output: A70：货柜装箱明细读写响应对 WAREHOUSE 不含 invoiceNo/purchaseCost（OD-2/OD-3/OD-7），其他角色原样，USD 行价保留（OD-6）
 * Pos: 后端控制器测试
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const containerService = require('../services/containerService');
const containers = require('./containerController');

const item = () => ({ id: 'i1', invoiceNo: 'INV-1', purchaseCost: 99, unitPrice: 5, totalPrice: 50, product: { id: 'p1' } });

const call = async (t, name, method, result, role) => {
  const original = containerService[method];
  containerService[method] = async () => result;
  t.after(() => { containerService[method] = original; });
  let body;
  const res = { status() { return this; }, json(value) { body = value; } };
  await containers[name]({ params: { id: 'c1', itemId: 'i1' }, query: {}, body: {}, user: { id: 'u1', role } }, res, (e) => { throw e; });
  return body.data;
};

const cases = [
  ['GET /containers/:id/items', 'listItems', 'listItems', () => [item()], (d) => d[0]],
  ['GET /containers/:id/products', 'getProducts', 'getProducts', () => [item()], (d) => d[0]],
  ['GET /containers/:id/visualization', 'getVisualization', 'getVisualization', () => ({ layout: [item()] }), (d) => d.layout[0]],
  ['POST /containers/:id/items', 'addItem', 'addItem', item, (d) => d],
  ['PUT /containers/:id/items/:itemId', 'updateItem', 'updateItem', item, (d) => d],
];

for (const [label, name, method, make, pick] of cases) {
  test(`A70：${label} 对 WAREHOUSE 去掉 invoiceNo/purchaseCost，其他角色原样`, async (t) => {
    const wh = pick(await call(t, name, method, make(), 'WAREHOUSE'));
    for (const key of ['invoiceNo', 'purchaseCost']) assert.equal(key in wh, false, key);
    assert.equal(wh.unitPrice, 5); // OD-6：USD 行价保留
    const sa = pick(await call(t, name, method, make(), 'SALES'));
    assert.equal(sa.invoiceNo, 'INV-1');
    assert.equal(sa.purchaseCost, 99);
  });
}
