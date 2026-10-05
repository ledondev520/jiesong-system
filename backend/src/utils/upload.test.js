/**
 * Input: upload 模块
 * Output: 上传模块导出与流开始前的受限日期目录/失败回调测试
 * Pos: 上传工具回归测试，只使用临时目录
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-multipart-directory-'));
fs.chmodSync(root, 0o700);
const originalUploadDir = process.env.UPLOAD_DIR;
process.env.UPLOAD_DIR = root;
const mod = require('./upload');
const dateDirectory = path.join(root, new Date().toISOString().slice(0, 10).replace(/-/g, ''));
test.after(() => {
  fs.rmSync(root, { recursive: true, force: true });
  if (originalUploadDir === undefined) delete process.env.UPLOAD_DIR;
  else process.env.UPLOAD_DIR = originalUploadDir;
});

test('upload: 模块可正常加载并导出', () => {
  assert.ok(mod !== undefined);
});

test('upload: 新日期目录在写流开始前以0700创建，通用/合同上传共用存储', () => {
  const originalUmask = process.umask(0o022); // Reproduce the legacy default 0755 deterministically.
  let called = false;
  try {
    assert.equal(mod.upload.storage, mod.contractUpload.storage);
    mod.upload.storage.getDestination({}, {}, (error, destination) => {
      called = true;
      assert.ifError(error);
      assert.equal(destination, dateDirectory);
      assert.equal(fs.statSync(destination).mode & 0o777, 0o700);
    });
    assert.equal(called, true);
  } finally {
    process.umask(originalUmask);
    fs.rmSync(dateDirectory, { recursive: true, force: true });
  }
});

test('upload: 已有日期目录在返回存储目的地前收紧为0700', () => {
  fs.mkdirSync(dateDirectory, { mode: 0o755 });
  fs.chmodSync(dateDirectory, 0o755);
  let called = false;
  try {
    mod.contractUpload.storage.getDestination({}, {}, (error, destination) => {
      called = true;
      assert.ifError(error);
      assert.equal(fs.statSync(destination).mode & 0o777, 0o700);
    });
    assert.equal(called, true);
  } finally {
    fs.rmSync(dateDirectory, { recursive: true, force: true });
  }
});

test('upload: 创建或收紧目的目录失败经Multer回调拒绝，不能启动文件流', async t => {
  for (const method of ['mkdirSync', 'chmodSync']) {
    await t.test(method, async sub => {
      const failure = new Error(`synthetic ${method} failure`);
      sub.mock.method(fs, method, () => { throw failure; });
      let called = false;
      assert.doesNotThrow(() => mod.upload.storage.getDestination({}, {}, (error, destination) => {
        called = true;
        assert.equal(error, failure);
        assert.equal(destination, undefined);
      }));
      assert.equal(called, true);
      fs.rmSync(dateDirectory, { recursive: true, force: true });
    });
  }
});
