/**
 * Input: 合成 multipart CSV/xlsx 与畸形 NUL 文件名、模拟认证
 * Output: system 导入内存处理、畸形请求400及零磁盘残留回归
 * Pos: system 导入 HTTP 测试；仅 os.tmpdir()，无真实数据库
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');

function listFiles(root) {
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(entry => !entry.isDirectory())
    .map(entry => path.join(entry.parentPath ?? entry.path, entry.name));
}

test('POST /system/import parses in memory, writes nothing to disk and ignores traversal filenames', async t => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-system-import-'));
  const dir = path.join(sandbox, 'uploads');
  fs.mkdirSync(dir);
  process.env.UPLOAD_DIR = dir;
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  const auth = require('../middleware/auth');
  t.mock.method(auth, 'authenticate', (req, res, next) => { req.user = { id: 'synthetic-admin', role: 'ADMIN' }; next(); });
  t.mock.method(require('../utils/auditLog'), 'logOperation', async () => ({}));
  const { parseTabularFile } = require('../utils/tabularImport');
  const service = require('../services/importService');
  const seen = [];
  t.mock.method(service, 'importCSVData', async source => {
    assert.ok(Buffer.isBuffer(source.buffer), 'system import must receive in-memory bytes');
    assert.equal(source.path, undefined, 'system import must not create disk files');
    seen.push(service.toImportRecordFileName(source.originalname));
    const parsed = await parseTabularFile(source);
    return { successRows: parsed.data.length, failedRows: 0 };
  });
  const app = require('express')();
  app.use('/system', require('./system'));
  app.use(require('../middleware/errorHandler').errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const send = async (name, bytes, type = 'text/csv') => {
    const form = new FormData(); form.append('file', new Blob([bytes], { type }), name);
    return fetch(`http://127.0.0.1:${server.address().port}/system/import`, { method: 'POST', body: form });
  };

  assert.equal((await send('synthetic.csv', 'a,b\n1,2')).status, 200);
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('data');
  sheet.addRow(['a', 'b']); sheet.addRow(['1', '2']);
  assert.equal((await send('synthetic.xlsx', await book.xlsx.writeBuffer(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).status, 200);

  for (const name of ['../../evil.csv', '..\\..\\evil.csv', `${sandbox}/evil.csv`, '..%2F..%2Fevil.csv']) {
    assert.equal((await send(name, 'a,b\n1,2')).status, 200, name);
  }
  // Busboy rejects NUL bytes in part headers ("Malformed part header") before any storage runs.
  for (const name of ['../../evil.csv\u0000.txt', 'evil\u0000.csv']) {
    const status = (await send(name, 'a,b\n1,2')).status;
    assert.equal(status, 400, `${JSON.stringify(name)} -> ${status}`);
  }
  for (const name of ['../../evil.sh', '/etc/passwd', '%2e%2e%2fevil', 'no-extension']) {
    assert.equal((await send(name, 'a,b\n1,2')).status, 400, name);
  }
  for (const label of seen) assert.doesNotMatch(label, /[\\/\u0000]/);
  assert.deepEqual(listFiles(sandbox), []);
});
