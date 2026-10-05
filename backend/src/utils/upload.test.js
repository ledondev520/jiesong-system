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

test('upload: 日期子目录符号链接在chmod或写流前拒绝，外部/已存附件哨兵不变', async t => {
  for (const kind of ['outside-root', 'in-root-alias']) {
    await t.test(kind, () => {
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-stream-outside-'));
      const target = kind === 'outside-root' ? outside : path.join(root, 'retained');
      if (kind === 'in-root-alias') fs.mkdirSync(target, { mode: 0o755 });
      fs.chmodSync(target, 0o755);
      const sentinel = path.join(target, 'synthetic-retained.pdf');
      fs.writeFileSync(sentinel, '%PDF generated retained sentinel', { mode: 0o644 });
      fs.symlinkSync(target, dateDirectory, 'dir');
      let called = false;
      try {
        mod.contractUpload.storage.getDestination({}, {}, (error, destination) => {
          called = true;
          assert.equal(error?.statusCode, 400);
          assert.equal(destination, undefined);
        });
        assert.equal(called, true);
        assert.equal(fs.statSync(target).mode & 0o777, 0o755);
        assert.equal(fs.statSync(sentinel).mode & 0o777, 0o644);
        assert.equal(fs.readFileSync(sentinel, 'utf8'), '%PDF generated retained sentinel');
        assert.equal(fs.lstatSync(dateDirectory).isSymbolicLink(), true);
      } finally {
        fs.rmSync(dateDirectory, { recursive: true, force: true });
        if (kind === 'in-root-alias') fs.rmSync(target, { recursive: true, force: true });
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });
  }
});

test('upload: 可信配置根符号链接/相对路径保持原Multer路径及相对记录格式', async t => {
  for (const kind of ['root-symlink', 'relative-root-trailing-separator']) {
    await t.test(kind, async () => {
      const outer = fs.mkdtempSync(path.join(kind === 'root-symlink' ? os.tmpdir() : path.resolve(process.cwd(), '..'), '.jiesong-stream-root-'));
      fs.chmodSync(outer, 0o700);
      const actualRoot = path.join(outer, 'actual');
      fs.mkdirSync(actualRoot, { mode: 0o700 });
      const alias = path.join(outer, 'configured');
      if (kind === 'root-symlink') fs.symlinkSync(actualRoot, alias, 'dir');
      const uploadRoot = kind === 'root-symlink' ? alias : path.relative(process.cwd(), actualRoot) + path.sep;
      const config = require('../config');
      const originalRoot = config.upload.dir;
      const modulePath = require.resolve('./upload');
      const cachedModule = require.cache[modulePath];
      const prisma = require('../utils/prisma');
      const originalFind = prisma.purchaseContract.findUnique;
      const originalCreate = prisma.contractFile.create;
      config.upload.dir = uploadRoot;
      delete require.cache[modulePath];
      try {
        const compatible = require('./upload');
        let destination;
        compatible.contractUpload.storage.getDestination({}, {}, (error, value) => {
          assert.ifError(error);
          destination = value;
          const date = path.basename(dateDirectory);
          assert.equal(destination, path.join(uploadRoot, date));
          assert.equal(fs.statSync(destination).mode & 0o777, 0o700);
          assert.equal(compatible.getRelativePath(path.resolve(destination, 'synthetic.pdf')), path.join(date, 'synthetic.pdf'));
        });
        const filePath = path.join(destination, 'synthetic.pdf');
        fs.writeFileSync(filePath, '%PDF generated storage-to-service fixture', { mode: 0o644 });
        prisma.purchaseContract.findUnique = async () => ({ id: 'synthetic-contract' });
        prisma.contractFile.create = async ({ data }) => ({ id: 'synthetic-file', ...data });
        const fileService = require('../services/fileService');
        const record = await fileService.createFile('synthetic-contract', 'PURCHASE', {
          path: filePath, originalname: 'synthetic.pdf', mimetype: 'application/pdf', size: 14,
        });
        assert.equal(record.filePath, path.join(path.basename(dateDirectory), 'synthetic.pdf'));
        assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
        assert.equal(fs.readFileSync(filePath, 'utf8'), '%PDF generated storage-to-service fixture');
      } finally {
        prisma.purchaseContract.findUnique = originalFind;
        prisma.contractFile.create = originalCreate;
        config.upload.dir = originalRoot;
        require.cache[modulePath] = cachedModule;
        fs.rmSync(outer, { recursive: true, force: true });
      }
    });
  }
});
