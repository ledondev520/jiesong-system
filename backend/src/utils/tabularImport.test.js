const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { parseTabularFile } = require('./tabularImport');

test('tabular boundary rejects empty/duplicate headers, ragged rows and excess rows', async () => {
  for (const csv of ['', 'a,a\n1,2', ',b\n1,2', 'a,b\n1', 'a\n' + '1\n'.repeat(5001)]) {
    await assert.rejects(parseTabularFile({ originalname: 'synthetic.csv', buffer: Buffer.from(csv) }), { statusCode: 400 });
  }
  const result = await parseTabularFile({ originalname: 'synthetic.csv', buffer: Buffer.from('\ufeffa,b\r\n"text, with comma",001\r\n') });
  assert.deepEqual(result.data, [{ a: 'text, with comma', b: '001' }]);
});

test('xlsx rejects formulas and multiple worksheets and preserves leading zero strings', async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('data'); sheet.addRow(['code', 'quantity']); sheet.addRow(['001', 2]);
  const parse = async () => parseTabularFile({ originalname: 'synthetic.xlsx', buffer: Buffer.from(await book.xlsx.writeBuffer()) });
  assert.deepEqual((await parse()).data, [{ code: '001', quantity: '2' }]);
  sheet.getCell('B2').value = { formula: '1+1', result: 2 };
  await assert.rejects(parse(), { statusCode: 400 });
  sheet.getCell('B2').value = 2; book.addWorksheet('extra');
  await assert.rejects(parse(), { statusCode: 400 });
});

test('xlsx rejects oversized expanded archives before ExcelJS loads any workbook', async t => {
  const JSZip = require('jszip');
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('data'); sheet.addRow(['a', 'b']); sheet.addRow(['1', '2']);
  const zip = await JSZip.loadAsync(await book.xlsx.writeBuffer());
  zip.file('synthetic-padding.bin', Buffer.alloc(33 * 1024 * 1024, 65));
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  assert.ok(buffer.length < 100000);
  let loads = 0;
  const prototype = Object.getPrototypeOf(book.xlsx);
  const load = prototype.load;
  t.mock.method(prototype, 'load', function (...args) { loads++; return load.apply(this, args); });
  await assert.rejects(parseTabularFile({ originalname: 'expanded.xlsx', buffer }), { statusCode: 400 });
  assert.equal(loads, 0);
});

test('xlsx rejects expanding merges and out-of-bound XML coordinates before model allocation', async t => {
  const JSZip = require('jszip');
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('data');
  sheet.addRow(['a', 'b']); sheet.addRow(['1', '2']);
  const original = await book.xlsx.writeBuffer();
  const prototype = Object.getPrototypeOf(book.xlsx);
  let loads = 0;
  t.mock.method(prototype, 'load', async () => { loads++; throw new Error('must reject before ExcelJS allocation'); });
  const cases = [
    ['xl/worksheets/sheet1.xml', xml => xml.replace('</sheetData>', '</sheetData><mergeCells count="1"><mergeCell ref="A1:XFD1048576"/></mergeCells>')],
    ['xl/worksheets/sheet1.xml', xml => xml.replace('r="2"', 'r="100000000"')],
    ['xl/worksheets/sheet1.xml', xml => xml.replace('r="B2"', 'r="XFD2"')],
    ['xl/worksheets/sheet1.xml', xml => xml.replace('<sheetData>', '<cols><col min="1" max="100000000" width="10"/></cols><sheetData>')],
    ['xl/workbook.xml', xml => xml.replace('sheetId="1"', 'sheetId="100000000"')],
  ];
  for (const [name, change] of cases) {
    const zip = await JSZip.loadAsync(original);
    zip.file(name, change(await zip.file(name).async('string')));
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    await assert.rejects(parseTabularFile({ originalname: 'shape.xlsx', buffer }), { statusCode: 400 });
  }
  assert.equal(loads, 0);
});
