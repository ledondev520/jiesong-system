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

// Traversal-shaped payloads: the service must never treat them as paths.
const TRAVERSAL_PAYLOADS = [
  ['dot-dot slash', '../../../../etc/passwd'],
  ['dot-dot backslash', '..\\..\\..\\windows\\win.ini'],
  ['absolute posix path', '/etc/passwd'],
  ['absolute windows path', 'C:\\Windows\\win.ini'],
  ['percent-encoded traversal', '%2e%2e%2f%2e%2e%2fetc%2fpasswd'],
  ['double-encoded traversal', '..%252f..%252fetc%252fpasswd'],
  ['null byte suffix', 'synthetic.csv\u0000../../etc/passwd'],
  ['file URL', 'file:///etc/passwd'],
];

function spyFilesystemReads(t) {
  return ['readFileSync', 'openSync', 'createReadStream', 'readFile', 'open'].map(name => t.mock.method(fs, name));
}

test('traversal payloads as string sources are rejected without any filesystem read', async t => {
  for (const [label, source] of TRAVERSAL_PAYLOADS) {
    await t.test(label, async t => {
      const create = stubDatabase(t);
      const reads = spyFilesystemReads(t);
      const promiseReads = ['readFile', 'open'].map(name => t.mock.method(fs.promises, name));
      await assert.rejects(importCSVData(source, 'synthetic-admin'), error => {
        assert.equal(error.statusCode, 400);
        assert.match(error.message, /内存/);
        return true;
      });
      for (const spy of [...reads, ...promiseReads]) assert.equal(spy.mock.callCount(), 0);
      assert.equal(create.mock.callCount(), 0);
    });
  }
});

test('traversal payloads as disk-upload paths are rejected even with a safe-looking name', async t => {
  for (const [label, target] of TRAVERSAL_PAYLOADS) {
    await t.test(label, async t => {
      const create = stubDatabase(t);
      const reads = spyFilesystemReads(t);
      await assert.rejects(importCSVData({ originalname: 'synthetic.csv', path: target }, 'synthetic-admin'), error => {
        assert.equal(error.statusCode, 400);
        return true;
      });
      for (const spy of reads) assert.equal(spy.mock.callCount(), 0);
      assert.equal(create.mock.callCount(), 0);
    });
  }
});

test('traversal-shaped originalname only labels the in-memory import record', async t => {
  const cases = [
    ['../../../../tmp/evil.csv', 'evil.csv'],
    ['..\\..\\evil.csv', 'evil.csv'],
    ['/etc/cron.d/evil.csv', 'evil.csv'],
    ['C:\\Windows\\evil.csv', 'evil.csv'],
    ['..%2F..%2Fevil.csv', '..%2F..%2Fevil.csv'],
    ['evil\u0000.csv', 'evil.csv'],
    ['../evil\u0000/../x.csv', 'x.csv'],
  ];
  for (const [originalname, expected] of cases) {
    await t.test(JSON.stringify(originalname), async t => {
      const create = stubDatabase(t);
      const reads = spyFilesystemReads(t);
      const result = await importCSVData({ originalname, buffer: csv }, 'synthetic-admin');
      assert.equal(result.successRows, 1);
      for (const spy of reads) assert.equal(spy.mock.callCount(), 0);
      const { fileName } = create.mock.calls[0].arguments[0].data;
      assert.equal(fileName, expected);
      assert.doesNotMatch(fileName, /[\\/\u0000]/);
    });
  }
});

test('toImportRecordFileName bounds length and tolerates missing names', () => {
  const { toImportRecordFileName } = require('./importService');
  assert.equal(toImportRecordFileName(undefined), '');
  assert.equal(toImportRecordFileName(`${'a'.repeat(400)}.csv`).length, 255);
  assert.equal(toImportRecordFileName('dir/sub\\name.xlsx'), 'name.xlsx');
});
