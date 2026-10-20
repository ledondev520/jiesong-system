/** 同一笔合成采购贯穿真实 HTTP、SQLite、分批验货、装柜、发运及退税清单；不读取业务库。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');

test('HTTP/SQLite：一笔采购两次出货守恒，库存与清单实际落库', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-lifecycle-test-'));
  fs.chmodSync(directory, 0o700);
  const dbFile = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-lifecycle-secret-never-for-production';
  let db, server;
  t.after(async () => { if (server) await new Promise(resolve => server.close(resolve)); if (db) await db.$disconnect(); fs.rmSync(directory, { recursive: true, force: true }); });
  const ddl = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.resolve(__dirname, '../../prisma/schema.prisma'), '--script'], { encoding: 'utf8', timeout: 30000 });
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', dbFile], { input: ddl });
  fs.chmodSync(dbFile, 0o600);
  db = require('../utils/prisma');
  const jwt = require('jsonwebtoken');
  const config = require('../config');
  const users = {};
  for (const role of ['ADMIN', 'PURCHASE', 'WAREHOUSE', 'SALES', 'FINANCE', 'BOSS']) {
    const user = await db.user.create({ data: { username: `synthetic-${role}`, password: 'test-only-unused-hash', name: `合成${role}`, role } });
    users[role] = { id: user.id, token: jwt.sign({ userId: user.id }, config.jwt.secret) };
  }
  const supplier = await db.supplier.create({ data: { name: '合成供应商', taxId: 'SYNTHETIC-TAX-ID' } });
  const product = await db.product.create({ data: { customsName: 'SYNTHETIC WIDGET', unit: '件', hsCode: '9999999999', declaration: '合成测试要素' } });
  const port = await db.port.create({ data: { name: '合成港口', code: 'QA' } });
  await db.hsCode.create({ data: { hsCode: '9999999999', productName: '合成测试商品', taxRate: 0, vatRate: 13, refundRate: 13, effectiveDate: new Date('2026-01-01') } });
  const app = require('../app');
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const call = async (method, url, body, { role = 'ADMIN', expected = 200, headers = {} } = {}) => {
    const response = await fetch(base + url, { method, headers: { authorization: `Bearer ${users[role].token}`, ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }) });
    const result = await response.json();
    assert.equal(response.status, expected, `${method} ${url}: ${result.message || result.error || ''}`);
    return result.data;
  };
  const purchaseResult = await call('POST', '/purchases', { supplierId: supplier.id, taxRate: 13, items: [{ productId: product.id, quantity: 100, unit: '件', unitPrice: 10 }] }, { role: 'PURCHASE', expected: 201 });
  const purchase = purchaseResult.contract || purchaseResult;
  const pi = purchase.items[0];
  await call('PUT', `/purchases/${purchase.id}/status`, { status: 'SIGNED' }, { role: 'PURCHASE' });
  await call('PUT', `/purchases/${purchase.id}/production-details`, { completeProduction: true, items: [{ id: pi.id, specification: '合成重型箱', boxes: 10, grossWeight: 40000, netWeight: 38000, volume: 10, length: 1000, width: 1000, height: 1000 }] }, { role: 'PURCHASE' });
  assert.equal((await db.purchaseContract.findUnique({ where: { id: purchase.id } })).status, 'READY');
  await call('PUT', `/purchases/${purchase.id}/status`, { status: 'SHIPPED' }, { role: 'PURCHASE' });
  // Browser-side SHA-256 keys are covered by frontend tests; verify real HTTP/SQLite
  // accepts the complete ASCII header and preserves Chinese notes/legacy PAYABLE.
  const payment = (amount, label, expected = 201) => {
    const body = { type: 'PAYABLE', purchaseContractId: purchase.id, amount, currency: 'CNY', paymentMethod: 'other', paymentDate: '2026-10-01', note: `${'合成付款备注'.repeat(100)}${label}` };
    const canonical = JSON.stringify(Object.fromEntries(Object.entries(body).sort(([a], [b]) => a.localeCompare(b))));
    const key = `idempotency:sha256:${createHash('sha256').update(canonical).digest('hex')}`;
    assert.equal(key.length, 83);
    return call('POST', '/finance/payments', body, { role: 'PURCHASE', expected, headers: { 'X-Idempotency-Key': key } });
  };
  const deposit = await payment(339, 'synthetic-deposit');
  const replay = await payment(339, 'synthetic-deposit', 200);
  assert.equal(replay.id, deposit.id);
  assert.equal(replay.paymentMethod, 'other');
  assert.equal(replay.note, `${'合成付款备注'.repeat(100)}synthetic-deposit`);
  assert.equal(await db.payment.count({ where: { purchaseContractId: purchase.id } }), 1);
  assert.equal((await call('GET', `/purchases/${purchase.id}`)).paidAmount, 339);
  const receive = (requestId, amount) => call('POST', `/purchases/${purchase.id}/receipts`, { requestId, arrivedAt: '2026-10-01', items: [{ purchaseItemId: pi.id, arrivedQuantity: amount }] }, { role: 'WAREHOUSE' });
  const inspect = (receipt, requestId, acceptedQuantity, reinspectionQuantity = 0) => call('POST', `/purchases/${purchase.id}/receipts/${receipt.receipt.id}/inspection`, { requestId, note: '合成验货依据', items: [{ receiptItemId: receipt.receipt.items[0].id, acceptedQuantity, reinspectionQuantity }] }, { role: 'WAREHOUSE' });
  const arrival = await receive('synthetic-arrival-1', 40);
  await inspect(arrival, 'synthetic-inspection-1', 30, 10);
  const stock = async status => (await db.inventory.aggregate({ where: { status }, _sum: { quantity: true } }))._sum.quantity || 0;
  assert.equal(await stock('INBOUND'), 30);
  const prepareExport = async () => {
    const sale = await call('POST', '/sales', { portId: port.id, exchangeRate: 7.2 }, { role: 'SALES', expected: 201 });
    await call('POST', `/sales/${sale.id}/import-purchase-items`, { items: [{ purchaseItemId: pi.id, boxes: 5 }] }, { role: 'SALES', expected: 201 });
    await call('PUT', `/sales/${sale.id}/status`, { status: 'CONFIRMED' }, { role: 'SALES' });
    assert.equal((await db.salesContract.findUnique({ where: { id: sale.id } })).status, 'PACKING');
    const packet = await call('POST', `/sales/${sale.id}/export-packet/generate`, { spotRate: 7.2, sellerName: '合成卖方', buyerName: '合成买方', packageKind: 'WOODEN CASE', tradeTerm: 'FOB', documentDate: '2026-10-01' }, { role: 'SALES', expected: 201 });
    return { ...sale, packet };
  };
  const a = await prepareExport();
  await call('PUT', `/sales/${a.id}/status`, { status: 'SHIPPED' }, { role: 'SALES', expected: 400 });
  assert.equal((await db.salesContract.findUnique({ where: { id: a.id } })).status, 'PACKING');
  assert.equal(await stock('INBOUND'), 30);
  await inspect(arrival, 'synthetic-inspection-2', 40);
  const second = await receive('synthetic-arrival-2', 60);
  await inspect(second, 'synthetic-inspection-3', 60);
  // Distinct long notes sharing their entire prefix must remain distinct records.
  const finalA = await payment(395.5, 'synthetic-final-a');
  const finalB = await payment(395.5, 'synthetic-final-b');
  assert.notEqual(finalA.id, finalB.id);
  assert.equal(await db.payment.count({ where: { purchaseContractId: purchase.id } }), 3);
  assert.equal((await call('GET', `/purchases/${purchase.id}`)).paidAmount, 1130);
  assert.equal((await db.purchaseContract.findUnique({ where: { id: purchase.id } })).status, 'COMPLETED');
  const b = await prepareExport();
  for (const sale of [a, b]) {
    await call('PUT', `/sales/${sale.id}/status`, { status: 'SHIPPED' }, { role: 'SALES' });
    assert.equal((await db.salesContract.findUnique({ where: { id: sale.id } })).totalAmount, sale.packet.packet.summary.totalUsd);
    await call('PUT', `/sales/${sale.id}/status`, { status: 'SHIPPED' }, { role: 'SALES' });
    await call('POST', '/finance/payments', { type: 'RECEIVABLE_COLLECTION', salesContractId: sale.id, currency: 'USD', amount: sale.packet.packet.summary.totalUsd, paymentDate: '2026-10-01' }, { role: 'FINANCE', expected: 201 });
    await call('PUT', `/sales/${sale.id}/status`, { status: 'ARRIVED' }, { role: 'SALES' });
    assert.equal((await db.salesContract.findUnique({ where: { id: sale.id } })).status, 'COMPLETED');
  }
  assert.equal(await stock('INBOUND'), 0);
  assert.equal(await stock('OUTBOUND'), 100);
  assert.equal(await db.inventory.count({ where: { receiptInspectionId: null } }), 0);
  const ExcelJS = require('exceljs');
  const invoiceNo = '26110000000000000001';
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('合成发票');
  sheet.addRow(['发票号码', '销方名称', '销方识别号', '购方名称', '开票日期', '货物或应税劳务名称', '数量', '单位', '金额', '税率', '税额', '价税合计', '发票票种', '发票状态', '是否正数发票']);
  sheet.addRow([invoiceNo, supplier.name, supplier.taxId, '合成购方', '2026-10-01', product.customsName, 100, '件', 1000, '13%', 130, 1130, '增值税专用发票', '正常', '是']);
  const form = new FormData(); form.append('file', new Blob([await workbook.xlsx.writeBuffer()]), 'synthetic-invoice.xlsx');
  await call('POST', '/bank-flow/invoices/import', form, { role: 'FINANCE' });
  await call('PUT', `/purchases/${purchase.id}/invoice-numbers`, { invoiceNumbers: [invoiceNo] }, { role: 'PURCHASE' });
  const PDFDocument = require('pdfkit');
  const pdf = text => new Promise(resolve => { const chunks = []; const doc = new PDFDocument(); doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.text(text); doc.end(); });
  const declarations = new Map();
  for (const sale of [a, b]) {
    const drafts = await call('POST', '/customs-declarations/auto-drafts', { salesContractId: sale.id }, { role: 'SALES' });
    const declarationId = drafts.items[0].customsDeclarationId;
    declarations.set(sale.id, declarationId);
    const refreshed = await call('POST', '/customs-declarations/auto-drafts', { salesContractId: sale.id, replaceExisting: true }, { role: 'SALES' });
    assert.equal(refreshed.items[0].customsDeclarationId, declarationId);
    assert.equal(await db.customsDeclarationItem.count({ where: { customsDeclarationId: declarationId } }), 1);
    await call('PUT', `/customs-declarations/${declarationId}`, { status: 'RELEASED', exportDate: '2026-10-01' }, { role: 'SALES' });
    await call('POST', '/customs-declarations/auto-drafts', { salesContractId: sale.id, replaceExisting: true }, { role: 'SALES', expected: 409 });
    const f = new FormData(); f.append('file', new Blob([await pdf(`${sale.contractNo} Packing List\nTotal boxes 5 Gross Weight 20000 Net Weight 19000 Volume 5\n${product.customsName} Quantity 50 Boxes 5 HS 9999999999`)], { type: 'application/pdf' }), 'synthetic-packing.pdf');
    const check = await call('POST', `/sales/${sale.id}/packing-list-check`, f, { role: 'SALES', expected: 201 });
    assert.equal(check.status, 'PASSED');
  }
  for (const sale of [a, b]) {
    const declarationId = declarations.get(sale.id);
    const preparation = await call('GET', `/tax-refunds/workbench/${sale.id}/preparation?customsDeclarationId=${declarationId}`, undefined, { role: 'FINANCE' });
    assert.equal(preparation.materialReady, true, preparation.materialBlockers.join('；'));
    const input = { customsDeclarationId: declarationId, sourceVersion: preparation.sourceVersion };
    const confirmed = await call('POST', `/tax-refunds/workbench/${sale.id}/confirm`, input, { role: 'FINANCE' });
    const retry = await call('POST', `/tax-refunds/workbench/${sale.id}/confirm`, input, { role: 'FINANCE' });
    assert.equal(confirmed.file.id, retry.file.id);
    await call('POST', `/tax-refunds/workbench/${sale.id}/confirm`, { ...input, sourceVersion: 'a'.repeat(64) }, { role: 'FINANCE', expected: 409 });
    const file = await require('../services/fileService').findFileById(confirmed.file.id);
    const filePath = path.isAbsolute(file.filePath) ? file.filePath : require('../utils/upload').getFullPath(file.filePath);
    assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.dirname(filePath)).mode & 0o777, 0o700);
    await call('GET', `/tax-refunds/workbench/${sale.id}/preparation`, undefined, { role: 'SALES', expected: 403 });
  }
  const monthly = await fetch(base + '/tax-refunds/workbench/monthly-export?filingMonth=2026-11', { headers: { authorization: `Bearer ${users.FINANCE.token}` } });
  assert.equal(monthly.status, 200);
  const exported = new ExcelJS.Workbook(); await exported.xlsx.load(Buffer.from(await monthly.arrayBuffer()));
  assert.equal(exported.getWorksheet('月度准备清单').rowCount, 3);
  assert.equal(exported.getWorksheet('月度准备清单').getCell('J2').value, '已确认');
  assert.equal(exported.getWorksheet('月度准备清单').getCell('J3').value, '已确认');
  const before = await call('GET', `/tax-refunds/workbench/${a.id}/preparation`, undefined, { role: 'FINANCE' });
  await call('PUT', `/purchases/${purchase.id}/production-details`, { items: [{ id: pi.id, specification: '合成重型箱', boxes: 10, grossWeight: 40000, netWeight: 38000, volume: 10, length: 1000, width: 1000, height: 1000 }] }, { role: 'PURCHASE' });
  const after = await call('GET', `/tax-refunds/workbench/${a.id}/preparation`, undefined, { role: 'FINANCE' });
  assert.equal(after.sourceVersion, before.sourceVersion, '相同业务资料重复保存不能无故要求重新确认');
  assert.equal(await db.taxRefund.count(), 0, '确认准备不能冒充正式退税申报');
  const outbound = await db.inventory.findFirst({ where: { status: 'OUTBOUND' } });
  await call('PUT', `/inventory/${outbound.id}/status`, { status: 'OUTBOUND' }, { role: 'WAREHOUSE' });
  assert.equal((await db.inventory.findUnique({ where: { id: outbound.id } })).outboundAt.getTime(), outbound.outboundAt.getTime());
  const legacy = await db.inventory.create({ data: { purchaseItemId: pi.id, productId: product.id, quantity: 1, unit: '件', status: 'SHIPPING' } });
  await call('PUT', `/inventory/${legacy.id}/status`, { status: 'INBOUND' }, { role: 'WAREHOUSE', expected: 400 });
  const bulk = await call('PUT', '/inventory/batch-status', { ids: [legacy.id], status: 'INBOUND' }, { role: 'WAREHOUSE' });
  assert.equal(bulk.success, 0);
  assert.equal(bulk.failed, 1);
  assert.equal((await db.inventory.findUnique({ where: { id: legacy.id } })).status, 'SHIPPING');
  await db.inventory.delete({ where: { id: legacy.id } });
  for (const [role, method, url, expected] of [
    ['BOSS','GET','/finance/stats',200], ['BOSS','POST','/finance/payments',403],
    ['BOSS','POST','/ai/chat',403], ['FINANCE','POST',`/purchases/${purchase.id}/receipts`,403],
    ['SALES','POST',`/purchases/${purchase.id}/receipts`,403], ['WAREHOUSE','GET',`/purchases/${purchase.id}/receipts`,200],
  ]) await call(method, url, method === 'POST' ? {} : undefined, { role, expected });
});
