/** 合成Excel与内存Prisma桩；不接触真实供应商、采购合同或业务数据库。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const xlsx = require('xlsx');
const { exportPurchasesExcel, importPurchasesExcel } = require('./purchaseImportExportService');
const prisma = require('../utils/prisma');

const setup = (t) => {
  const rows = [];
  const originals = [];
  const stub = (model, key, fn) => { originals.push([model, key, model[key]]); model[key] = fn; };
  stub(prisma.supplier, 'findMany', async () => [{ id: 'supplier-1', name: '合成供应商' }]);
  stub(prisma.purchaseContract, 'findMany', async () => []);
  stub(prisma.purchaseContract, 'findUnique', async ({ where }) => rows.find(row => row.contractNo === where.contractNo) || null);
  stub(prisma.purchaseContract, 'count', async () => rows.length);
  stub(prisma.purchaseContract, 'create', async ({ data }) => { rows.push(data); return { id: `pc-${rows.length}`, ...data }; });
  stub(prisma.user, 'findUnique', async ({ where }) => ({ id: where.id, role: where.id === 'admin-1' ? 'ADMIN' : 'PURCHASE', isActive: true }));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-purchase-import-test-'));
  fs.chmodSync(directory, 0o700);
  t.after(() => { for (const [model, key, original] of originals) model[key] = original; fs.rmSync(directory, { recursive: true, force: true }); });
  return { rows, file(statuses) {
    const book = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(book, xlsx.utils.aoa_to_sheet([
      ['合同编号', '供应商名称', '签订日期', '总金额', '状态'],
      ...statuses.map((status, index) => [`SYNTHETIC-${index}`, '合成供应商', '2026-10-01', 100, status]),
    ]), '采购合同');
    const file = path.join(directory, 'synthetic.xlsx');
    xlsx.writeFile(book, file); fs.chmodSync(file, 0o600); return file;
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
