/**
 * Input: contractDocController 模块
 * Output: 模块导出冒烟测试
 * Pos: 自动补齐基础测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');

test('contractDocController: 模块可正常加载并导出', () => {
  const mod = require('./contractDocController');
  assert.ok(mod !== undefined);
});

test('getContractPdf: 返回真正 PDF MIME 和 .pdf 文件名', async () => {
  const prisma = require('../utils/prisma');
  const service = require('../services/contractDocService');
  const controller = require('./contractDocController');
  const originalFind = prisma.purchaseContract.findUnique;
  const originalGenerate = service.generatePurchaseContractPdf;
  const originalFilename = service.generatePdfFilename;
  let nextError = null;
  const headers = {};
  let sent = null;

  try {
    prisma.purchaseContract.findUnique = async () => ({
      id: 'pc-1', contractNo: 'CG2600001', supplier: {}, items: [],
    });
    service.generatePurchaseContractPdf = async () => Buffer.from('%PDF-1.7 demo');
    service.generatePdfFilename = () => '购销合同CG2600001.pdf';

    await controller.getContractPdf(
      { params: { id: 'pc-1' } },
      {
        setHeader: (name, value) => { headers[name] = value; },
        send: (value) => { sent = value; },
      },
      (error) => { nextError = error; },
    );

    assert.equal(nextError, null);
    assert.equal(headers['Content-Type'], 'application/pdf');
    assert.match(headers['Content-Disposition'], /\.pdf/);
    assert.equal(sent.subarray(0, 5).toString('ascii'), '%PDF-');
  } finally {
    prisma.purchaseContract.findUnique = originalFind;
    service.generatePurchaseContractPdf = originalGenerate;
    service.generatePdfFilename = originalFilename;
  }
});

test('generateFromPurchase: PDF 生成后以系统版本归档再返回下载', async () => {
  const prisma = require('../utils/prisma');
  const service = require('../services/contractDocService');
  const fileService = require('../services/fileService');
  const controller = require('./contractDocController');
  const originalFind = prisma.purchaseContract.findUnique;
  const originalGenerate = service.generatePurchaseContractPdf;
  const originalFilename = service.generatePdfFilename;
  const originalArchive = fileService.archiveGeneratedFile;
  let archived = null;
  const headers = {};
  let sent = null;

  try {
    prisma.purchaseContract.findUnique = async () => ({
      id: 'pc-1', contractNo: 'CG2600001', supplier: {}, items: [],
    });
    service.generatePurchaseContractPdf = async () => Buffer.from('%PDF-1.7 archived');
    service.generatePdfFilename = () => '购销合同CG2600001.pdf';
    fileService.archiveGeneratedFile = async (input) => { archived = input; return { id: 'file-1' }; };

    await controller.generateFromPurchase(
      { params: { id: 'pc-1' }, body: { format: 'pdf' } },
      {
        setHeader: (name, value) => { headers[name] = value; },
        send: (value) => { sent = value; },
      },
      (error) => { throw error; },
    );

    assert.equal(headers['Content-Type'], 'application/pdf');
    assert.equal(archived.category, 'SYSTEM_GENERATED_PDF');
    assert.equal(archived.contractId, 'pc-1');
    assert.equal(sent.subarray(0, 5).toString('ascii'), '%PDF-');
  } finally {
    prisma.purchaseContract.findUnique = originalFind;
    service.generatePurchaseContractPdf = originalGenerate;
    service.generatePdfFilename = originalFilename;
    fileService.archiveGeneratedFile = originalArchive;
  }
});
