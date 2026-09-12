const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('../backend/node_modules/xlsx');
const { parseSource, buildPlan } = require('./sync_shipment_summary');

const row = { row: 2, contractNo: 'EXP260011', productName: 'test', storeName: 'store', shippedAt: '2026-09-11', data: { quantity: 10, boxes: 2, grossWeight: 8 } };
const state = {
  contracts: [{ id: 'c', contractNo: row.contractNo, status: 'PACKING', _count: { items: 0, inventories: 0 } }],
  packing: [{ id: 'p', salesContractId: 'c', contractNo: row.contractNo, product: { customsName: 'test' }, store: { name: 'store' }, quantity: 5, boxes: 1, grossWeight: 4, unitPrice: 9, _count: { customsDeclarationItems: 0 } }],
  products: [{ id: 'prod', customsName: 'test' }], stores: [{ id: 'store', name: 'store' }],
};
test('同步实际发运和唯一装箱行，保留价格，重复执行无变更', () => {
  const source = { rows: [row], conflicts: [] };
  const plan = buildPlan(source, state, '2026-09-12');
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.operations.find(o => o.model === 'salesContract').data.status, 'SHIPPED');
  assert.equal(plan.operations.find(o => o.model === 'packingItem').data.quantity, 10);
  assert(!plan.operations.some(o => 'unitPrice' in o.data || 'totalAmount' in o.data));
  const after = structuredClone(state);
  for (const op of plan.operations) Object.assign((op.model === 'salesContract' ? after.contracts : after.packing).find(v => v.id === op.id), op.data);
  assert.equal(buildPlan(source, after, '2026-09-12').operations.length, 0);
});
test('重复业务键、已报关行和未来日期不被猜测覆盖，新合同保留默认参考汇率', () => {
  const duplicate = buildPlan({ rows: [row, { ...row, row: 3 }], conflicts: [] }, state, '2026-09-12');
  assert(!duplicate.operations.some(o => o.model === 'packingItem'));
  const linked = structuredClone(state); linked.packing[0]._count.customsDeclarationItems = 1;
  assert(!buildPlan({ rows: [row], conflicts: [] }, linked, '2026-09-12').operations.some(o => o.model === 'packingItem'));
  const future = buildPlan({ rows: [{ ...row, shippedAt: '2027-01-01' }], conflicts: [] }, state, '2026-09-12');
  assert(!future.operations.some(o => o.data.status === 'SHIPPED'));
  const fresh = buildPlan({ rows: [{ ...row, contractNo: 'EXP260012', shippedAt: undefined }], conflicts: [] }, state, '2026-09-12');
  const create = fresh.operations.find(o => o.model === 'salesContract');
  assert.equal(create.create, true); assert.equal(create.data.status, 'PACKING'); assert.equal(create.data.exchangeRate, 7);
});
test('解析工作簿时拒绝非法数字，空单元格不生成清空操作', () => {
  const headers = ['报关名', '门店', '合同号', '出货日期', '报关数量', '箱数', '毛重', '净重', '体积', '单位', '规格', '商品补充信息', '厂家', '购销合同号'];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, ['test', 'store', 'EXP260011', new Date('2026-09-11T00:00:00Z'), 10], ['bad', 'store', 'EXP260011', null, -1]]), '出货总清单');
  const source = parseSource(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  assert.equal(source.rows.length, 2); assert.equal(source.conflicts.length, 1); assert.equal(source.rows[1].invalid, true);
  assert.deepEqual(source.rows[0].data, { quantity: 10 });
});
