/** Actual multipart/HTTP/SQLite attachment lifecycle; only generated disposable fixtures. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('HTTP/SQLite: contract attachments retain bytes, roles and evidence through legacy routes', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-attachment-lifecycle-'));
  fs.chmodSync(directory, 0o700);
  const dbFile = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-attachment-secret-never-production';
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
  const jwt = require('jsonwebtoken');
  const config = require('../config');
  const users = {};
  for (const role of ['SALES', 'PURCHASE', 'WAREHOUSE', 'BOSS', 'FINANCE', 'ADMIN', 'INACTIVE']) {
    const user = await db.user.create({ data: { username: `synthetic-attachment-${role}`, password: 'test-only-unused-hash', name: `Synthetic ${role}`, role: role === 'INACTIVE' ? 'SALES' : role, isActive: role !== 'INACTIVE' } });
    // Claimed role deliberately differs; actual database role remains authoritative.
    users[role] = jwt.sign({ userId: user.id, role: 'ADMIN' }, config.jwt.secret);
  }
  const supplier = await db.supplier.create({ data: { name: 'Synthetic attachment supplier' } });
  const purchase = await db.purchaseContract.create({ data: { contractNo: 'SYNTHETIC-PURCHASE-ATTACHMENT', supplierId: supplier.id } });
  const sales = await db.salesContract.create({ data: { contractNo: 'SYNTHETIC-SALES-ATTACHMENT', exchangeRate: 7 } });
  const app = require('../app'); // The actual global rate limiter remains mounted.
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  let requestCount = 0;
  const call = async (method, url, body, { role = 'SALES', expected = 200, binary = false } = {}) => {
    requestCount++;
    const response = await fetch(base + url, { method, headers: { ...(role ? { authorization: `Bearer ${users[role]}` } : {}), ...(body instanceof FormData ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }) });
    const result = binary && response.ok ? Buffer.from(await response.arrayBuffer()) : response.headers.get('content-type')?.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, expected, `${method} ${url}: ${result.message || ''}`);
    return binary && response.ok ? { bytes: result, headers: response.headers } : result.data;
  };
  const generatedPdf = Buffer.from('%PDF-1.4\n% Entirely synthetic attachment fixture\n%%EOF\n');
  const form = ({ contractType = 'PURCHASE', bytes = generatedPdf, type = 'application/pdf', category = 'SIGNED_CONTRACT', description, includeFile = true } = {}) => {
    const body = new FormData();
    if (includeFile) body.append('file', new Blob([bytes], { type }), 'synthetic.pdf');
    body.append('contractType', contractType);
    body.append('category', category);
    if (description) body.append('description', description);
    return body;
  };
  const storedFiles = (root = config.upload.dir) => fs.existsSync(root) ? fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? storedFiles(path.join(root, entry.name)) : [path.relative(config.upload.dir, path.join(root, entry.name))]).sort() : [];
  const snapshot = async () => ({ purchases: await db.contractFile.findMany({ orderBy: { id: 'asc' } }), sales: await db.salesContractFile.findMany({ orderBy: { id: 'asc' } }), files: storedFiles() });
  let purchaseFile, salesFile;

  await t.test('upload and same-name new version remain distinct; canonical and legacy lists/downloads agree', async () => {
    purchaseFile = await call('POST', `/contracts/${purchase.id}/files`, form(), { role: 'PURCHASE', expected: 201 });
    salesFile = await call('POST', `/sales/${sales.id}/files`, form({ contractType: 'SALES' }), { expected: 201 });
    const newVersion = await call('POST', `/contracts/${purchase.id}/files`, form({ bytes: Buffer.from('%PDF-1.4\n% Synthetic replacement version\n%%EOF') }), { role: 'PURCHASE', expected: 201 });
    assert.notEqual(newVersion.id, purchaseFile.id);
    assert.notEqual(newVersion.filePath, purchaseFile.filePath);
    assert.equal(newVersion.fileName, purchaseFile.fileName);
    for (const file of [purchaseFile, salesFile, newVersion]) {
      const absolute = path.join(config.upload.dir, file.filePath);
      assert.equal(fs.statSync(absolute).mode & 0o777, 0o600);
      assert.equal(fs.statSync(path.dirname(absolute)).mode & 0o777, 0o700);
    }
    for (const role of ['SALES', 'PURCHASE', 'WAREHOUSE', 'BOSS', 'FINANCE']) {
      for (const [record, file, type, legacy] of [[purchase, purchaseFile, 'PURCHASE', 'purchases'], [sales, salesFile, 'SALES', 'sales']]) {
        const files = await call('GET', `/contracts/${record.id}/files?contractType=${type}`, undefined, { role });
        assert.ok(files.some(item => item.id === file.id && item.contractType === type));
        for (const url of [`/files/${file.id}/download`, `/${legacy}/files/${file.id}/download`]) {
          const result = await call('GET', url, undefined, { role, binary: true });
          assert.deepEqual(result.bytes, generatedPdf);
          assert.match(result.headers.get('content-disposition'), /synthetic\.pdf/);
        }
      }
    }
    const legacyList = await call('GET', `/purchases/${purchase.id}/files`, undefined, { role: 'BOSS' });
    assert.deepEqual(new Set(legacyList.map(file => file.id)), new Set([newVersion.id, purchaseFile.id]));
  });

  await t.test('explicit write roles can upload and remove their disposable attachment through either route family', async () => {
    for (const [index, role] of ['SALES', 'PURCHASE', 'WAREHOUSE', 'FINANCE'].entries()) {
      const file = await call('POST', `/contracts/${sales.id}/files`, form({ contractType: 'SALES' }), { role, expected: 201 });
      await call('DELETE', index % 2 ? `/files/${file.id}` : `/sales/files/${file.id}`, undefined, { role });
      assert.equal(await db.salesContractFile.findUnique({ where: { id: file.id } }), null);
      assert.equal(fs.existsSync(path.join(config.upload.dir, file.filePath)), false);
    }
  });

  await t.test('BOSS, inactive and unauthenticated actions leave both rows and storage unchanged', async () => {
    const before = await snapshot();
    for (const [method, url, body, role, expected] of [
      ['POST', `/contracts/${purchase.id}/files`, form(), 'BOSS', 403],
      ['POST', `/purchases/${purchase.id}/files`, form(), 'BOSS', 403],
      ['POST', `/sales/${sales.id}/files`, form({ contractType: 'SALES' }), 'BOSS', 403],
      ['DELETE', `/files/${purchaseFile.id}`, undefined, 'BOSS', 403],
      ['DELETE', `/purchases/files/${purchaseFile.id}`, undefined, 'BOSS', 403],
      ['DELETE', `/sales/files/${salesFile.id}`, undefined, 'BOSS', 403],
      ['GET', `/files/${purchaseFile.id}/download`, undefined, null, 401],
      ['POST', `/contracts/${purchase.id}/files`, form(), 'INACTIVE', 401],
    ]) await call(method, url, body, { role, expected });
    assert.deepEqual(await snapshot(), before);
  });

  await t.test('missing contract uploads return 404 without orphaned payloads on all supported write routes', async sub => {
    for (const [url, contractType] of [['/contracts/synthetic-missing/files', 'PURCHASE'], ['/purchases/synthetic-missing/files', 'PURCHASE'], ['/sales/synthetic-missing/files', 'SALES']]) {
      const before = await snapshot();
      await sub.test(url, async () => {
        let statusError;
        try { await call('POST', url, form({ contractType }), { expected: 404 }); } catch (error) { statusError = error; }
        assert.deepEqual(await snapshot(), before, 'rejected upload must not leave its new payload');
        if (statusError) throw statusError;
      });
    }
  });

  await t.test('invalid type, missing file, unsupported MIME and oversized multipart preserve existing versions', async sub => {
    for (const [url, body, expected] of [
      [`/contracts/${purchase.id}/files`, form({ contractType: 'TYPO' }), 400],
      [`/contracts/${purchase.id}/files`, form({ includeFile: false }), 400],
      [`/purchases/${purchase.id}/files`, form({ includeFile: false }), 400],
      [`/sales/${sales.id}/files`, form({ contractType: 'SALES', includeFile: false }), 400],
      [`/contracts/${purchase.id}/files`, form({ type: 'text/plain' }), 400],
      [`/purchases/${purchase.id}/files`, form({ type: 'text/plain' }), 400],
      [`/sales/${sales.id}/files`, form({ contractType: 'SALES', type: 'text/plain' }), 400],
      [`/contracts/${purchase.id}/files`, form({ category: 'PRODUCTION_PHOTO' }), 400],
      [`/contracts/${purchase.id}/files`, form({ bytes: Buffer.alloc(10 * 1024 * 1024 + 1, 65) }), 400],
    ]) {
      await sub.test(`${url}: ${body.get('contractType')}, ${body.get('file')?.type || 'no file'}, ${body.get('category')}`, async () => {
        const current = await snapshot();
        await call('POST', url, body, { expected });
        assert.deepEqual(await snapshot(), current);
      });
    }
  });

  await t.test('tax confirmation bytes and deletion retain ADMIN/FINANCE boundary through canonical and legacy sales routes', async () => {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Synthetic').addRow(['Entirely generated non-business fixture']);
    const protectedBytes = Buffer.from(await workbook.xlsx.writeBuffer());
    const fileService = require('../services/fileService');
    const protectedFile = await fileService.archiveGeneratedFile({ contractId: sales.id, contractType: 'SALES', buffer: protectedBytes, fileName: 'synthetic-confirmation.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', category: 'SYSTEM_GENERATED_XLSX', description: '退税出货清单确认:synthetic:version' });
    const before = await snapshot();
    for (const role of ['SALES', 'PURCHASE', 'WAREHOUSE', 'BOSS']) {
      for (const url of [`/files/${protectedFile.id}/download`, `/sales/files/${protectedFile.id}/download`]) await call('GET', url, undefined, { role, expected: 403 });
      for (const url of [`/files/${protectedFile.id}`, `/sales/files/${protectedFile.id}`]) await call('DELETE', url, undefined, { role, expected: 403 });
    }
    assert.deepEqual(await snapshot(), before);
    for (const role of ['FINANCE', 'ADMIN']) {
      for (const url of [`/files/${protectedFile.id}/download`, `/sales/files/${protectedFile.id}/download`]) assert.deepEqual((await call('GET', url, undefined, { role, binary: true })).bytes, protectedBytes);
    }
    await call('DELETE', `/sales/files/${protectedFile.id}`, undefined, { role: 'FINANCE' });
    assert.equal(fs.existsSync(path.join(config.upload.dir, protectedFile.filePath)), false);
    const purchaseProtected = await fileService.archiveGeneratedFile({ contractId: purchase.id, buffer: protectedBytes, fileName: 'synthetic-confirmation.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', category: 'SYSTEM_GENERATED_XLSX', description: '退税出货清单确认:synthetic:version' });
    const unchanged = await snapshot();
    await call('GET', `/purchases/files/${purchaseProtected.id}/download`, undefined, { expected: 403 });
    await call('DELETE', `/purchases/files/${purchaseProtected.id}`, undefined, { expected: 403 });
    assert.deepEqual(await snapshot(), unchanged);
    await call('DELETE', `/files/${purchaseProtected.id}`, undefined, { role: 'ADMIN' });
  });

  await t.test('referenced carrier original survives attempted deletion through both sales routes', async () => {
    const carrier = await call('POST', `/contracts/${sales.id}/files`, form({ contractType: 'SALES', category: 'CARRIER_DOCUMENT' }), { expected: 201 });
    await db.packingListCheck.create({ data: { salesContractId: sales.id, salesContractFileId: carrier.id, automaticStatus: 'NEEDS_MANUAL_REVIEW', status: 'NEEDS_MANUAL_REVIEW', summaryJson: '{}', resultJson: '{}' } });
    const before = await snapshot();
    for (const url of [`/files/${carrier.id}`, `/sales/files/${carrier.id}`]) await call('DELETE', url, undefined, { role: 'WAREHOUSE', expected: 409 });
    assert.deepEqual(await snapshot(), before);
    assert.deepEqual((await call('GET', `/files/${carrier.id}/download`, undefined, { role: 'BOSS', binary: true })).bytes, generatedPdf);
  });

  await t.test('legacy procurement deletion preserves existing physical archive retention; repeat delete is 404', async () => {
    const file = await call('POST', `/purchases/${purchase.id}/files`, form(), { role: 'PURCHASE', expected: 201 });
    await call('DELETE', `/purchases/files/${file.id}`, undefined, { role: 'PURCHASE' });
    assert.equal(await db.contractFile.findUnique({ where: { id: file.id } }), null);
    // Existing legacy retention is intentional; failed new uploads are separately cleaned.
    assert.equal(fs.existsSync(path.join(config.upload.dir, file.filePath)), true);
    await call('DELETE', `/files/${file.id}`, undefined, { role: 'PURCHASE', expected: 404 });
  });

  await t.test('missing record, lost disk bytes and cross-type legacy downloads return 404 without changes', async () => {
    // app.js has no public upload static mount; generated bytes cannot bypass auth.
    requestCount++;
    const staticResponse = await fetch(base.replace(/\/api\/v1$/, '') + '/uploads/' + salesFile.filePath);
    assert.equal(staticResponse.status, 404);
    await call('GET', `/contracts/${purchase.id}/files?contractType=TYPO`, undefined, { expected: 400 });
    for (const url of ['/files/synthetic-missing/download', `/purchases/files/${salesFile.id}/download`, `/sales/files/${purchaseFile.id}/download`]) await call('GET', url, undefined, { expected: 404 });
    // Removing only this worker's generated disposable payload simulates lost storage.
    fs.unlinkSync(path.join(config.upload.dir, purchaseFile.filePath));
    const before = await snapshot();
    for (const url of [`/files/${purchaseFile.id}/download`, `/purchases/files/${purchaseFile.id}/download`]) await call('GET', url, undefined, { expected: 404 });
    assert.deepEqual(await snapshot(), before);
  });
  assert.ok(requestCount <= 100, 'real global limiter budget must not be bypassed by the fixture');
  t.diagnostic(`${requestCount} real HTTP requests with generated disposable fixtures; global limiter enabled`);
});
