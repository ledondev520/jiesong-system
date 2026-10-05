/**
 * Input: fileService、Prisma mock delegates
 * Output: 合同附件服务单元测试
 * Pos: 后端服务层测试，覆盖统一附件列表 Interface
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const testUploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-file-service-root-'));
fs.chmodSync(testUploadRoot, 0o700);
const originalUploadDir = process.env.UPLOAD_DIR;
process.env.UPLOAD_DIR = testUploadRoot;
const prisma = require('../utils/prisma');
const fileService = require('./fileService');
const config = require('../config');
test.after(() => {
  fs.rmSync(testUploadRoot, { recursive: true, force: true });
  if (originalUploadDir === undefined) delete process.env.UPLOAD_DIR;
  else process.env.UPLOAD_DIR = originalUploadDir;
});

const withMockDelegates = async (mockDelegates, callback) => {
  const originals = {};
  for (const key of Object.keys(mockDelegates)) {
    originals[key] = prisma[key];
    prisma[key] = mockDelegates[key];
  }

  try {
    await callback();
  } finally {
    for (const key of Object.keys(mockDelegates)) {
      if (typeof originals[key] === 'undefined') {
        delete prisma[key];
      } else {
        prisma[key] = originals[key];
      }
    }
  }
};

test('listFiles: 默认读取采购合同附件并补充合同类型', async () => {
  let findManyArgs = null;

  await withMockDelegates({
    contractFile: {
      findMany: async (args) => {
        findManyArgs = args;
        return [{ id: 'file-1', purchaseContractId: 'purchase-1', fileName: '合同.pdf' }];
      },
    },
  }, async () => {
    const result = await fileService.listFiles('purchase-1', 'PURCHASE');

    assert.deepEqual(findManyArgs, {
      where: { purchaseContractId: 'purchase-1' },
      orderBy: { uploadedAt: 'desc' },
    });
    assert.equal(result[0].contractType, 'PURCHASE');
  });
});

test('createFile: 用户上传的合同凭证落盘后收紧为 0600 权限', async () => {
  const tempDir = fs.mkdtempSync(path.join(testUploadRoot, 'upload-permission-'));
  const filePath = path.join(tempDir, 'signed.pdf');
  fs.writeFileSync(filePath, '%PDF', { mode: 0o644 });

  try {
    await withMockDelegates({
      purchaseContract: { findUnique: async () => ({ id: 'purchase-1' }) },
      contractFile: { create: async ({ data }) => ({ id: 'f-secure', ...data }) },
    }, async () => {
      await fileService.createFile('purchase-1', 'PURCHASE', {
        originalname: '盖章合同.pdf',
        path: filePath,
        mimetype: 'application/pdf',
        size: 4,
      }, null, 'SIGNED_CONTRACT');
    });

    assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
    assert.equal(fs.statSync(tempDir).mode & 0o777, 0o700);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('createFile: 生产实物图分类只接受 JPG/PNG，错误文件不留在磁盘', async () => {
  const tempDir = fs.mkdtempSync(path.join(testUploadRoot, 'production-photo-'));
  const filePath = path.join(tempDir, 'not-photo.pdf');
  fs.writeFileSync(filePath, '%PDF');

  try {
    await withMockDelegates({ purchaseContract: { findUnique: async () => ({ id: 'purchase-1' }) } }, async () => {
      await assert.rejects(
        () => fileService.createFile('purchase-1', 'PURCHASE', {
          originalname: 'not-photo.pdf',
          path: filePath,
          mimetype: 'application/pdf',
          size: 4,
        }, null, 'PRODUCTION_PHOTO'),
        (error) => error.statusCode === 400 && /生产实物图仅支持 JPG、PNG/.test(error.message),
      );
    });
    assert.equal(fs.existsSync(filePath), false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('createFile: 验证/权限/持久化失败仅清理当前上传，保留既有凭证', async t => {
  for (const failure of ['invalid-type', 'missing-contract', 'category', 'chmod', 'database', 'deleted-contract']) {
    await t.test(failure, async () => {
      const directory = fs.mkdtempSync(path.join(testUploadRoot, 'upload-failure-'));
      const current = path.join(directory, 'current.pdf');
      const retained = path.join(directory, 'previous.pdf');
      fs.writeFileSync(current, '%PDF synthetic new upload');
      fs.writeFileSync(retained, '%PDF synthetic previous archive', { mode: 0o600 });
      const originalChmod = fs.chmodSync;
      let persisted = 0;
      try {
        if (failure === 'chmod') fs.chmodSync = () => { throw new Error('synthetic chmod failure'); };
        await withMockDelegates({
          purchaseContract: { findUnique: async () => failure === 'missing-contract' ? null : { id: 'purchase-1' } },
          contractFile: { create: async () => { persisted++; throw Object.assign(new Error('synthetic persistence failure'), failure === 'deleted-contract' ? { code: 'P2003' } : {}); } },
        }, async () => {
          await assert.rejects(() => fileService.createFile('purchase-1', failure === 'invalid-type' ? 'TYPO' : 'PURCHASE', {
            originalname: 'current.pdf', path: current, mimetype: 'application/pdf', size: 25,
          }, null, failure === 'category' ? 'PRODUCTION_PHOTO' : 'SIGNED_CONTRACT'), error => {
            if (['invalid-type', 'category'].includes(failure)) return error.statusCode === 400;
            if (['missing-contract', 'deleted-contract'].includes(failure)) return error.statusCode === 404;
            return error.message === `synthetic ${failure === 'chmod' ? 'chmod' : 'persistence'} failure`;
          });
        });
        assert.equal(persisted, ['database', 'deleted-contract'].includes(failure) ? 1 : 0);
        assert.equal(fs.existsSync(current), false);
        assert.equal(fs.readFileSync(retained, 'utf8'), '%PDF synthetic previous archive');
      } finally {
        fs.chmodSync = originalChmod;
        fs.rmSync(directory, { recursive: true, force: true });
      }
    });
  }
});

test('assertFileAccess: 财务确认附件权限共享，普通附件不增加业务所有者限制', () => {
  const protectedFile = { description: '退税出货清单确认:synthetic:version' };
  for (const role of ['SALES', 'PURCHASE', 'WAREHOUSE', 'BOSS']) {
    assert.throws(() => fileService.assertFileAccess(protectedFile, { role }), error => error.statusCode === 403);
  }
  for (const role of ['ADMIN', 'FINANCE']) assert.doesNotThrow(() => fileService.assertFileAccess(protectedFile, { role }));
  assert.doesNotThrow(() => fileService.assertFileAccess({ description: '普通合成附件' }, { role: 'SALES' }));
});

test('createFile: 清理失败不覆盖原始错误或泄露文件路径', async t => {
  const directory = fs.mkdtempSync(path.join(testUploadRoot, 'upload-cleanup-failure-'));
  const current = path.join(directory, 'synthetic-current.pdf');
  fs.writeFileSync(current, '%PDF synthetic');
  const originalUnlink = fs.unlinkSync;
  const messages = [];
  t.mock.method(console, 'error', message => messages.push(message));
  const originalFailure = new Error('synthetic persistence failure');
  try {
    fs.unlinkSync = () => { throw new Error(`synthetic unlink failure ${current}`); };
    await withMockDelegates({
      purchaseContract: { findUnique: async () => ({ id: 'purchase-1' }) },
      contractFile: { create: async () => { throw originalFailure; } },
    }, async () => {
      await assert.rejects(() => fileService.createFile('purchase-1', 'PURCHASE', {
        originalname: 'synthetic.pdf', path: current, mimetype: 'application/pdf', size: 14,
      }), error => error === originalFailure && error.uploadCleanupFailed === true);
    });
    assert.deepEqual(messages, ['[fileService] rejected upload cleanup failed']);
    assert.equal(fs.existsSync(current), true);
    assert.equal(fs.statSync(current).mode & 0o777, 0o600);
    assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  } finally {
    fs.unlinkSync = originalUnlink;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('createFile: 首次异步合同查询前已收紧新附件权限', async () => {
  const directory = fs.mkdtempSync(path.join(testUploadRoot, 'upload-lookup-permissions-'));
  fs.chmodSync(directory, 0o755);
  const current = path.join(directory, 'synthetic-current.pdf');
  fs.writeFileSync(current, '%PDF synthetic', { mode: 0o644 });
  try {
    await withMockDelegates({
      purchaseContract: { findUnique: async () => {
        assert.equal(fs.statSync(current).mode & 0o777, 0o600, 'new payload must be protected before the lookup begins');
        assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
        return { id: 'purchase-1' };
      } },
      contractFile: { create: async ({ data }) => ({ id: 'synthetic-file', ...data }) },
    }, async () => {
      const file = await fileService.createFile('purchase-1', 'PURCHASE', {
        originalname: 'synthetic.pdf', path: current, mimetype: 'application/pdf', size: 14,
      });
      assert.equal(file.id, 'synthetic-file');
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('createFile: 越界、路径穿越与子符号链接在chmod和失败清理前拒绝', async t => {
  for (const kind of ['outside', 'sibling-prefix', 'relative-traversal', 'absolute-traversal', 'file-symlink', 'parent-symlink', 'in-root-file-symlink', 'in-root-parent-symlink', 'hard-link', 'directory', 'root-itself', 'empty', 'non-string', 'nul']) {
    await t.test(kind, async sub => {
      const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-upload-boundary-'));
      fs.chmodSync(outer, 0o700);
      const uploadRoot = path.join(outer, 'uploads');
      const outside = kind.startsWith('in-root') ? path.join(uploadRoot, 'retained') : path.join(outer, kind === 'sibling-prefix' ? 'uploads-sibling' : 'outside');
      fs.mkdirSync(uploadRoot, { mode: 0o700 });
      fs.mkdirSync(outside, { mode: 0o700 });
      const sentinel = path.join(outside, 'sentinel.pdf');
      fs.writeFileSync(sentinel, '%PDF generated outside sentinel', { mode: 0o644 });
      let candidate = sentinel;
      if (kind === 'relative-traversal') candidate = path.relative(process.cwd(), sentinel);
      if (kind === 'absolute-traversal') candidate = `${uploadRoot}/../outside/sentinel.pdf`;
      if (['file-symlink', 'in-root-file-symlink'].includes(kind)) {
        candidate = path.join(uploadRoot, 'linked.pdf');
        fs.symlinkSync(sentinel, candidate);
      }
      if (['parent-symlink', 'in-root-parent-symlink'].includes(kind)) {
        fs.symlinkSync(outside, path.join(uploadRoot, 'linked'), 'dir');
        candidate = path.join(uploadRoot, 'linked', 'sentinel.pdf');
      }
      if (kind === 'hard-link') {
        candidate = path.join(uploadRoot, 'linked.pdf');
        fs.linkSync(sentinel, candidate);
      }
      if (kind === 'directory') {
        candidate = path.join(uploadRoot, 'directory');
        fs.mkdirSync(candidate, { mode: 0o700 });
      }
      if (kind === 'root-itself') candidate = uploadRoot;
      if (kind === 'empty') candidate = '';
      if (kind === 'non-string') candidate = null;
      if (kind === 'nul') candidate = `${uploadRoot}/synthetic\0.pdf`;
      const originalRoot = config.upload.dir;
      const chmodPaths = [];
      const chmod = fs.chmodSync;
      // Prevent the old root-itself implementation from mutating a shared parent directory.
      sub.mock.method(fs, 'chmodSync', target => { chmodPaths.push(target); });
      config.upload.dir = uploadRoot;
      try {
        await assert.rejects(() => fileService.createFile('synthetic-contract', 'TYPO', {
          path: candidate, originalname: 'synthetic.pdf', mimetype: 'application/pdf', size: 14,
        }), error => error.statusCode === 400);
        assert.deepEqual(chmodPaths, [], 'untrusted paths must be rejected before any permission mutation');
        assert.equal(fs.readFileSync(sentinel, 'utf8'), '%PDF generated outside sentinel');
        assert.equal(fs.statSync(sentinel).mode & 0o777, 0o644);
        if (['file-symlink', 'parent-symlink', 'in-root-file-symlink', 'in-root-parent-symlink'].includes(kind)) assert.equal(fs.lstatSync(kind.includes('file-symlink') ? candidate : path.dirname(candidate)).isSymbolicLink(), true);
      } finally {
        config.upload.dir = originalRoot;
        // The mock is scoped to this subtest; no production paths are ever used.
        fs.chmodSync = chmod;
        fs.rmSync(outer, { recursive: true, force: true });
      }
    });
  }
});

test('createFile: 可信根目录符号链接与包含上级路径的相对UPLOAD_DIR保持兼容', async t => {
  for (const kind of ['configured-root-symlink', 'trusted-relative-root', 'trusted-relative-root-trailing-separator']) {
    await t.test(kind, async () => {
      const isRelativeRoot = kind.startsWith('trusted-relative-root');
      const outer = fs.mkdtempSync(path.join(isRelativeRoot ? path.resolve(process.cwd(), '..') : os.tmpdir(), '.jiesong-trusted-upload-root-'));
      fs.chmodSync(outer, 0o700);
      const actualRoot = path.join(outer, 'actual');
      fs.mkdirSync(actualRoot, { mode: 0o700 });
      const configuredRoot = path.join(outer, 'configured');
      if (kind === 'configured-root-symlink') fs.symlinkSync(actualRoot, configuredRoot, 'dir');
      const uploadRoot = kind === 'configured-root-symlink' ? configuredRoot : path.relative(process.cwd(), actualRoot) + (kind.endsWith('trailing-separator') ? path.sep : '');
      if (isRelativeRoot) assert.ok(uploadRoot.startsWith(`..${path.sep}`));
      const actualDateDirectory = path.join(actualRoot, '20261005');
      fs.mkdirSync(actualDateDirectory, { mode: 0o700 });
      const current = path.join(uploadRoot, '20261005', 'synthetic.pdf');
      const failed = path.join(uploadRoot, '20261005', 'synthetic-failed.pdf');
      const retained = path.join(actualDateDirectory, 'retained.pdf');
      fs.writeFileSync(current, '%PDF generated current fixture', { mode: 0o600 });
      fs.writeFileSync(retained, '%PDF generated retained fixture', { mode: 0o600 });
      const originalRoot = config.upload.dir;
      config.upload.dir = uploadRoot;
      try {
        await withMockDelegates({
          purchaseContract: { findUnique: async () => ({ id: 'purchase-1' }) },
          contractFile: { create: async ({ data }) => ({ id: 'synthetic-file', ...data }) },
        }, async () => {
          const file = await fileService.createFile('purchase-1', 'PURCHASE', { path: current, originalname: 'synthetic.pdf', mimetype: 'application/pdf', size: 14 });
          assert.equal(file.filePath, path.join('20261005', 'synthetic.pdf'));
          assert.equal(fs.readFileSync(current, 'utf8'), '%PDF generated current fixture', 'successful persistence must not cleanup');
        });
        fs.writeFileSync(failed, '%PDF generated failed fixture', { mode: 0o600 });
        await assert.rejects(() => fileService.createFile('purchase-1', 'TYPO', { path: failed, originalname: 'synthetic-failed.pdf', mimetype: 'application/pdf', size: 14 }), error => error.statusCode === 400);
        assert.equal(fs.existsSync(failed), false, 'failed current payload still cleans under a trusted root');
        assert.equal(fs.readFileSync(current, 'utf8'), '%PDF generated current fixture', 'previous successful payload is retained');
        assert.equal(fs.readFileSync(retained, 'utf8'), '%PDF generated retained fixture');
      } finally {
        config.upload.dir = originalRoot;
        fs.rmSync(outer, { recursive: true, force: true });
      }
    });
  }
});

test('createFile: 异步查询后被替换的文件或父目录不能成为清理目标', async t => {
  for (const kind of ['file-replaced', 'parent-symlink']) {
    await t.test(kind, async sub => {
      const directory = fs.mkdtempSync(path.join(testUploadRoot, 'upload-identity-'));
      const current = path.join(directory, 'current.pdf');
      const retainedDirectory = `${directory}-retained`;
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-cleanup-outside-'));
      const outsideSentinel = path.join(outside, 'current.pdf');
      fs.writeFileSync(current, '%PDF original generated upload', { mode: 0o600 });
      fs.writeFileSync(outsideSentinel, '%PDF generated outside sentinel', { mode: 0o600 });
      sub.mock.method(console, 'error', () => {});
      try {
        await withMockDelegates({ purchaseContract: { findUnique: async () => {
          fs.renameSync(directory, retainedDirectory);
          if (kind === 'parent-symlink') fs.symlinkSync(outside, directory, 'dir');
          else {
            fs.mkdirSync(directory, { mode: 0o700 });
            fs.writeFileSync(current, '%PDF replacement sentinel', { mode: 0o600 });
          }
          return null;
        } } }, async () => {
          await assert.rejects(() => fileService.createFile('synthetic-contract', 'PURCHASE', {
            path: current, originalname: 'synthetic.pdf', mimetype: 'application/pdf', size: 14,
          }), error => error.statusCode === 404 && error.uploadCleanupFailed === true);
        });
        assert.equal(fs.readFileSync(path.join(retainedDirectory, 'current.pdf'), 'utf8'), '%PDF original generated upload');
        assert.equal(fs.readFileSync(outsideSentinel, 'utf8'), '%PDF generated outside sentinel');
        if (kind === 'file-replaced') assert.equal(fs.readFileSync(current, 'utf8'), '%PDF replacement sentinel');
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
        fs.rmSync(retainedDirectory, { recursive: true, force: true });
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });
  }
});

test('listFiles: 销售合同附件走 salesContractFile delegate', async () => {
  let findManyArgs = null;

  await withMockDelegates({
    salesContractFile: {
      findMany: async (args) => {
        findManyArgs = args;
        return [{ id: 'file-2', salesContractId: 'sales-1', fileName: '销售合同.pdf' }];
      },
    },
  }, async () => {
    const result = await fileService.listFiles('sales-1', 'SALES');

    assert.deepEqual(findManyArgs, {
      where: { salesContractId: 'sales-1' },
      orderBy: { uploadedAt: 'desc' },
    });
    assert.equal(result[0].contractType, 'SALES');
  });
});

test('archiveGeneratedFile: 系统生成合同以分类、校验和与受限文件权限归档', async () => {
  const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-generated-contract-'));
  let createData = null;
  const delegate = {
    findFirst: async () => null,
    create: async ({ data }) => { createData = data; return { id: 'file-generated', ...data }; },
  };

  try {
    const result = await fileService.archiveGeneratedFile({
      contractId: 'purchase-1',
      contractType: 'PURCHASE',
      buffer: Buffer.from('%PDF-demo'),
      fileName: '购销合同CG2600001.pdf',
      mimeType: 'application/pdf',
      category: 'SYSTEM_GENERATED_PDF',
      uploadRoot,
      prismaClient: { contractFile: delegate },
    });

    assert.equal(createData.purchaseContractId, 'purchase-1');
    assert.equal(createData.category, 'SYSTEM_GENERATED_PDF');
    assert.match(createData.checksum, /^[a-f0-9]{64}$/);
    assert.equal(result.id, 'file-generated');
    const stat = fs.statSync(path.join(uploadRoot, createData.filePath));
    assert.equal(stat.mode & 0o777, 0o600);
  } finally {
    fs.rmSync(uploadRoot, { recursive: true, force: true });
  }
});

test('archiveGeneratedFile: 相同内容已归档时复用记录而不制造重复版本', async () => {
  let createCalls = 0;
  const existing = { id: 'existing-file', checksum: 'same' };
  const result = await fileService.archiveGeneratedFile({
    contractId: 'purchase-1',
    contractType: 'PURCHASE',
    buffer: Buffer.from('same content'),
    fileName: 'contract.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    category: 'SYSTEM_GENERATED_WORD',
    uploadRoot: os.tmpdir(),
    prismaClient: {
      contractFile: {
        findFirst: async () => existing,
        create: async () => { createCalls += 1; },
      },
    },
  });

  assert.equal(result, existing);
  assert.equal(createCalls, 0);
});

test('archiveBufferFile: 船司 PDF 按内容去重归档到独立受限目录', async () => {
  const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-carrier-document-'));
  let createData = null;
  try {
    const result = await fileService.archiveBufferFile({
      contractId: 'sales-1',
      contractType: 'SALES',
      buffer: Buffer.from('%PDF-carrier'),
      fileName: 'carrier.pdf',
      mimeType: 'application/pdf',
      category: 'CARRIER_DOCUMENT',
      storageScope: 'carrier-documents',
      uploadRoot,
      prismaClient: {
        salesContractFile: {
          findFirst: async () => null,
          create: async ({ data }) => {
            createData = data;
            return { id: 'carrier-file', ...data };
          },
        },
      },
    });

    assert.equal(result.id, 'carrier-file');
    assert.match(createData.filePath, /^carrier-documents[/\\]/);
    assert.equal(fs.statSync(path.join(uploadRoot, createData.filePath)).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(uploadRoot, { recursive: true, force: true });
  }
});

test('deleteFileRecord: 已关联核对历史的船司原件禁止删除', async () => {
  let deleteCalls = 0;
  await withMockDelegates({
    contractFile: { findUnique: async () => null },
    salesContractFile: {
      findUnique: async () => ({ id: 'file-1', filePath: 'carrier.pdf' }),
      delete: async () => { deleteCalls += 1; },
    },
    packingListCheck: { count: async () => 1 },
  }, async () => {
    await assert.rejects(
      () => fileService.deleteFileRecord('file-1'),
      (error) => error.statusCode === 409 && /不能删除/.test(error.message),
    );
  });
  assert.equal(deleteCalls, 0);
});
