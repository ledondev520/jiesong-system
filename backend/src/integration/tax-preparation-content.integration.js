/**
 * Input: genuine preparation HTTP routes and committed-migration private SQLite
 * Output: four bounded preparation/workbook content and read-only replay cases
 * Pos: internal preparation only; no filing, settlement, signatures or real data
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { execFileSync } = require('node:child_process');

test('HTTP/SQLite: internal tax preparation retains current document and invoice content', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-tax-preparation-content-'));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = randomBytes(32).toString('hex');
  process.env.TZ = 'UTC';
  const originalUmask = process.umask(0o022);
  let db, server;
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
    process.umask(originalUmask);
  });
  // Replay committed migrations without db push or shared client generation.
  const migrations = path.resolve(__dirname, '../../prisma/migrations');
  const ddl = fs.readdirSync(migrations).sort()
    .filter(name => fs.statSync(path.join(migrations, name)).isDirectory())
    .map(name => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8')).join('\n');
  execFileSync('python3', ['-c',
    'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()',
    database], { input: ddl, timeout: 30000 });
  fs.chmodSync(database, 0o600);
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(database).mode & 0o777, 0o600);
  db = require('../utils/prisma');
  const tokens = {};
  for (const role of ['SALES', 'FINANCE']) {
    const user = await db.user.create({ data: {
      username: `synthetic-preparation-${role}`, name: `Synthetic ${role}`,
      password: randomBytes(32).toString('hex'), role,
    } });
    tokens[role] = require('jsonwebtoken').sign({ userId: user.id }, process.env.JWT_SECRET);
  }
  const app = require('../app'); // Real authentication, routes and global limiter.
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const call = async (method, route, body, role = 'FINANCE') => {
    const response = await fetch(base + route, {
      method, headers: { authorization: `Bearer ${tokens[role]}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };
  const good = async (...args) => {
    const result = await call(...args);
    assert.ok(result.status === 200 || result.status === 201, `${args[0]} ${args[1]}: ${result.body.message}`);
    return result.body.data;
  };
  const workbook = async route => {
    const response = await fetch(base + route, { headers: { authorization: `Bearer ${tokens.FINANCE}` } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /spreadsheetml/);
    const result = new (require('exceljs').Workbook)();
    await result.xlsx.load(Buffer.from(await response.arrayBuffer()));
    return result;
  };
  // A separate read-only connection compares all business/source rows and timestamps.
  const snapshot = () => JSON.parse(execFileSync('python3', ['-c', `import sqlite3,sys,json
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
c.row_factory=sqlite3.Row
tables=['suppliers','products','purchase_contracts','purchase_items','sales_contracts','packing_items','customs_declarations','customs_declaration_items','invoice_records','contract_files','sales_contract_files','packing_list_checks','tax_refunds','payments','inventories']
print(json.dumps({table:[dict(row) for row in c.execute('SELECT * FROM '+table+' ORDER BY id')] for table in tables}))
c.close()`, database], { encoding: 'utf8', timeout: 10000 }));
  const supplier = await db.supplier.create({ data: { name: 'Synthetic preparation supplier', taxId: 'SYNTHETIC-PREPARATION-TAX' } });
  const products = [];
  for (const [index, name] of ['SYNTHETIC PLATE', 'SYNTHETIC CUP'].entries()) {
    const hsCode = `999999999${index}`;
    products.push(await db.product.create({ data: { customsName: name, unit: '件', hsCode, declaration: 'Synthetic ordinary product parameters' } }));
    await db.hsCode.create({ data: { hsCode, productName: name, taxRate: 0, vatRate: 13, refundRate: 13, effectiveDate: new Date('2026-01-01') } });
  }
  const invoiceNo = '26110000000000000081';
  const purchase = await db.purchaseContract.create({ data: {
    contractNo: 'CG-SYNTHETIC-PREPARATION', supplierId: supplier.id,
    totalAmount: 904, taxRate: 13, status: 'COMPLETED', invoiceNo,
    items: { create: products.map((product, index) => ({
      productId: product.id, quantity: index + 2, unit: '件', unitPrice: (index + 1) * 100,
      totalPrice: index === 0 ? 226 : 678,
    })) },
  }, include: { items: { orderBy: { createdAt: 'asc' } } } });
  const sale = await db.salesContract.create({ data: {
    contractNo: 'EXP-SYNTHETIC-PREPARATION', exchangeRate: 7.2, status: 'SHIPPED',
    shippedAt: new Date('2026-10-01T12:00:00Z'), hasTaxRefund: true,
    totalBoxes: 5, grossWeight: 50, netWeight: 45, volume: 0.5,
    packingItems: { create: products.map((product, index) => ({
      productId: product.id, purchaseItemId: purchase.items.find(item => item.productId === product.id).id,
      quantity: index + 2, unit: '件', boxes: index + 2, grossWeight: (index + 2) * 10,
      netWeight: (index + 2) * 9, volume: (index + 2) / 10, specification: 'Synthetic ordinary size',
      purchaseContractNo: purchase.contractNo, manufacturer: supplier.name, invoiceNo,
      purchaseCost: index === 0 ? 226 : 678, unitPrice: 1, totalPrice: index + 2,
    })) },
  } });
  // The existing generator supplies real current packet evidence and existing pricing.
  const packet = await good('POST', `/sales/${sale.id}/export-packet/generate`, {
    spotRate: 7.2, sellerName: 'Synthetic seller', buyerName: 'Synthetic buyer',
    packageKind: 'CARTON', tradeTerm: 'FOB', documentDate: '2026-10-01',
  }, 'SALES');
  const rows = await db.packingItem.findMany({ where: { salesContractId: sale.id }, orderBy: { createdAt: 'asc' } });
  const declaration = await db.customsDeclaration.create({ data: {
    declarationNo: 'SYNTHETIC-PREPARATION-DECLARATION', salesContractId: sale.id,
    status: 'RELEASED', currency: 'USD', exportDate: new Date('2026-10-01T12:00:00Z'),
    totalQuantity: 5, totalAmount: packet.packet.summary.totalUsd,
    items: { create: rows.map((row, index) => ({
      productId: row.productId, packingItemId: row.id, itemNo: index + 1,
      customsName: products.find(product => product.id === row.productId).customsName,
      quantity: row.quantity, unit: row.unit, unitPrice: row.unitPrice, totalPrice: row.totalPrice,
    })) },
  } });
  const batch = await db.financeDataBatch.create({ data: { type: 'INVOICE', fileName: 'synthetic-preparation-fixture-only', recordCount: 1 } });
  const invoice = await db.invoiceRecord.create({ data: {
    batchId: batch.id, invNo: invoiceNo, seller: supplier.name, sellerTaxId: supplier.taxId,
    buyer: 'Synthetic buyer', invDate: '2026-10-01', itemName: products.map(product => product.customsName).join('；'),
    qty: 5, unit: '件', amount: 800, tax: 104, total: 904, taxRate: '13%',
    invoiceType: '增值税专用发票', status: '正常', isPositive: '是',
  } });
  // Only synthetic fixture metadata is needed for the existing carrier comparison.
  const carrier = await db.salesContractFile.create({ data: {
    salesContractId: sale.id, fileName: 'synthetic-carrier-packing.pdf', filePath: 'synthetic-fixture-only.pdf',
    fileType: 'pdf', fileSize: 0, category: 'CARRIER_DOCUMENT',
  } });
  await db.packingListCheck.create({ data: {
    salesContractId: sale.id, salesContractFileId: carrier.id, automaticStatus: 'PASSED', status: 'PASSED', summaryJson: '{}',
    resultJson: JSON.stringify({ items: rows.map(row => ({
      packingItemId: row.id, quantity: { expected: row.quantity }, boxes: { expected: row.boxes },
      productName: products.find(product => product.id === row.productId).customsName,
    })), fields: [] }),
  } });
  const route = `/tax-refunds/workbench/${sale.id}`;
  const query = `?customsDeclarationId=${declaration.id}`;
  const preview = () => good('GET', `${route}/preparation${query}`);
  const exported = () => workbook(`${route}/preparation-export${query}`);
  const values = book => book.worksheets.map(sheet => ({ name: sheet.name, rows: sheet.getSheetValues() }));

  await t.test('eligible preview and exported contents match current shipment and source evidence', async () => {
    const before = snapshot();
    const preparation = await preview();
    assert.equal(preparation.materialReady, true, preparation.materialBlockers.join('；'));
    assert.equal(preparation.confirmationStatus, 'PENDING');
    assert.equal(preparation.declarationNo, declaration.declarationNo);
    assert.equal(preparation.documentFiles[0].id, packet.file.id);
    const book = await exported();
    assert.deepEqual(book.worksheets.map(sheet => sheet.name), ['准备清单', '关联发票', '规则口径', '出货关联', '发票核验']);
    assert.equal(book.getWorksheet('出货关联').getCell('B1').value, sale.contractNo);
    assert.equal(book.getWorksheet('出货关联').getCell('B2').value, declaration.declarationNo);
    assert.equal(book.getWorksheet('出货关联').getCell('B3').value, preparation.sourceVersion);
    assert.equal(book.getWorksheet('出货关联').getCell('B4').value, 'PENDING');
    assert.equal(book.getWorksheet('出货关联').getCell('B6').value, '通过');
    for (const [index, item] of preparation.checklist.entries()) {
      const expected = [item.category, item.label, item.requirement, item.status, item.evidence || null, item.message];
      for (const [column, value] of expected.entries()) {
        assert.equal(book.getWorksheet('准备清单').getCell(index + 2, column + 1).value, value);
      }
    }
    assert.match(String(book.getWorksheet('出货关联').getCell('B7').value), /内部准备/);
    assert.deepEqual(snapshot(), before);
  });

  await t.test('missing ordinary supplier/date fields are explicit and rejected confirmation does not mutate records', async () => {
    await db.supplier.update({ where: { id: supplier.id }, data: { taxId: null } });
    await db.invoiceRecord.update({ where: { id: invoice.id }, data: { invDate: '' } });
    try {
      const before = snapshot();
      const preparation = await preview();
      assert.equal(preparation.materialReady, false);
      assert.match(preparation.materialBlockers.join('；'), /纳税人识别号/);
      assert.match(preparation.materialBlockers.join('；'), /开票日期缺失或无效/);
      const book = await exported();
      assert.match(String(book.getWorksheet('出货关联').getCell('B6').value), /纳税人识别号/);
      assert.match(String(book.getWorksheet('发票核验').getCell('I2').value), /开票日期缺失或无效/);
      const failed = await call('POST', `${route}/confirm`, { customsDeclarationId: declaration.id, sourceVersion: preparation.sourceVersion });
      assert.equal(failed.status, 409);
      assert.match(failed.body.message, /资料仍有.*差异/);
      assert.deepEqual(snapshot(), before);
    } finally {
      await db.supplier.update({ where: { id: supplier.id }, data: { taxId: supplier.taxId } });
      await db.invoiceRecord.update({ where: { id: invoice.id }, data: { invDate: invoice.invDate } });
    }
  });

  await t.test('repeated previews and exports have identical content and create no duplicate business records', async () => {
    const before = snapshot();
    const first = await preview();
    const second = await preview();
    assert.deepEqual(second, first);
    const firstBook = await exported();
    const secondBook = await exported();
    // XLSX creation metadata can vary; all sheet content must remain identical.
    assert.deepEqual(values(secondBook), values(firstBook));
    assert.deepEqual(snapshot(), before);
    assert.equal(await db.taxRefund.count(), 0);
    assert.equal(await db.salesContractFile.count({ where: { salesContractId: sale.id } }), 2);
  });

  await t.test('multi-line quantities and CNY purchase amounts remain separate from USD export prices', async () => {
    const before = snapshot();
    const preparation = await preview();
    const verified = preparation.invoiceVerification.results[0];
    assert.equal(preparation.invoiceVerification.summary.shipmentRows, 2);
    assert.deepEqual(verified.sourceRows, [1, 2]);
    assert.deepEqual(verified.expectedItems.sort(), products.map(product => product.customsName).sort());
    assert.equal(verified.status, 'PASS');
    assert.equal(verified.allocatedQuantity, 5);
    assert.equal(verified.allocatedGrossAmount, 904);
    assert.equal(verified.actualAmountExTax, 800);
    assert.equal(verified.actualTax, 104);
    assert.equal(verified.actualTotal, 904);
    assert.equal(preparation.invoiceLinks.length, 1);
    assert.equal(preparation.invoiceLinks[0].grossAmount, 904);
    const book = await exported();
    const check = book.getWorksheet('发票核验');
    assert.deepEqual(check.getRow(2).values.slice(1), [invoiceNo, 'PASS', supplier.name, supplier.taxId, '2026-10-01', 800, 104, 904, '', 5, 904]);
    assert.equal(book.getWorksheet('关联发票').getCell('F2').value, 800);
    assert.equal(book.getWorksheet('关联发票').getCell('G2').value, 104);
    assert.equal(book.getWorksheet('关联发票').getCell('H2').value, 904);
    assert.equal(before.customs_declarations[0].currency, 'USD');
    assert.equal(before.customs_declarations[0].totalAmount, packet.packet.summary.totalUsd);
    assert.notEqual(packet.packet.summary.totalUsd, 904);
    assert.deepEqual(snapshot(), before);
  });
});
