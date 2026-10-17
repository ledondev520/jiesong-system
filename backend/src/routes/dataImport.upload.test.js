const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const ExcelJS = require('exceljs');
const { errorHandler } = require('../middleware/errorHandler');

async function workbookBytes() {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('出货汇总');
  sheet.addRow(['序号', '报关名', '门店', '柜子编号', '报关数量']);
  sheet.addRow(['001', '合成商品', '合成门店', '26-001-OAK', 2]);
  return Buffer.from(await book.xlsx.writeBuffer());
}

test('HTTP multipart: xlsx and CSV preview agree; invalid uploads return 400', async t => {
  const auth = require('../middleware/auth');
  t.mock.method(auth, 'authenticate', (req, res, next) => { req.user = { role: 'ADMIN' }; next(); });
  const service = require('../services/dataImportService');
  t.mock.method(service, 'compareWithDatabase', async rows => ({
    summary: { total: rows.length, new: rows.length, existing: 0, invalid: 0 },
    newRecords: rows, existingRecords: [], invalidRecords: [],
  }));
  const app = express();
  app.use('/import', require('./dataImport'));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const send = async (name, bytes) => {
    const form = new FormData(); form.append('file', new Blob([bytes]), name);
    const response = await fetch(`http://127.0.0.1:${server.address().port}/import/preview`, { method: 'POST', body: form });
    return { status: response.status, body: await response.json() };
  };
  const xlsx = await send('synthetic.XLSX', await workbookBytes());
  assert.equal(xlsx.status, 200);
  const csv = await send('synthetic.csv', '序号,报关名,门店,柜子编号,报关数量\n001,合成商品,合成门店,26-001-OAK,2');
  assert.equal(csv.status, 200);
  assert.deepEqual(xlsx.body.data.fullNewRecords, csv.body.data.fullNewRecords);
  for (const [name, bytes] of [['invalid.xlsx', 'not a workbook'], ['invalid.txt', 'bad']]) {
    assert.equal((await send(name, bytes)).status, 400);
  }
});
