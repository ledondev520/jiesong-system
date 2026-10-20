/**
 * Input: 合成 multipart 流、临时上传配置与真实 Multer/Busboy
 * Output: 无监听端口的采购内存上传、大小/扩展名及 NUL 解析回归
 * Pos: 采购上传工具单元测试；仅 os.tmpdir()，不访问数据库
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PassThrough } = require('node:stream');

test('采购专用Multer以真实multipart流解析内存字节且不创建上传目录', async t => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-purchase-memory-'));
  const originalEnv = { ...process.env };
  process.env.UPLOAD_DIR = path.join(sandbox, 'never-created');
  process.env.MAX_FILE_SIZE = '32';
  t.after(() => { process.env = originalEnv; fs.rmSync(sandbox, { recursive: true, force: true }); });
  t.mock.method(console, 'error', () => {});
  const { purchaseExcelUpload } = require('./purchaseExcelUpload');
  const { errorHandler } = require('../middleware/errorHandler');
  const parse = async (name, bytes = Buffer.from('synthetic-workbook')) => {
    const boundary = 'synthetic-boundary';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      bytes, Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const req = new PassThrough();
    req.headers = { 'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': String(body.length) };
    req.method = 'POST';
    const result = new Promise(resolve => purchaseExcelUpload.single('file')(req, {}, error => resolve({ error, file: req.file })));
    req.end(body);
    return result;
  };
  const expect400 = error => {
    assert.ok(error);
    const res = { status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; } };
    errorHandler(error, {}, res, () => {});
    assert.equal(res.code, 400);
    assert.match(res.payload.message, /[\u4e00-\u9fff]/);
  };
  for (const name of ['synthetic.xlsx', 'synthetic.xls', 'synthetic.XLSX', '../../evil.xlsx', '..\\..\\evil.xlsx', '%252e%252e%252fevil.xlsx']) {
    const { error, file } = await parse(name);
    assert.ifError(error);
    assert.ok(Buffer.isBuffer(file.buffer));
    assert.deepEqual(file.buffer, Buffer.from('synthetic-workbook'));
    assert.equal(file.path, undefined);
  }
  for (const name of ['bad.pdf', 'bad.csv', 'no-extension']) expect400((await parse(name)).error);
  const tooLarge = (await parse('large.xlsx', Buffer.alloc(33))).error;
  assert.equal(tooLarge.code, 'LIMIT_FILE_SIZE');
  expect400(tooLarge);
  const malformed = (await parse('evil\u0000.xlsx')).error;
  assert.equal(malformed.message, 'Malformed part header');
  expect400(malformed);
  assert.deepEqual(fs.readdirSync(sandbox, { recursive: true }), []);
});
