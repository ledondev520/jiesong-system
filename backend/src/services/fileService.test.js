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
const prisma = require('../utils/prisma');
const fileService = require('./fileService');

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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-upload-permission-'));
  const filePath = path.join(tempDir, 'signed.pdf');
  fs.writeFileSync(filePath, '%PDF', { mode: 0o644 });

  try {
    await withMockDelegates({
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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-production-photo-'));
  const filePath = path.join(tempDir, 'not-photo.pdf');
  fs.writeFileSync(filePath, '%PDF');

  try {
    await assert.rejects(
      () => fileService.createFile('purchase-1', 'PURCHASE', {
        originalname: 'not-photo.pdf',
        path: filePath,
        mimetype: 'application/pdf',
        size: 4,
      }, null, 'PRODUCTION_PHOTO'),
      (error) => error.statusCode === 400 && /生产实物图仅支持 JPG、PNG/.test(error.message),
    );
    assert.equal(fs.existsSync(filePath), false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
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
