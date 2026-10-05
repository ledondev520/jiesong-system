/**
 * Input: actual Express export routes and migrated private synthetic SQLite
 * Output: parsed generic CSV field values and repeated read-only generation checks
 * Pos: ordinary settings export regression; all fixture values are non-production
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const Papa = require('papaparse');

const HEADERS = {
  suppliers: ['ID', '名称', '简称', '联系人', '电话', '邮箱', '地址', '银行账户', '质量问题', '昵称'],
  stores: ['ID', '名称', '港口', '联系人', '电话', '邮箱', '地址'],
  products: ['ID', '报关名', '描述', '规格', '单位', '分类'],
  purchases: ['合同号', '供应商', '总金额', '已付金额', '未付金额', '状态', '签订日期', '预计交货', '发票号'],
  sales: ['合同号', '总金额(USD)', '已收金额', '未收金额', '汇率', '状态', '签订日期'],
  inventory: ['ID', '商品', '数量', '单位', '状态', '货柜', '入库时间', '出库时间'],
  payments: ['ID', '类型', '金额', '币种', '付款方式', '付款日期', '关联合同', '备注'],
};

test('HTTP/SQLite: generic CSV exports retain existing fields and leave business rows unchanged', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-generic-exports-'));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-generic-export-fixture-never-for-production';
  process.env.TZ = 'UTC';
  const originalUmask = process.umask(0o077);
  let db, server;
  let sequence = 0;
  const auditRequests = new Set();
  const waitForAudit = async () => {
    if (!db || !auditRequests.size) return;
    const deadline = Date.now() + 5000;
    while (true) {
      const saved = await db.operationLog.findMany({
        where: { requestId: { in: [...auditRequests] } },
        select: { requestId: true },
      });
      const persisted = new Set(saved.map(row => row.requestId));
      if ([...auditRequests].every(id => persisted.has(id))) return;
      assert.ok(Date.now() < deadline, 'synthetic export audit writes must settle');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  };
  t.after(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
    await waitForAudit();
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
    process.umask(originalUmask);
  });
  // Only committed migrations initialize this new private fixture. No db push,
  // shared client generation, source files, or pre-existing databases are used.
  const migrations = path.resolve(__dirname, '../../prisma/migrations');
  const ddl = fs.readdirSync(migrations).sort()
    .filter(name => fs.statSync(path.join(migrations, name)).isDirectory())
    .map(name => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8')).join('\n');
  execFileSync('python3', ['-c',
    'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()',
    database], { input: ddl, timeout: 30000 });
  fs.chmodSync(database, 0o600);
  db = require('../utils/prisma');
  const user = await db.user.create({ data: {
    username: 'synthetic-generic-export-editor', name: 'Synthetic export editor',
    password: 'test-only-unused-hash', role: 'ADMIN',
  } });
  const token = require('jsonwebtoken').sign({ userId: user.id }, process.env.JWT_SECRET);
  const app = require('../app');
  server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  // Snapshot every application table through an independent read-only connection.
  // Existing export audit entries are the only allowed database side effect.
  const snapshot = () => JSON.parse(execFileSync('python3', ['-c',
    "import sqlite3,sys,json; c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); c.row_factory=sqlite3.Row; tables=[r[0] for r in c.execute(\"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'operation_logs' ORDER BY name\")]; print(json.dumps({name:[dict(row) for row in c.execute('SELECT * FROM \\\"'+name+'\\\" ORDER BY rowid')] for name in tables})); c.close()",
    database], { encoding: 'utf8', timeout: 10000 }));
  const exportCsv = async (type, audited = false) => {
    const requestId = `synthetic-export-${++sequence}`;
    const response = await fetch(`${base}${audited ? '/system' : ''}/export/${type}`, {
      headers: { authorization: `Bearer ${token}`, 'x-request-id': requestId },
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, 200, `${type} export response must succeed`);
    assert.equal(response.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.match(response.headers.get('content-disposition'), new RegExp(`^attachment; filename="${type}_\\d{4}-\\d{2}-\\d{2}\\.csv"$`));
    if (audited) auditRequests.add(requestId);
    // CSV has textual fields, not workbook cell types. Parse the actual downloaded
    // UTF-8 bytes without coercing leading zeroes or changing numeric definitions.
    const parsed = Papa.parse(bytes.toString('utf8'), { skipEmptyLines: true });
    assert.deepEqual(parsed.errors, []);
    assert.deepEqual(parsed.data[0], HEADERS[type]);
    for (const row of parsed.data) assert.equal(row.length, HEADERS[type].length);
    return { bytes, rows: parsed.data.slice(1) };
  };

  const text = 'Synthetic, "中文"\nsecond line';
  const expectedRows = {};
  await t.test('empty headers and populated CSVs round-trip existing text, date and amount fields', async () => {
    const emptyBefore = snapshot();
    for (const type of Object.keys(HEADERS)) assert.deepEqual((await exportCsv(type)).rows, []);
    assert.deepEqual(snapshot(), emptyBefore, 'empty exports must not mutate any business row');
    const supplier = await db.supplier.create({ data: {
      id: 'syn-supplier-a', name: `A ${text}`, shortName: 'Synthetic short',
      contactName: text, contactPhone: '000042', contactEmail: 'fixture@example.invalid',
      address: text, hasQualityIssue: true,
      aliases: { create: { id: 'syn-alias-a', alias: text } },
    } });
    await db.supplier.create({ data: { id: 'syn-supplier-b', name: 'B Synthetic supplier' } });
    const port = await db.port.create({ data: { id: 'syn-port', name: text, code: 'SYN' } });
    const store = await db.store.create({ data: {
      id: 'syn-store-a', name: `A ${text}`, portId: port.id,
      contactName: text, contactPhone: '000043', contactEmail: 'store@example.invalid', address: text,
    } });
    await db.store.create({ data: { id: 'syn-store-b', name: 'B Synthetic store', portId: port.id } });
    const category = await db.productCategory.create({ data: { id: 'syn-category', name: text } });
    const product = await db.product.create({ data: {
      id: 'syn-product-a', customsName: `A ${text}`, description: text,
      specification: '000044', unit: '件', categoryId: category.id,
    } });
    await db.product.create({ data: { id: 'syn-product-b', customsName: 'B Synthetic product' } });
    const purchase = await db.purchaseContract.create({ data: {
      id: 'syn-purchase-a', contractNo: 'SYN-P-000045', supplierId: supplier.id,
      totalAmount: 125.75, paidAmount: 25.5, status: 'SIGNED',
      signedAt: new Date('2026-10-01T23:45:00Z'), expectedDate: new Date('2026-10-31T00:00:00Z'),
      invoiceNo: 'SYN-000046', createdAt: new Date('2026-10-02T00:00:00Z'),
    } });
    await db.purchaseContract.create({ data: {
      id: 'syn-purchase-b', contractNo: 'SYN-P-EMPTY', supplierId: supplier.id,
      createdAt: new Date('2026-10-01T00:00:00Z'),
    } });
    const sales = await db.salesContract.create({ data: {
      id: 'syn-sales-a', contractNo: 'SYN-EXP-000047', totalAmount: 300.75,
      receivedAmount: 100.5, exchangeRate: 7.25, status: 'SHIPPED', portId: port.id,
      signedAt: new Date('2026-09-30T23:45:00Z'), createdAt: new Date('2026-10-02T00:00:00Z'),
    } });
    await db.salesContract.create({ data: {
      id: 'syn-sales-b', contractNo: 'SYN-EXP-EMPTY', exchangeRate: 7,
      createdAt: new Date('2026-10-01T00:00:00Z'),
    } });
    await db.inventory.create({ data: {
      id: 'syn-inventory-a', productId: product.id, salesContractId: sales.id,
      quantity: 3.5, unit: '件', status: 'OUTBOUND', inboundAt: new Date('2026-10-01T23:45:00Z'),
      outboundAt: new Date('2026-10-02T00:00:00Z'), createdAt: new Date('2026-10-02T00:00:00Z'),
    } });
    await db.inventory.create({ data: {
      id: 'syn-inventory-b', productId: product.id, quantity: 0,
      createdAt: new Date('2026-10-01T00:00:00Z'),
    } });
    const paymentTypes = ['PAYABLE', 'PAYABLE_PAYMENT', 'EXPENSE', 'RECEIVABLE',
      'RECEIVABLE_COLLECTION', 'INCOME', 'RECEIVABLE_RECEIPT', 'RECEIVABLE_RECEIPT_ALLOCATED'];
    const paymentRows = [];
    for (const [index, type] of paymentTypes.entries()) {
      const payable = index < 3;
      const date = `2026-10-${String(index + 1).padStart(2, '0')}`;
      const contractNo = index < 2 ? purchase.contractNo : index === 3 || index === 4 ? sales.contractNo : '';
      await db.payment.create({ data: {
        id: `syn-payment-${index}`, type, amount: index + 0.25, currency: payable ? 'CNY' : 'USD',
        paymentMethod: 'other', paymentDate: new Date(`${date}T23:45:00Z`), note: text,
        ...(index < 2 ? { purchaseContractId: purchase.id } : {}),
        ...(index === 3 || index === 4 ? { salesContractId: sales.id } : {}),
      } });
      paymentRows.unshift([`syn-payment-${index}`, payable ? '应付' : '应收', `${index + 0.25}`,
        payable ? 'CNY' : 'USD', 'other', date, contractNo, text]);
    }
    expectedRows.suppliers = [
      [supplier.id, supplier.name, 'Synthetic short', text, '000042', 'fixture@example.invalid', text, '', '是', text],
      ['syn-supplier-b', 'B Synthetic supplier', '', '', '', '', '', '', '否', ''],
    ];
    expectedRows.stores = [
      [store.id, store.name, text, text, '000043', 'store@example.invalid', text],
      ['syn-store-b', 'B Synthetic store', text, '', '', '', ''],
    ];
    expectedRows.products = [
      [product.id, product.customsName, text, '000044', '件', text],
      ['syn-product-b', 'B Synthetic product', '', '', '', ''],
    ];
    expectedRows.purchases = [
      [purchase.contractNo, supplier.name, '125.75', '25.5', '100.25', 'SIGNED', '2026-10-01', '2026-10-31', 'SYN-000046'],
      ['SYN-P-EMPTY', supplier.name, '0', '0', '0', 'DRAFT', '', '', ''],
    ];
    expectedRows.sales = [
      [sales.contractNo, '300.75', '100.5', '200.25', '7.25', 'SHIPPED', '2026-09-30'],
      ['SYN-EXP-EMPTY', '0', '0', '0', '7', 'DRAFT', ''],
    ];
    expectedRows.inventory = [
      ['syn-inventory-a', product.customsName, '3.5', '件', 'OUTBOUND', sales.contractNo, '2026-10-01', '2026-10-02'],
      ['syn-inventory-b', product.customsName, '0', '', 'PRODUCING', '', '', ''],
    ];
    expectedRows.payments = paymentRows;
    const populatedBefore = snapshot();
    // This existing read contract groups PAYABLE_PAYMENT and EXPENSE with PAYABLE.
    // The CSV uses the same existing two display labels; no new type is introduced.
    const list = await fetch(`${base}/finance/payments?type=PAYABLE&pageSize=100`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(list.status, 200);
    const listed = (await list.json()).data.items;
    assert.deepEqual(listed.map(row => row.id).sort(), ['syn-payment-0', 'syn-payment-1', 'syn-payment-2']);
    assert.ok(listed.every(row => row.type === 'PAYABLE'));
    for (const type of Object.keys(HEADERS)) {
      assert.deepEqual((await exportCsv(type)).rows, expectedRows[type], `${type} existing CSV field values`);
    }
    assert.deepEqual(snapshot(), populatedBefore, 'content exports must not mutate business rows');
  });

  await t.test('repeated generation returns the same rows and only the existing system audit is written', async () => {
    const before = snapshot();
    for (const type of Object.keys(HEADERS)) {
      const ordinary = await exportCsv(type);
      const first = await exportCsv(type, true);
      const second = await exportCsv(type, true);
      assert.deepEqual(first.bytes, ordinary.bytes, `${type} both supported routes must emit the same CSV`);
      assert.deepEqual(second.bytes, first.bytes, `${type} repeated generation must not duplicate or alter rows`);
      assert.equal(first.rows.length, expectedRows[type].length);
    }
    await waitForAudit();
    const saved = await db.operationLog.findMany({ where: { requestId: { in: [...auditRequests] } } });
    assert.equal(saved.length, Object.keys(HEADERS).length * 2);
    assert.ok(saved.every(row => row.entity === 'DataExport' && row.action === 'EXPORT'));
    assert.deepEqual(snapshot(), before, 'repeated exports must preserve every non-audit table including timestamps');
    assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
    assert.equal(fs.statSync(database).mode & 0o777, 0o600);
  });
});
