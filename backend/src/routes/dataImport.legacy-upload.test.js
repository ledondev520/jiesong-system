/** Synthetic uploads only. No host configuration or real database is needed. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');

test('legacy multipart imports parse CSV/xlsx in memory and never retain failed uploads', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-legacy-upload-'));
  process.env.UPLOAD_DIR = dir;
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const auth = require('../middleware/auth');
  t.mock.method(auth, 'authenticate', (req, res, next) => { req.user = { id: 'synthetic-admin', role: 'ADMIN' }; next(); });
  t.mock.method(require('../utils/auditLog'), 'logOperation', async () => ({}));
  const { parseTabularFile } = require('../utils/tabularImport');
  const service = require('../services/importService');
  t.mock.method(service, 'importCSVData', async source => {
    assert.equal(typeof source, 'object', 'HTTP imports must not create disk files');
    const parsed = await parseTabularFile(source);
    return { successRows: parsed.data.length, failedRows: 0 };
  });
  const app = require('express')();
  app.use('/import', require('./dataImport'));
  app.use(require('../middleware/errorHandler').errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const send = async (name, bytes, type = 'text/csv') => {
    const form = new FormData(); form.append('file', new Blob([bytes], { type }), name);
    return fetch(`http://127.0.0.1:${server.address().port}/import`, { method: 'POST', body: form });
  };
  assert.equal((await send('synthetic.csv', 'a,b\n1,2')).status, 200);
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('data');
  sheet.addRow(['a', 'b']); sheet.addRow(['1', '2']);
  assert.equal((await send('synthetic.xlsx', await book.xlsx.writeBuffer(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).status, 200);
  for (const [name, bytes] of [['bad.xlsx', 'bad'], ['bad.xls', 'a,b\n1,2'], ['bad.pdf', 'bad'], ['no-extension', 'a,b\n1,2']]) {
    assert.equal((await send(name, bytes)).status, 400);
  }
  assert.deepEqual(fs.readdirSync(dir), []);
});
