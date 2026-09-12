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
  assert(!buildPlan({ rows: [row], conflicts: [] }, linked, '2026-09-12').operations.some(o => o.model === 'packingItem' && 'quantity' in o.data));
  const future = buildPlan({ rows: [{ ...row, shippedAt: '2027-01-01' }], conflicts: [] }, state, '2026-09-12');
  assert(!future.operations.some(o => o.data.status === 'SHIPPED'));
  const fresh = buildPlan({ rows: [{ ...row, contractNo: 'EXP260012', shippedAt: undefined }], conflicts: [] }, state, '2026-09-12');
  const create = fresh.operations.find(o => o.model === 'salesContract');
  assert.equal(create.create, true); assert.equal(create.data.status, 'PACKING'); assert.equal(create.data.exchangeRate, 7);
});
test('解析工作簿时拒绝非法数字，空单元格不生成清空操作', () => {
  const headers = ['报关名', '门店', '合同号', '出货日期', '报关数量', '箱数', '毛重', '净重', '体积', '单位', '规格', '商品补充信息', '厂家', '购销合同号'];
  const workbook = XLSX.utils.book_new();
  const serial = Date.UTC(2026, 8, 11) / 86400000 + 25569;
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, ['test', 'store', 'EXP260011', serial, 10], ['bad', 'store', 'EXP260011', null, -1]]), '出货总清单');
  const source = parseSource(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  assert.equal(source.rows.length, 2); assert.equal(source.conflicts.length, 1); assert.equal(source.rows[1].invalid, true);
  assert.deepEqual(source.rows[0].data, { quantity: 10 });
  assert.equal(source.rows[0].shippedAt, '2026-09-11');
});
test('出货汇总优先纠正已关联行的装箱资料，数量和财务关联继续单独核对',()=>{
 const linked=structuredClone(state);linked.packing[0]._count.customsDeclarationItems=1;
 linked.packing[0].purchaseContractNo='CG001';linked.packing[0].manufacturer='旧简称';
 const source={rows:[{...row,data:{...row.data,purchaseContractNo:'CG001',manufacturer:'正式厂家有限公司',specification:'720*470*470',supplement:'新款',unit:'个'}}],conflicts:[]};
 const plan=buildPlan(source,linked,'2026-09-12');
 const ops=plan.operations.filter(o=>o.model==='packingItem');
 assert.deepEqual(ops.map(o=>o.data),[{boxes:2,grossWeight:8,manufacturer:'正式厂家有限公司',specification:'720*470*470',supplement:'新款',unit:'个'}]);
 assert(plan.conflicts.some(c=>c.reason.includes('数量')));
 assert(!ops.some(o=>'unitPrice' in o.data || 'quantity' in o.data || 'purchaseContractNo' in o.data));
});
test('同商品多批次用数量和箱数双向唯一匹配，不靠行顺序或重复复用记录',()=>{
 const s=structuredClone(state);s.packing=[{...s.packing[0],quantity:10,boxes:2},{...s.packing[0],id:'p2',quantity:20,boxes:4}];
 const rows=[row,{...row,row:3,data:{quantity:20,boxes:4,grossWeight:18}}];
 const plan=buildPlan({rows,conflicts:[]},s,'2026-09-12');
 assert.equal(plan.conflicts.length,0);
 assert.deepEqual(plan.operations.filter(o=>o.model==='packingItem').map(o=>[o.id,o.data.grossWeight]),[['p',8],['p2',18]]);
 const duplicate=buildPlan({rows:[row,{...row,row:3}],conflicts:[]},s,'2026-09-12');
 assert.equal(duplicate.operations.filter(o=>o.model==='packingItem').length,0);
});
test('门店英文大小写一致；缺采购号的唯一同数量同规格记录可补号，非空号不覆盖',()=>{
 const s=structuredClone(state);s.packing[0].quantity=10;s.packing[0].specification='100*200';s.packing[0]._count.customsDeclarationItems=1;
 const r={...row,storeName:'STORE',data:{quantity:10,boxes:2,specification:'100*200',purchaseContractNo:'CG001'}};
 const plan=buildPlan({rows:[r],conflicts:[]},s,'2026-09-12');
 assert(plan.operations.some(o=>o.id==='p'&&o.data.purchaseContractNo==='CG001'));
 assert(!plan.operations.some(o=>o.create));
 s.packing[0].purchaseContractNo='CG002';assert(!buildPlan({rows:[r],conflicts:[]},s,'2026-09-12').operations.some(o=>o.model==='packingItem'));
 s.packing[0].purchaseContractNo=null;s.packing.push({...s.packing[0],id:'p2'});assert(!buildPlan({rows:[r],conflicts:[]},s,'2026-09-12').operations.some(o=>o.model==='packingItem'));
});
test('只解析明确数量表达，不替含两种无标注数量或算式的单元格猜数',()=>{
 const {parseQuantity}=require('./sync_shipment_summary');
 assert.equal(parseQuantity('（6'),6);assert.equal(parseQuantity('(1480'),1480);
 assert.equal(parseQuantity('50方+50方'),100);assert.equal(parseQuantity('27.36（报75平）'),75);
 for(const raw of ['6（2','29（60','17（48.96','=3.6*1.2（8)','淘宝购买','50方+50个'])assert(Number.isNaN(parseQuantity(raw)));
});
test('已确认出货源可纠正未被报关引用的装箱数量，保留销售价格与库存记录',()=>{
 const s=structuredClone(state);s.contracts[0]._count.items=1;s.contracts[0].status='SHIPPED';
 const plan=buildPlan({rows:[row],conflicts:[]},s,'2026-09-12');const op=plan.operations.find(o=>o.id==='p');
 assert.equal(op.data.quantity,10);assert(!('unitPrice' in op.data));assert(!('totalPrice' in op.data));
});
