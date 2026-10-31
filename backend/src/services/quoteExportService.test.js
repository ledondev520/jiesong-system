const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { buildQuoteDocument, buildQuoteWorkbook, buildQuoteHtml } = require('./quoteExportService');

const item = (n, store, qty, price, extra = {}) => ({
  sortOrder: n, quantity: qty, unitPrice: price, unit: 'PCS', specification: `spec-${n}`, note: null,
  product: { customsName: `Product ${n}`, hsCode: '6907210000' },
  store: { name: `Store ${store}`, code: store, port: { name: 'Los Angeles' } },
  // Cost fields that must never reach the document:
  costCny: 7777.77, costSupplierId: 'SECRET-SUPPLIER', costContractNo: 'SECRET-PC-0001', markup: 0.3, formulaPrice: 4242, isManualPrice: true,
  ...extra,
});
const quote = (status = 'DRAFT') => ({
  quoteNo: 'QT2610-007', status, currency: 'USD', incoterm: 'FOB', portOfLoading: 'Shanghai', paymentTerms: 'T/T 30% deposit',
  validUntil: new Date('2026-11-30T00:00:00Z'), sentAt: null, createdAt: new Date('2026-10-31T01:00:00Z'),
  customer: { name: 'Seapot', legalName: 'Seapot Holdings LLC' },
  items: [item(1, 'SAC', 10, 1995), item(2, 'LAX', 3, 1690.5), item(3, 'SAC', 2, 100)],
});
const cells = (sheet) => { const out = []; sheet.eachRow((row) => row.eachCell((c) => out.push(c.value))); return out; };

test('workbook structure: sheet, title, header block, columns, per-store subtotals and total', async () => {
  const doc = buildQuoteDocument(quote());
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildQuoteWorkbook(doc));
  assert.deepEqual(workbook.worksheets.map((s) => s.name), ['外销合同']);
  const s = workbook.getWorksheet('外销合同');
  assert.equal(s.getCell('A1').value, 'QUOTATION / 报价单');
  assert.equal(s.getCell('A2').value, 'QT2610-007');
  const header = (row) => [1, 2, 6, 7].map((c) => s.getCell(row, c).value);
  assert.deepEqual(header(4), ['Seller', '上海捷淞国际物流有限公司', 'Quote No.', 'QT2610-007']);
  assert.deepEqual(header(5), ['Buyer', 'Seapot Holdings LLC', 'Date', '2026-10-31']);
  assert.deepEqual(header(6), ['Destination', 'Los Angeles', 'Trade Term', 'FOB Shanghai']);
  assert.deepEqual(header(7), ['Currency', 'USD', 'Valid Until', '2026-11-30']);
  assert.deepEqual([s.getCell('A8').value, s.getCell('B8').value], ['Payment Terms', 'T/T 30% deposit']);
  assert.deepEqual(s.getRow(9).values.slice(1), ['No.', 'Description', 'Specification', 'HS Code', 'Quantity', 'Unit', 'Unit Price (USD)', 'Amount (USD)', 'Ship-to Store', 'Remarks']);
  // sorted by store code: LAX first, then SAC (two lines), each followed by its subtotal
  const rows = [10, 11, 12, 13, 14, 15].map((r) => s.getRow(r).values.slice(1));
  assert.deepEqual(rows[0].slice(0, 9), [1, 'Product 2', 'spec-2', '6907210000', 3, 'PCS', 1690.5, 5071.5, 'LAX']);
  assert.equal(rows[1][0], 'SUBTOTAL LAX');
  assert.deepEqual([rows[1][4], rows[1][7]], [3, 5071.5]);
  assert.deepEqual([rows[2][1], rows[2][8]], ['Product 1', 'SAC']);
  assert.equal(rows[3][1], 'Product 3');
  assert.equal(rows[4][0], 'SUBTOTAL SAC');
  assert.deepEqual([rows[4][4], rows[4][7]], [12, 20150]);
  assert.equal(rows[5][0], 'TOTAL / 合计');
  assert.deepEqual([rows[5][4], rows[5][7]], [15, 25221.5]);
  assert.equal(s.getColumn(7).numFmt, '#,##0.00');
});

test('accepted quotes print as a proforma invoice', () => {
  assert.equal(buildQuoteDocument(quote('ACCEPTED')).title, 'PROFORMA INVOICE / 形式发票');
  assert.equal(buildQuoteDocument(quote('ACCEPTED')).header[0][2], 'PI No.');
  assert.equal(buildQuoteDocument(quote('SENT')).title, 'QUOTATION / 报价单');
});

test('costs, markups and suppliers appear in no workbook cell and no HTML', async () => {
  const doc = buildQuoteDocument(quote('ACCEPTED'));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildQuoteWorkbook(doc));
  const text = JSON.stringify(cells(workbook.getWorksheet('外销合同')));
  const html = buildQuoteHtml(doc);
  for (const forbidden of ['SECRET-SUPPLIER', 'SECRET-PC-0001', '7777.77', '4242']) {
    assert.ok(!text.includes(forbidden), `xlsx leaks ${forbidden}`);
    assert.ok(!html.includes(forbidden), `html leaks ${forbidden}`);
  }
});

test('HTML view escapes text and shows the same totals', () => {
  const q = quote();
  q.items[0].product.customsName = '<script>alert(1)</script>';
  const html = buildQuoteHtml(buildQuoteDocument(q));
  assert.ok(!html.includes('<script>alert'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('25,221.50'));
  assert.ok(html.includes('SUBTOTAL SAC'));
});
