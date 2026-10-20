/**
 * Input: 合成 Excel 内存字节、非法路径载荷与内存 Prisma 桩
 * Output: 采购导入语义与无文件系统读取/非法输入零写入回归结果
 * Pos: 采购 Excel 服务单元测试；不接触真实业务数据库
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const xlsx = require('xlsx');
const { exportPurchasesExcel, importPurchasesExcel } = require('./purchaseImportExportService');
const prisma = require('../utils/prisma');
const prefix = `CG${new Date().getFullYear().toString().slice(-2)}`;
const numberConflict = () => Object.assign(new Error('synthetic contract number conflict'), { code: 'P2002', meta: { target: ['contractNo'] } });

const setup = (t) => {
  const rows = [];
  const originals = [];
  const stub = (model, key, fn) => { originals.push([model, key, model[key]]); model[key] = fn; };
  stub(prisma.supplier, 'findMany', async () => [{ id: 'supplier-1', name: '合成供应商' }]);
  stub(prisma.purchaseContract, 'findMany', async ({ where = {} } = {}) => rows.filter(row => !where.contractNo || row.contractNo.startsWith(where.contractNo.startsWith)));
  stub(prisma.purchaseContract, 'findUnique', async ({ where }) => rows.find(row => row.contractNo === where.contractNo) || null);
  stub(prisma.purchaseContract, 'count', async () => rows.length);
  stub(prisma.purchaseContract, 'create', async ({ data }) => {
    if (rows.some(row => row.contractNo === data.contractNo)) throw numberConflict();
    rows.push(data);
    return { id: `pc-${rows.length}`, ...data };
  });
  stub(prisma.user, 'findUnique', async ({ where }) => ({ id: where.id, role: where.id === 'admin-1' ? 'ADMIN' : 'PURCHASE', isActive: true }));
  t.after(() => { for (const [model, key, original] of originals.reverse()) model[key] = original; });
  return { rows, stub, file(statuses, contractNos) {
    const book = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(book, xlsx.utils.aoa_to_sheet([
      ['合同编号', '供应商名称', '签订日期', '总金额', '状态'],
      ...statuses.map((status, index) => [contractNos ? contractNos[index] : `SYNTHETIC-${index}`, '合成供应商', '2026-10-01', 100, status]),
    ]), '采购合同');
    return { originalname: 'synthetic.xlsx', buffer: xlsx.write(book, { type: 'buffer', bookType: 'xlsx' }) };
  } };
};

test('exportPurchasesExcel: 空数据返回合法Buffer，状态筛选保留', async (t) => {
  setup(t);
  for (const query of [{}, { status: 'DRAFT' }]) {
    const result = await exportPurchasesExcel(query);
    assert.ok(Buffer.isBuffer(result.buffer));
    assert.match(result.filename, /采购合同导出.*\.xlsx$/);
  }
});

test('普通Excel仍可导入草稿/生产中，且没有隐式状态、库存或验货写入', async (t) => {
  const f = setup(t);
  const result = await importPurchasesExcel(f.file(['草稿', '生产中']), 'purchase-1');
  assert.equal(result.successRows, 2);
  assert.deepEqual(f.rows.map(row => row.status), ['DRAFT', 'PRODUCING']);
});

test('已收货/完成仅ADMIN显式历史补录允许，普通角色和未确认ADMIN不得绕验货', async (t) => {
  const f = setup(t);
  const file = f.file(['已收货', '已完成']);
  const ordinary = await importPurchasesExcel(file, 'purchase-1');
  assert.equal(ordinary.successRows, 0);
  assert.equal(ordinary.failedRows, 2);
  assert.equal(f.rows.length, 0);
  const unconfirmed = await importPurchasesExcel(file, 'admin-1');
  assert.equal(unconfirmed.successRows, 0);
  await assert.rejects(() => importPurchasesExcel(file, 'purchase-1', { historical: true }), (error) => error.statusCode === 403);
  const confirmed = await importPurchasesExcel(file, 'admin-1', { historical: true });
  assert.equal(confirmed.successRows, 2);
  assert.deepEqual(f.rows.map(row => row.status), ['RECEIVED', 'COMPLETED']);
});

test('重复合同/无效状态保留逐行失败明细', async (t) => {
  const f = setup(t);
  const result = await importPurchasesExcel(f.file(['无效状态']), 'purchase-1');
  assert.equal(result.failedRows, 1);
  assert.equal(f.rows.length, 0);
});

test('Excel空编号越过删除空洞和自定义后缀，显式编号原样保留', async (t) => {
  const f = setup(t);
  f.rows.push(...['00001', '00004', 'ZZZZ'].map(suffix => ({ contractNo: prefix + suffix })));
  const result = await importPurchasesExcel(f.file(['草稿', '草稿', '草稿'], ['', 'SYNTHETIC-EXPLICIT', '']), 'purchase-1');
  assert.deepEqual(result, { successRows: 3, failedRows: 0, errors: [] });
  assert.deepEqual(f.rows.slice(3).map(row => row.contractNo), [`${prefix}00005`, 'SYNTHETIC-EXPLICIT', `${prefix}00006`]);
});

test('Excel编号按数字越过五位边界，失败行不写入或消耗编号', async (t) => {
  const f = setup(t);
  f.rows.push(...['99999', '100000', 'ZZZZ'].map(suffix => ({ contractNo: prefix + suffix })));
  const result = await importPurchasesExcel(f.file(['无效状态', '草稿', '草稿'], ['', '', '']), 'purchase-1');
  assert.equal(result.successRows, 2);
  assert.equal(result.failedRows, 1);
  assert.equal(result.errors[0].row, 2);
  assert.deepEqual(f.rows.slice(3).map(row => row.contractNo), [`${prefix}100001`, `${prefix}100002`]);
});

test('并发Excel空编号导入在数据库唯一冲突后重新分配，不重复记录', async (t) => {
  const f = setup(t);
  const file = f.file(['草稿'], ['']);
  const results = await Promise.all(Array.from({ length: 4 }, () => importPurchasesExcel(file, 'purchase-1')));
  for (const result of results) assert.deepEqual(result, { successRows: 1, failedRows: 0, errors: [] });
  assert.deepEqual(f.rows.map(row => row.contractNo), [1, 2, 3, 4].map(n => `${prefix}${String(n).padStart(5, '0')}`));
});

test('Excel显式编号在预检后被占用也不改号，重复行保持原错误', async (t) => {
  const f = setup(t);
  let attempts = 0;
  f.stub(prisma.purchaseContract, 'create', async ({ data }) => {
    attempts++;
    assert.equal(data.contractNo, 'SYNTHETIC-EXPLICIT');
    throw numberConflict();
  });
  const result = await importPurchasesExcel(f.file(['草稿'], ['SYNTHETIC-EXPLICIT']), 'purchase-1');
  assert.equal(result.successRows, 0);
  assert.equal(result.failedRows, 1);
  assert.equal(result.errors[0].error, 'synthetic contract number conflict');
  assert.equal(attempts, 1);
  assert.equal(f.rows.length, 0);
});

test('Excel仅重试自动合同号冲突，不重试其他唯一或数据库错误', async (t) => {
  const f = setup(t);
  for (const failure of [Object.assign(new Error('synthetic id conflict'), { code: 'P2002', meta: { target: ['id'] } }), new Error('synthetic database failure')]) {
    let attempts = 0;
    f.stub(prisma.purchaseContract, 'create', async () => { attempts++; throw failure; });
    const result = await importPurchasesExcel(f.file(['草稿'], ['']), 'purchase-1');
    assert.equal(result.successRows, 0);
    assert.equal(result.failedRows, 1);
    assert.equal(result.errors[0].error, failure.message);
    assert.equal(attempts, 1);
    assert.equal(f.rows.length, 0);
  }
});

test('Excel持续占号竞争有界重试，失败统计不包含成功写入', async (t) => {
  const f = setup(t);
  let attempts = 0;
  f.stub(prisma.purchaseContract, 'create', async () => { attempts++; throw numberConflict(); });
  const result = await importPurchasesExcel(f.file(['草稿'], ['']), 'purchase-1');
  assert.equal(result.successRows, 0);
  assert.equal(result.failedRows, 1);
  assert.equal(result.errors[0].error, '采购编号正在分配，请稍后重试');
  assert.equal(attempts, 5);
  assert.equal(f.rows.length, 0);
});

test('采购Excel服务拒绝全部路径载荷，解析前零文件读取、零数据库访问', async t => {
  const f = setup(t);
  const reads = ['existsSync', 'readFileSync', 'readFile', 'openSync', 'open'].map(key =>
    t.mock.method(fs, key, () => { throw new Error('unexpected filesystem read'); }));
  reads.push(t.mock.method(fs.promises, 'readFile', async () => { throw new Error('unexpected filesystem read'); }));
  const parse = t.mock.method(xlsx, 'read', () => { throw new Error('unexpected parser call'); });
  const dbCalls = [
    [prisma.user, 'findUnique'], [prisma.supplier, 'findMany'],
    [prisma.purchaseContract, 'findMany'], [prisma.purchaseContract, 'findUnique'],
    [prisma.purchaseContract, 'count'], [prisma.purchaseContract, 'create'],
    [prisma.purchaseContract, 'update'], [prisma.purchaseContract, 'delete'],
    [prisma, '$transaction'],
  ].map(([model, key]) => {
    // Prisma delegates are proxies; install explicit spies as in the fixture.
    const spy = t.mock.fn(async () => { throw new Error('unexpected database access'); });
    f.stub(model, key, spy);
    return spy;
  });
  const paths = [
    'synthetic.xlsx', '../evil.xlsx', '..\\evil.xlsx', '/tmp/evil.xlsx', 'C:\\evil.xlsx',
    '..%2F..%2Fevil.xlsx', '%2e%2e%5cevil.xlsx', '%252e%252e%252fevil.xlsx',
    'evil\u0000.xlsx', 'file:///tmp/evil.xlsx',
  ];
  for (const source of [...paths, ...paths.map(path => ({ originalname: 'synthetic.xlsx', path })),
    null, {}, { buffer: 'not-a-buffer' }, { buffer: new Uint8Array([1, 2]) }]) {
    for (const options of [{}, { historical: true }]) {
      await assert.rejects(() => importPurchasesExcel(source, 'admin-1', options), error => error.statusCode === 400);
    }
  }
  for (const spy of [...reads, parse, ...dbCalls]) assert.equal(spy.mock.callCount(), 0);
});

test('损坏及非Excel字节返回400且不写采购合同', async t => {
  const f = setup(t);
  for (const buffer of [Buffer.alloc(0), Buffer.from('garbage'), Buffer.from([0x50, 0x4b, 3, 4, 0]), Buffer.from('a,b\n1,2')]) {
    await assert.rejects(() => importPurchasesExcel({ originalname: 'synthetic.xlsx', buffer }, 'purchase-1'), error => error.statusCode === 400);
    assert.equal(f.rows.length, 0);
  }
});
