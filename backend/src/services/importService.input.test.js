/** Synthetic buffers and temporary paths only; never connects to a database. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const prisma = require('../utils/prisma');
const { importCSVData } = require('./importService');

const csv = Buffer.from('a,b\n1,2');

function stubDatabase(t) {
  const replace = (object, key, implementation) => {
    const original = object[key];
    const mock = t.mock.fn(implementation);
    object[key] = mock;
    t.after(() => { object[key] = original; });
    return mock;
  };
  const create = replace(prisma.importRecord, 'create', async () => ({ id: 'synthetic-import' }));
  replace(prisma.importRecord, 'update', async () => ({}));
  replace(prisma.port, 'findMany', async () => []);
  replace(prisma, '$transaction', async callback => callback({}));
  return create;
}

test('imports reject filesystem paths before parsing or persistence', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-import-input-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const target = path.join(dir, 'synthetic.csv');
  const link = path.join(dir, 'link.csv');
  fs.writeFileSync(target, csv, { mode: 0o600 });
  fs.symlinkSync(target, link);
  const cases = [
    ['path traversal', path.relative(process.cwd(), target)],
    ['absolute path', target],
    ['symbolic link', link],
    ['relative symbolic link', path.relative(process.cwd(), link)],
    ['disk upload object', { originalname: 'synthetic.csv', path: target }],
  ];
  for (const [label, source] of cases) {
    await t.test(label, async t => {
      const create = stubDatabase(t);
      await assert.rejects(importCSVData(source, 'synthetic-admin'), error => {
        assert.equal(error.statusCode, 400);
        assert.match(error.message, /内存/);
        return true;
      });
      assert.equal(create.mock.callCount(), 0);
    });
  }
});

test('normal in-memory CSV and xlsx imports pass', async t => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('data');
  sheet.addRow(['a', 'b']);
  sheet.addRow(['1', '2']);
  const xlsx = Buffer.from(await workbook.xlsx.writeBuffer());
  for (const [originalname, buffer] of [['synthetic.csv', csv], ['synthetic.xlsx', xlsx]]) {
    await t.test(originalname, async t => {
      const create = stubDatabase(t);
      const result = await importCSVData({ originalname, buffer }, 'synthetic-admin');
      assert.equal(result.successRows, 1);
      assert.equal(result.failedRows, 0);
      assert.equal(create.mock.calls[0].arguments[0].data.fileName, originalname);
    });
  }
});
