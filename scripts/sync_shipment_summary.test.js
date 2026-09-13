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
test('无箱重金额的剩余货按明确两件商品拆解，不能重复分摊已有箱数', () => {
  const headers = ['报关名', '门店', '合同号', '出货日期', '报关数量', '箱数', '毛重', '净重', '体积', '单位', '规格', '商品补充信息', '厂家', '购销合同号'];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers,
    ['剩余货', 'A', 'EXP260001', null, null, null, null, null, null, null, null, '1玻璃门，1不锈钢门，淘宝买'],
    ['剩余货', 'A', 'EXP260002', null, null, 2, null, null, null, null, null, '1玻璃门，1不锈钢门，淘宝买'],
  ]), '出货总清单');
  const source = parseSource(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  assert.deepEqual(source.rows.slice(0, 2).map(r => [r.productName, r.data.quantity, r.row]), [['玻璃门', 1, 2], ['不锈钢门', 1, 2]]);
  assert.equal(source.rows[2].productName, '剩余货');
  assert(!('boxes' in source.rows[0].data));
});
test('片数和平方米按板材毫米规格交叉验证，单位或面积不符仍保留冲突', () => {
  const headers = ['报关名', '门店', '合同号', '出货日期', '报关数量', '箱数', '毛重', '净重', '体积', '单位', '规格', '商品补充信息', '厂家', '购销合同号'];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers,
    ['岩板（瓷砖', 'A', 'EXP260001', null, '17（48.96', 1, 1452, 1350, 3, '片（平方米', '1200*2400', '小样'],
    ['岩板', 'A', 'EXP260002', null, '17（49', 1, 1452, 1350, 3, '片（平方米', '1200*2400'],
    ['门', 'A', 'EXP260003', null, '17（48.96', 1, null, null, null, '套（平方米', '1200*2400'],
  ]), '出货总清单');
  const source = parseSource(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  assert.equal(source.rows[0].data.quantity, 17);
  assert.equal(source.rows[0].data.unit, '片');
  assert.match(source.rows[0].data.supplement, /48.96平方米/);
  assert.equal(source.rows[1].invalid, true);
  assert.equal(source.rows[2].invalid, true);
});
test('分店数量加总精确等于括号合计时识别分店数，不接受无法抵平的注释', () => {
  const headers = ['报关名', '门店', '合同号', '出货日期', '报关数量', '箱数', '毛重', '净重', '体积', '单位', '规格', '商品补充信息', '厂家', '购销合同号'];
  const workbook = XLSX.utils.book_new();
  const values = [
    ['板材', 'A', 'EXP260001', null, '29（60', null, null, null, null, '平方米'],
    ['板材', 'B', 'EXP260001', null, 31, null, null, null, null, '平方米'],
    ['机柜', 'A', 'EXP260002', null, '2（6）', null, null, null, null, '个'],
    ['机柜', 'B', 'EXP260002', null, 2, null, null, null, null, '个'],
    ['机柜', 'C', 'EXP260002', null, 2, null, null, null, null, '个'],
    ['门', 'A', 'EXP260003', null, '6（2', null, null, null, null, '套'],
    ['其他板材', 'A', 'EXP260004', null, '29（60', null, null, null, null, '平方米'],
    ['其他板材', 'B', 'EXP260004', null, 30, null, null, null, null, '平方米'],
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, ...values]), '出货总清单');
  const source = parseSource(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  assert.equal(source.rows[0].data.quantity, 29);
  assert.equal(source.rows[2].data.quantity, 2);
  assert.equal(source.rows[5].invalid, true);
  assert.equal(source.rows[6].invalid, true);
});
test('唯一匹配的空采购成本按源补齐，已有差异只提示，不改收付款或售价', () => {
  const headers = ['报关名', '门店', '合同号', '出货日期', '报关数量', '箱数', '毛重', '净重', '体积', '单位', '规格', '商品补充信息', '厂家', '购销合同号', '采购金额'];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, ['test', 'store', row.contractNo, null, 10, 2, 8, null, null, null, null, null, null, null, '1,234.50']]), '出货总清单');
  const source = parseSource(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  assert.equal(source.rows[0].sourcePurchaseCost, 1234.5);
  assert(!('purchaseCost' in source.rows[0].data));
  for (const cost of [null, 999, 1234.5]) {
    const current = structuredClone(state); current.packing[0].purchaseCost = cost;
    const plan = buildPlan(source, current, '2026-09-12');
    assert.equal(plan.conflicts.some(c => c.reason.includes('采购金额')), cost === 999);
    assert.equal(plan.operations.some(op => op.data.purchaseCost === 1234.5), cost === null);
    assert(!plan.operations.some(op => ['unitPrice', 'totalPrice', 'paidAmount'].some(k => k in op.data)));
  }
  const fresh = buildPlan(source, { ...state, packing: [] }, '2026-09-12');
  assert.equal(fresh.operations.find(op => op.model === 'packingItem' && op.create).data.purchaseCost, 1234.5);
  const duplicate = structuredClone(state);
  duplicate.packing = ['p1', 'p2'].map(id => ({ ...duplicate.packing[0], id, quantity: 10, boxes: 2, grossWeight: 8, netWeight: 7 }));
  const sameGoods = { ...source.rows[0], data: { ...source.rows[0].data, netWeight: 7 } };
  const ambiguous = buildPlan({ rows: [sameGoods, { ...sameGoods, row: 3, sourcePurchaseCost: 2345 }], conflicts: [] }, duplicate, '2026-09-12');
  assert(!ambiguous.operations.some(op => op.model === 'packingItem'));
  const rounded = structuredClone(state); rounded.packing[0].purchaseCost = 1234.5;
  for (const value of [1234.504, 1234.506]) {
    const plan = buildPlan({ rows: [{ ...source.rows[0], sourcePurchaseCost: value }], conflicts: [] }, rounded, '2026-09-12');
    assert.equal(plan.conflicts.some(c => c.reason.includes('采购金额')), value === 1234.506);
  }
});
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
test('核实的历史名称别名只匹配同一商品门店，不新增主数据',()=>{
 const s=structuredClone(state);s.packing[0].product.customsName='玻璃酒瓶';s.packing[0].store.name='安纳汉姆';
 const r={...row,productName:'玻璃瓶（玻璃酒瓶',storeName:'安娜汉姆'};
 const plan=buildPlan({rows:[r],conflicts:[]},s,'2026-09-12');assert(plan.operations.some(o=>o.id==='p'));assert(!plan.operations.some(o=>o.create));
});
test('同数量箱数的不同批次需毛重净重双向唯一，完全重复源行仍拒绝',()=>{
 const s=structuredClone(state);s.packing=[{...s.packing[0],quantity:10,boxes:2,grossWeight:8,netWeight:7},{...s.packing[0],id:'p2',quantity:10,boxes:2,grossWeight:9,netWeight:8}];
 const rows=[{...row,data:{...row.data,netWeight:7,manufacturer:'A'}},{...row,row:3,data:{...row.data,grossWeight:9,netWeight:8,manufacturer:'B'}}];
 const ops=buildPlan({rows,conflicts:[]},s,'2026-09-12').operations.filter(o=>o.model==='packingItem');
 assert.deepEqual(ops.map(o=>[o.id,o.data.manufacturer]),[['p','A'],['p2','B']]);
});
test('完全相同两批货只有源库行数相等时可分别更新，不能合并或凭空补行',()=>{
 const s=structuredClone(state);s.packing=[{...s.packing[0],quantity:10,boxes:2,grossWeight:8,netWeight:7},{...s.packing[0],id:'p2',quantity:10,boxes:2,grossWeight:8,netWeight:7}];
 const r={...row,data:{...row.data,netWeight:7,manufacturer:'A'}};const rows=[r,{...r,row:3}];
 const ops=buildPlan({rows,conflicts:[]},s,'2026-09-12').operations.filter(o=>o.model==='packingItem');assert.deepEqual(ops.map(o=>o.id),['p','p2']);assert(ops.every(o=>!o.create));
 s.packing.pop();assert.equal(buildPlan({rows,conflicts:[]},s,'2026-09-12').operations.filter(o=>o.model==='packingItem').length,0);
});
test('合同汇总提示列出未匹配旧装箱行，便于逐条审计而不是只报总数',()=>{
 const s=structuredClone(state);s.packing.push({...s.packing[0],id:'extra',product:{customsName:'旧货物'}});
 const p=buildPlan({rows:[row],conflicts:[]},s,'2026-09-12');
 assert.deepEqual(p.conflicts.find(c=>c.reason==='明细尚未完整对齐，保留合同汇总数').unmatchedPackingIds,['extra']);
});
test('正式装箱行的喷涂铝型材与汇总基础名匹配，保留价格且不创建副本',()=>{
 const s=structuredClone(state);s.packing[0].product.customsName='铝型材（喷涂）';s.packing[0].unitPrice=7;s.packing[0].totalPrice=70;
 const r={...row,productName:'铝型材'};const plan=buildPlan({rows:[r],conflicts:[]},s,'2026-09-12');
 const op=plan.operations.find(o=>o.id==='p');assert(op);assert(!('unitPrice' in op.data));assert(!('totalPrice' in op.data));assert(!plan.operations.some(o=>o.create));
 s.packing.push({...s.packing[0],id:'other',product:{customsName:'铝型材'}});
 assert.equal(buildPlan({rows:[r],conflicts:[]},s,'2026-09-12').operations.filter(o=>o.model==='packingItem').length,0);
});
