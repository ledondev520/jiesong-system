/** Real HTTP/SQLite role matrix for /mcp writes and purchase/supplier DELETE; synthetic users and records only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('HTTP/SQLite: MCP write roles, actor attribution, purchase/supplier delete guards', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-mcp-rbac-'));
  fs.chmodSync(directory, 0o700);
  const dbFile = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-mcp-rbac-secret-never-production';
  let db, server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const ddl = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.resolve(__dirname, '../../prisma/schema.prisma'), '--script'], { encoding: 'utf8', timeout: 30000 });
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', dbFile], { input: ddl });
  fs.chmodSync(dbFile, 0o600);
  db = require('../utils/prisma');
  // Order creation needs exactly one active customer (DATA-MODEL §2.4).
  await db.customer.create({ data: { name: '合成客户' } });
  const jwt = require('jsonwebtoken');
  const config = require('../config');
  const users = {};
  for (const role of ['ADMIN', 'SALES', 'PURCHASE', 'FINANCE', 'WAREHOUSE', 'BOSS']) {
    const user = await db.user.create({ data: { username: `synthetic-mcp-${role}`, password: 'test-only-unused-hash', name: `Synthetic ${role}`, role, isActive: true } });
    users[role] = { id: user.id, token: jwt.sign({ userId: user.id, role: 'ADMIN' }, config.jwt.secret) };
  }
  const product = await db.product.create({ data: { customsName: 'SYNTHETIC MCP WIDGET', unit: '件' } });
  const app = require('../app');
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const send = async (method, url, role, body) => {
    const response = await fetch(origin + (url === '/mcp' ? url : '/api/v1' + url), { method, headers: { authorization: `Bearer ${users[role].token}`, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, json: await response.json().catch(() => null) };
  };
  const mcp = (role, name, args) => send('POST', '/mcp', role, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  const ALL = ['ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE', 'BOSS'];

  await t.test('MCP write tools allow exactly the roles the REST create routes allow, and log the actor', async () => {
    for (const role of ALL) {
      const rest = await send('POST', '/suppliers', role, { name: `rest-${role}` });
      const viaMcp = await mcp(role, 'create_supplier', { name: `mcp-${role}` });
      assert.equal(viaMcp.status === 403, rest.status === 403, `${role}: MCP ${viaMcp.status} vs REST ${rest.status}`);
      if (viaMcp.status === 200) {
        assert.ok(viaMcp.json.result, `${role} MCP create_supplier result`);
        const row = await db.operationLog.findFirst({ where: { entity: 'Supplier', action: 'CREATE', userId: users[role].id } });
        assert.ok(row, `${role}: MCP write must be attributed in operation_logs`);
      }
    }
    assert.equal((await mcp('BOSS', 'create_supplier', { name: 'mcp-boss-denied' })).status, 403);
    assert.equal(await db.supplier.count({ where: { name: 'mcp-boss-denied' } }), 0);
    const reads = await Promise.all(ALL.map(role => mcp(role, 'search_entities', { query: 'mcp' })));
    assert.ok(reads.filter(r => r.status === 200).length >= 5);
  });

  await t.test('purchase delete: ADMIN/PURCHASE only, refused with 409 once payments, receipts, or invoice records exist', async () => {
    const supplier = await db.supplier.create({ data: { name: 'Synthetic delete supplier' } });
    const make = async data => db.purchaseContract.create({ data: { contractNo: `MCP-${Math.random().toString(36).slice(2, 9)}`, supplierId: supplier.id, ...data } });
    for (const role of ['SALES', 'FINANCE', 'WAREHOUSE', 'BOSS']) {
      const c = await make({});
      assert.equal((await send('DELETE', `/purchases/${c.id}`, role)).status, 403, role);
      assert.ok(await db.purchaseContract.findUnique({ where: { id: c.id } }));
    }
    const paid = await make({});
    await db.payment.create({ data: { type: 'EXPENSE', amount: 10, paymentDate: new Date(), purchaseContractId: paid.id } });
    const invoiced = await make({ invoiceNo: 'SYNTH-INV-1' });
    const matched = await make({});
    const batch = await db.financeDataBatch.create({ data: { type: 'INVOICE', fileName: 'synthetic.csv', recordCount: 1 } });
    await db.invoiceRecord.create({ data: { batchId: batch.id, seller: 's', invDate: '2026-01-01', amount: 1, tax: 0, total: 1, status: '正常', isPositive: '是', matchedContractId: matched.id, matchedContractType: 'PURCHASE' } });
    const received = await make({});
    await db.purchaseReceipt.create({ data: { purchaseContractId: received.id, requestId: 'synthetic-r', requestHash: 'synthetic-h', arrivedAt: new Date(), createdById: users.PURCHASE.id } });
    const banked = await make({});
    const bankBatch = await db.financeDataBatch.create({ data: { type: 'BANK_FLOW', fileName: 'synthetic-bank.csv', recordCount: 1 } });
    await db.bankTransaction.create({ data: { batchId: bankBatch.id, txnTime: '2026-01-01 10:00:00', txnDate: '2026-01-01', amount: -1, direction: 'OUT', matchedContractId: banked.id, matchedContractType: 'PURCHASE' } });
    const packed = await make({});
    const packedItem = await db.purchaseItem.create({ data: { purchaseContractId: packed.id, productId: product.id, quantity: 1, unitPrice: 1, totalPrice: 1 } });
    const sale = await db.salesContract.create({ data: { contractNo: 'MCP-SALE-1', exchangeRate: 7 } });
    const packing = await db.packingItem.create({ data: { salesContractId: sale.id, productId: product.id, quantity: 1, purchaseItemId: packedItem.id } });
    for (const c of [banked, packed]) assert.equal((await send('DELETE', `/purchases/${c.id}`, 'ADMIN')).status, 409);
    assert.equal((await db.packingItem.findUnique({ where: { id: packing.id } })).purchaseItemId, packedItem.id);
    assert.equal(await db.bankTransaction.count({ where: { matchedContractId: banked.id } }), 1);
    for (const c of [paid, invoiced, matched]) {
      assert.equal((await send('DELETE', `/purchases/${c.id}`, 'PURCHASE')).status, 409);
      assert.ok(await db.purchaseContract.findUnique({ where: { id: c.id } }));
    }
    assert.equal((await send('DELETE', `/purchases/${received.id}`, 'ADMIN')).status, 409);
    assert.equal(await db.payment.count({ where: { purchaseContractId: paid.id } }), 1);
    const clean = await make({});
    assert.equal((await send('DELETE', `/purchases/${clean.id}`, 'PURCHASE')).status, 200);
    assert.equal((await send('DELETE', `/purchases/${clean.id}`, 'ADMIN')).status, 404);
  });

  await t.test('supplier archive: ADMIN/PURCHASE only, allowed any time regardless of contracts', async () => {
    const used = await db.supplier.create({ data: { name: 'Synthetic used supplier' } });
    await db.purchaseContract.create({ data: { contractNo: 'MCP-USED-1', supplierId: used.id } });
    const unused = await db.supplier.create({ data: { name: 'Synthetic unused supplier' } });
    for (const role of ['SALES', 'FINANCE', 'WAREHOUSE', 'BOSS']) assert.equal((await send('DELETE', `/suppliers/${unused.id}`, role)).status, 403, role);
    assert.equal((await send('DELETE', `/suppliers/${used.id}`, 'PURCHASE')).status, 200);
    assert.equal((await db.supplier.findUnique({ where: { id: used.id } })).isActive, false);
    assert.ok(await db.purchaseContract.findUnique({ where: { contractNo: 'MCP-USED-1' } }), 'archive keeps history');
    assert.equal((await send('DELETE', `/suppliers/${unused.id}`, 'PURCHASE')).status, 200);
    assert.equal((await db.supplier.findUnique({ where: { id: unused.id } })).isActive, false);
    assert.equal((await send('DELETE', '/suppliers/does-not-exist', 'ADMIN')).status, 404);

    // isActive changes (archive/restore) cannot bypass the DELETE role limit via PUT or MCP; other fields stay open.
    const target = await db.supplier.create({ data: { name: 'Synthetic active-toggle supplier' } });
    for (const role of ['SALES', 'FINANCE', 'WAREHOUSE']) {
      assert.equal((await send('PUT', `/suppliers/${target.id}`, role, { isActive: false })).status, 403, role);
      assert.equal((await send('PUT', `/suppliers/${target.id}`, role, { note: 'x', shortName: `s-${role}` })).status, 200, role);
    }
    assert.equal((await db.supplier.findUnique({ where: { id: target.id } })).isActive, true);
    const viaMcp = await mcp('SALES', 'update_supplier', { id: target.id, isActive: false });
    assert.notEqual(viaMcp.status, 200);
    assert.equal((await db.supplier.findUnique({ where: { id: target.id } })).isActive, true);
    const okMcp = await mcp('SALES', 'update_supplier', { id: target.id, shortName: 'via-mcp' });
    assert.equal(okMcp.status, 200);
    const upd = await db.operationLog.findFirst({ where: { entity: 'Supplier', action: 'UPDATE', userId: users.SALES.id, entityId: target.id }, orderBy: { createdAt: 'desc' } });
    assert.ok(upd && upd.oldValue, 'MCP update records oldValue');
    assert.equal((await mcp('PURCHASE', 'update_supplier', { id: target.id, isActive: false })).status, 200);
    assert.equal((await db.supplier.findUnique({ where: { id: target.id } })).isActive, false);
    assert.equal((await send('PUT', `/suppliers/${target.id}`, 'PURCHASE', { isActive: true })).status, 403);
    assert.equal((await send('PUT', `/suppliers/${target.id}`, 'ADMIN', { isActive: true })).status, 200);

  });

  await t.test('supplier hard delete: ADMIN only, preview + matching token, one transaction, blocked by money records', async () => {
    const supplier = await db.supplier.create({ data: { name: 'Synthetic hard-delete supplier', aliases: { create: [{ alias: 'synthetic-hd-alias' }] } } });
    await db.productSupplier.create({ data: { productId: product.id, supplierId: supplier.id } });
    const contract = await db.purchaseContract.create({ data: { contractNo: 'HD-1', supplierId: supplier.id, items: { create: [{ productId: product.id, quantity: 2, unitPrice: 1, totalPrice: 2 }] } }, include: { items: true } });
    const receipt = await db.purchaseReceipt.create({ data: { purchaseContractId: contract.id, requestId: 'hd-r', requestHash: 'hd-h', arrivedAt: new Date(), createdById: users.PURCHASE.id } });
    const receiptItem = await db.purchaseReceiptItem.create({ data: { receiptId: receipt.id, purchaseItemId: contract.items[0].id, arrivedQuantity: 2, acceptedQuantity: 2 } });
    const inspection = await db.purchaseReceiptInspection.create({ data: { receiptId: receipt.id, receiptItemId: receiptItem.id, requestId: 'hd-i', requestHash: 'hd-ih', acceptedQuantity: 2, acceptedIncrement: 2, reinspectionQuantity: 0, pendingQuantity: 0, note: 'synthetic', inspectedById: users.PURCHASE.id } });
    await db.inventory.create({ data: { productId: product.id, purchaseItemId: contract.items[0].id, receiptInspectionId: inspection.id, quantity: 2 } });
    const sale = await db.salesContract.create({ data: { contractNo: 'EXP-HD-1', exchangeRate: 7 } });
    await db.packingItem.create({ data: { salesContractId: sale.id, purchaseItemId: contract.items[0].id, productId: product.id, quantity: 1, boxes: 5, grossWeight: 50 } });
    await db.packingItem.create({ data: { salesContractId: sale.id, productId: product.id, quantity: 1, boxes: 2, grossWeight: 20 } }); // unrelated row survives
    await db.salesContract.update({ where: { id: sale.id }, data: { totalBoxes: 7, grossWeight: 70 } });
    const other = await db.supplier.create({ data: { name: 'Synthetic bystander supplier' } });
    const otherContract = await db.purchaseContract.create({ data: { contractNo: 'HD-OTHER', supplierId: other.id } });

    for (const role of ['PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE', 'BOSS']) {
      assert.equal((await send('GET', `/suppliers/${supplier.id}/hard-delete-preview`, role)).status, 403, `preview ${role}`);
      assert.equal((await send('POST', `/suppliers/${supplier.id}/hard-delete`, role, { confirmToken: 'x' })).status, 403, `delete ${role}`);
    }
    assert.equal((await send('GET', '/suppliers/does-not-exist/hard-delete-preview', 'ADMIN')).status, 404);
    assert.equal((await send('POST', '/suppliers/does-not-exist/hard-delete', 'ADMIN', { confirmToken: 'x' })).status, 404);

    const preview = (await send('GET', `/suppliers/${supplier.id}/hard-delete-preview`, 'ADMIN')).json.data;
    assert.equal(preview.canDelete, true);
    assert.deepEqual(preview.blockers, []);
    assert.deepEqual(preview.counts, { aliases: 1, productLinks: 1, contractTemplates: 0, contracts: 1, items: 1, inventories: 1, packingItems: 1, files: 0, receipts: 1, receiptItems: 1, inspections: 1 });

    // Missing, wrong, or another supplier's token deletes nothing.
    const otherToken = (await send('GET', `/suppliers/${other.id}/hard-delete-preview`, 'ADMIN')).json.data.confirmToken;
    for (const confirmToken of [undefined, 'wrong', otherToken]) {
      assert.equal((await send('POST', `/suppliers/${supplier.id}/hard-delete`, 'ADMIN', { confirmToken })).status, 409);
    }
    assert.ok(await db.supplier.findUnique({ where: { id: supplier.id } }));

    // A change after the preview invalidates its token (also covers a payment added meanwhile).
    await db.supplierAlias.create({ data: { supplierId: supplier.id, alias: 'synthetic-hd-alias-2' } });
    assert.equal((await send('POST', `/suppliers/${supplier.id}/hard-delete`, 'ADMIN', { confirmToken: preview.confirmToken })).status, 409);
    assert.equal(await db.supplierAlias.count({ where: { supplierId: supplier.id } }), 2);

    // Money: a payment, a matched bank row, or a matched invoice blocks and the preview says why.
    const payment = await db.payment.create({ data: { type: 'EXPENSE', amount: 5, paymentDate: new Date(), purchaseContractId: contract.id } });
    const blocked = (await send('GET', `/suppliers/${supplier.id}/hard-delete-preview`, 'ADMIN')).json.data;
    assert.equal(blocked.canDelete, false);
    assert.equal(blocked.confirmToken, null);
    assert.match(blocked.blockers.join(), /付款/);
    assert.equal((await send('POST', `/suppliers/${supplier.id}/hard-delete`, 'ADMIN', { confirmToken: preview.confirmToken })).status, 409);
    await db.payment.delete({ where: { id: payment.id } });
    const batch = await db.financeDataBatch.create({ data: { type: 'BANK_FLOW', fileName: 'synthetic.csv', recordCount: 1 } });
    const bank = await db.bankTransaction.create({ data: { batchId: batch.id, txnTime: '2026-01-01 00:00:00', txnDate: '2026-01-01', amount: -5, direction: 'OUT', matchedContractId: contract.id, matchedContractType: 'PURCHASE' } });
    assert.match((await send('GET', `/suppliers/${supplier.id}/hard-delete-preview`, 'ADMIN')).json.data.blockers.join(), /银行流水/);
    await db.bankTransaction.delete({ where: { id: bank.id } });

    const fresh = (await send('GET', `/suppliers/${supplier.id}/hard-delete-preview`, 'ADMIN')).json.data;
    assert.equal(fresh.canDelete, true);
    assert.equal(fresh.counts.aliases, 2);
    const done = await send('POST', `/suppliers/${supplier.id}/hard-delete`, 'ADMIN', { confirmToken: fresh.confirmToken });
    assert.equal(done.status, 200);
    assert.deepEqual(done.json.data.counts, fresh.counts);
    const where = { purchaseContractId: contract.id };
    assert.equal(await db.supplier.count({ where: { id: supplier.id } }), 0);
    assert.equal(await db.supplierAlias.count({ where: { supplierId: supplier.id } }), 0);
    assert.equal(await db.productSupplier.count({ where: { supplierId: supplier.id } }), 0);
    assert.equal(await db.purchaseContract.count({ where: { supplierId: supplier.id } }), 0);
    assert.equal(await db.purchaseItem.count({ where }), 0);
    assert.equal(await db.purchaseReceipt.count({ where }), 0);
    assert.equal(await db.purchaseReceiptInspection.count({ where: { receiptId: receipt.id } }), 0);
    assert.equal(await db.inventory.count({ where: { receiptInspectionId: inspection.id } }), 0);
    assert.equal(await db.packingItem.count({ where: { salesContractId: sale.id } }), 1);
    const keptSale = await db.salesContract.findUnique({ where: { id: sale.id } });
    assert.ok(keptSale, 'sales contract itself is kept');
    assert.equal(keptSale.totalBoxes, 2, 'sales totals recomputed from remaining packing rows');
    assert.equal(keptSale.grossWeight, 20);
    // Other suppliers and the product catalogue are untouched.
    assert.ok(await db.supplier.findUnique({ where: { id: other.id } }));
    assert.ok(await db.purchaseContract.findUnique({ where: { id: otherContract.id } }));
    assert.ok(await db.product.findUnique({ where: { id: product.id } }));
    const log = await db.operationLog.findFirst({ where: { entity: 'Supplier', action: 'HARD_DELETE', entityId: supplier.id } });
    assert.equal(log.userId, users.ADMIN.id);
    assert.deepEqual(JSON.parse(log.oldValue).counts, fresh.counts);
    // Replaying the token for a now-missing supplier is 404, not a second delete.
    assert.equal((await send('POST', `/suppliers/${supplier.id}/hard-delete`, 'ADMIN', { confirmToken: fresh.confirmToken })).status, 404);
  });

  await t.test('supplier hard delete: rolls back completely when a later step fails; customs/invoice links block', async () => {
    const supplier = await db.supplier.create({ data: { name: 'Synthetic rollback supplier' } });
    const contract = await db.purchaseContract.create({ data: { contractNo: 'HD-RB', supplierId: supplier.id, items: { create: [{ productId: product.id, quantity: 1, unitPrice: 1, totalPrice: 1 }] } }, include: { items: true } });
    const sale = await db.salesContract.create({ data: { contractNo: 'EXP-HD-RB', exchangeRate: 7 } });
    const packing = await db.packingItem.create({ data: { salesContractId: sale.id, purchaseItemId: contract.items[0].id, productId: product.id, quantity: 1 } });
    const token = (await send('GET', `/suppliers/${supplier.id}/hard-delete-preview`, 'ADMIN')).json.data.confirmToken;
    // Force the final operation_logs insert to fail: the whole delete must roll back.
    await db.$executeRawUnsafe('CREATE TRIGGER hd_fail BEFORE INSERT ON operation_logs WHEN NEW.action = \'HARD_DELETE\' BEGIN SELECT RAISE(ABORT, \'synthetic failure\'); END');
    assert.equal((await send('POST', `/suppliers/${supplier.id}/hard-delete`, 'ADMIN', { confirmToken: token })).status, 500);
    await db.$executeRawUnsafe('DROP TRIGGER hd_fail');
    assert.ok(await db.supplier.findUnique({ where: { id: supplier.id } }));
    assert.ok(await db.purchaseContract.findUnique({ where: { id: contract.id } }));
    assert.ok(await db.packingItem.findUnique({ where: { id: packing.id } }));

    const declaration = await db.customsDeclaration.create({ data: { declarationNo: 'HD-DECL', salesContractId: sale.id } });
    await db.customsDeclarationItem.create({ data: { customsDeclarationId: declaration.id, productId: product.id, packingItemId: packing.id, customsName: 'SYNTH', quantity: 1 } });
    const customs = (await send('GET', `/suppliers/${supplier.id}/hard-delete-preview`, 'ADMIN')).json.data;
    assert.equal(customs.canDelete, false);
    assert.match(customs.blockers.join(), /报关/);
  });
});
