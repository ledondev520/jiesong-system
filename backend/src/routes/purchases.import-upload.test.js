/**
 * Input: 合成 XLS/XLSX multipart、畸形文件名及模拟认证/服务
 * Output: 采购内存上传兼容性、鉴权顺序、限制及四类上传路由的 NUL 输入400回归
 * Pos: localhost HTTP 上传边界测试；仅 os.tmpdir()，无真实数据库
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const xlsx = require('xlsx');

test('purchase imports use memory and all representative upload routes reject NUL multipart with 400', async t => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-purchase-upload-'));
  const originalEnv = { ...process.env };
  process.env.UPLOAD_DIR = path.join(sandbox, 'uploads');
  process.env.MAX_FILE_SIZE = String(64 * 1024);
  t.after(() => { process.env = originalEnv; fs.rmSync(sandbox, { recursive: true, force: true }); });
  t.mock.method(console, 'error', () => {});
  const auth = require('../middleware/auth');
  t.mock.method(auth, 'authenticate', (req, res, next) => {
    if (req.headers['x-test-role'] === 'anonymous') return res.sendStatus(401);
    req.user = { id: 'synthetic-admin', role: req.headers['x-test-role'] || 'ADMIN' };
    next();
  });
  t.mock.method(require('../utils/auditLog'), 'logOperation', async () => ({}));
  const seen = [];
  t.mock.method(require('../services/purchaseImportExportService'), 'importPurchasesExcel', async (source, userId, options) => {
    assert.ok(Buffer.isBuffer(source.buffer), 'purchase import must receive in-memory bytes');
    assert.equal(source.path, undefined, 'purchase import must not receive a disk path');
    assert.equal(userId, 'synthetic-admin');
    const book = xlsx.read(source.buffer, { type: 'buffer' });
    assert.deepEqual(xlsx.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1 }), [['供应商名称'], ['合成供应商']]);
    seen.push({ source, options });
    return { successRows: 1, failedRows: 0, errors: [] };
  });
  const importCall = t.mock.method(require('../services/importService'), 'importCSVData', async () => {
    assert.fail('malformed multipart must not reach generic import service');
  });
  const attachmentCall = t.mock.method(require('../controllers/fileController'), 'uploadFile', () => {
    assert.fail('malformed multipart must not reach attachment controller');
  });
  const app = require('express')();
  app.use('/api/v1/purchases', require('./purchases'));
  app.use('/api/v1/import', require('./dataImport'));
  app.use('/api/v1/system', require('./system'));
  app.use('/api/v1', require('./files'));
  app.use(require('../middleware/errorHandler').errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const book = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(book, xlsx.utils.aoa_to_sheet([['供应商名称'], ['合成供应商']]), '采购合同');
  const bytes = xlsx.write(book, { type: 'buffer', bookType: 'xlsx' });
  const send = (name, content = bytes, role = 'ADMIN', historical = false) => {
    const form = new FormData();
    if (historical) form.append('historical', 'true');
    form.append('file', new Blob([content], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
    return fetch(`${base}/api/v1/purchases/import`, { method: 'POST', headers: { 'x-test-role': role }, body: form });
  };
  for (const name of ['synthetic.xlsx', '../../evil.xlsx', '..\\..\\evil.xlsx', `${sandbox}/evil.xlsx`,
    '..%2F..%2Fevil.xlsx', '%252e%252e%252fevil.xlsx', 'synthetic.XLSX']) {
    assert.equal((await send(name)).status, 200, name);
  }
  assert.equal((await send('synthetic.xls', xlsx.write(book, { type: 'buffer', bookType: 'biff8' }))).status, 200);
  for (const role of ['ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE']) {
    assert.equal((await send('synthetic.xlsx', bytes, role, true)).status, 200);
    assert.deepEqual(seen.at(-1).options, { historical: true });
  }
  const accepted = seen.length;
  for (const name of ['bad.pdf', 'bad.csv', 'no-extension']) assert.equal((await send(name)).status, 400, name);
  assert.equal((await send('large.xlsx', Buffer.alloc(64 * 1024 + 1))).status, 400);
  // An otherwise invalid upload must still authenticate/authorize before parsing.
  assert.equal((await send('bad.pdf', bytes, 'anonymous')).status, 401);
  assert.equal((await send('bad.pdf', bytes, 'BOSS')).status, 403);
  assert.equal(seen.length, accepted);

  // Construct raw headers to ensure NUL bytes really reach Busboy unchanged.
  // files.js validates only the nonempty contract ID before contractUpload;
  // malformed headers therefore fail before any DB/controller/archive access.
  for (const route of ['/api/v1/purchases/import', '/api/v1/import', '/api/v1/system/import', '/api/v1/contracts/synthetic-contract/files']) {
    const boundary = 'synthetic-multipart-boundary';
    const body = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="evil\u0000.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\nsynthetic\r\n--${boundary}--\r\n`);
    const response = await fetch(`${base}${route}`, { method: 'POST', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, body });
    assert.equal(response.status, 400, route);
    assert.equal((await response.json()).message, '上传请求格式错误，请检查文件名或重新选择文件后重试');
  }
  assert.equal(importCall.mock.callCount(), 0);
  assert.equal(attachmentCall.mock.callCount(), 0);
  assert.equal(seen.length, accepted);
  assert.deepEqual(fs.readdirSync(sandbox, { recursive: true, withFileTypes: true }).filter(entry => !entry.isDirectory()), []);
});
