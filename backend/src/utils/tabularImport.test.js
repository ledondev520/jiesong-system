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
