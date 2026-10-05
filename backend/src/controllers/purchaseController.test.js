/**
 * Input: purchaseController 模块
 * Output: 采购状态门禁与附件存储、下载回归测试
 * Pos: 采购控制器测试，附件仅使用受限临时目录与模拟数据库记录
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-purchase-files-test-'));
const originalUploadDir = process.env.UPLOAD_DIR;
process.env.UPLOAD_DIR = uploadRoot;
const prisma = require('../utils/prisma');
const purchaseController = require('./purchaseController');

test.after(() => {
  fs.rmSync(uploadRoot, { recursive: true, force: true });
  if (originalUploadDir === undefined) delete process.env.UPLOAD_DIR;
  else process.env.UPLOAD_DIR = originalUploadDir;
});

test('purchaseController: 模块可正常加载并导出', () => {
  assert.ok(purchaseController !== undefined);
});

test('getById: 返回与状态门禁共用的生产资料完整性', async () => {
  const originalFindUnique = prisma.purchaseContract.findUnique;
  prisma.purchaseContract.findUnique = async () => ({
    id: 'pc-1',
    items: [{
      id: 'pi-1',
      specification: '',
      boxes: null,
      grossWeight: null,
      netWeight: null,
      volume: null,
    }],
  });
  let payload = null;
  const res = {
    status: () => res,
    json: (value) => { payload = value; },
  };

  try {
    await purchaseController.getById({ params: { id: 'pc-1' } }, res, (error) => { throw error; });
    assert.equal(payload.data.productionReadiness.ready, false);
    assert.equal(payload.data.productionReadiness.incompleteItemCount, 1);
  } finally {
    prisma.purchaseContract.findUnique = originalFindUnique;
  }
});

test('updateStatus: 生产资料缺失时后端拒绝从生产中推进到完成', async () => {
  const originalTransaction = prisma.$transaction;
  let updateCalled = false;
  prisma.$transaction = async (callback) => callback({
    purchaseContract: {
      findUnique: async () => ({
        id: 'pc-1',
        status: 'PRODUCING',
        items: [{
          id: 'pi-1',
          specification: '',
          boxes: null,
          grossWeight: null,
          netWeight: null,
          volume: null,
          length: null,
          width: null,
          height: null,
        }],
      }),
      update: async () => {
        updateCalled = true;
        return { id: 'pc-1' };
      },
    },
  });
  let caught = null;

  try {
    await purchaseController.updateStatus(
      { params: { id: 'pc-1' }, body: { status: 'READY' }, user: { id: 'u-1' } },
      {},
      (error) => { caught = error; },
    );
    assert.equal(caught.statusCode, 400);
    assert.match(caught.message, /生产资料未完整/);
    assert.equal(updateCalled, false);
  } finally {
    prisma.$transaction = originalTransaction;
  }
});

test('uploadFile: 登记附件前收紧目录和文件权限，保持 201 响应', async t => {
  const originalFind = prisma.purchaseContract.findUnique;
  prisma.purchaseContract.findUnique = async () => ({ id: 'purchase-1' });
  t.after(() => { prisma.purchaseContract.findUnique = originalFind; });
  const directory = path.join(uploadRoot, 'permission-success');
  fs.mkdirSync(directory, { mode: 0o755 });
  const filePath = path.join(directory, 'synthetic.pdf');
  fs.writeFileSync(filePath, '%PDF-1.4\nsynthetic attachment\n%%EOF', { mode: 0o644 });
  const originalCreate = prisma.contractFile.create;
  let recorded = null;
  prisma.contractFile.create = async ({ data }) => {
    assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
    assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
    recorded = data;
    return { id: 'attachment-1', ...data };
  };
  const res = { status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; } };
  try {
    await purchaseController.uploadFile({
      params: { id: 'purchase-1' },
      body: { description: 'synthetic test attachment', category: 'SUPPLIER_INVOICE' },
      file: { path: filePath, originalname: 'synthetic.pdf', mimetype: 'application/pdf', size: fs.statSync(filePath).size },
    }, res, (error) => { throw error; });
    assert.equal(res.statusCode, 201);
    assert.equal(res.payload.message, '文件上传成功');
    assert.equal(recorded.purchaseContractId, 'purchase-1');
    assert.equal(recorded.filePath, path.join('permission-success', 'synthetic.pdf'));
    assert.equal(recorded.description, 'synthetic test attachment');
    assert.equal(recorded.category, 'SUPPLIER_INVOICE');
  } finally {
    prisma.contractFile.create = originalCreate;
  }
});

test('uploadFile: 权限收紧失败时不建立数据库附件记录', async (t) => {
  const originalFind = prisma.purchaseContract.findUnique;
  prisma.purchaseContract.findUnique = async () => ({ id: 'purchase-1' });
  t.after(() => { prisma.purchaseContract.findUnique = originalFind; });
  const permissionError = new Error('synthetic chmod failure');
  t.mock.method(fs, 'chmodSync', () => { throw permissionError; });
  let createCalled = false;
  const originalCreate = prisma.contractFile.create;
  prisma.contractFile.create = async () => { createCalled = true; return {}; };
  t.after(() => { prisma.contractFile.create = originalCreate; });
  let caught = null;
  await purchaseController.uploadFile({
    params: { id: 'purchase-1' }, body: {},
    file: { path: path.join(uploadRoot, 'synthetic.pdf'), originalname: 'synthetic.pdf', mimetype: 'application/pdf', size: 1 },
  }, { status() { return this; }, json() {} }, (error) => { caught = error; });
  assert.equal(caught, permissionError);
  assert.equal(createCalled, false);
});

test('downloadFile: 相对附件路径从 UPLOAD_DIR 解析，兼容已有绝对路径', async (t) => {
  const directory = path.join(uploadRoot, 'download');
  fs.mkdirSync(directory, { mode: 0o700 });
  const absolutePath = path.join(directory, 'synthetic.pdf');
  const contents = '%PDF-1.4\nsynthetic download\n%%EOF';
  fs.writeFileSync(absolutePath, contents, { mode: 0o600 });
  let storedPath = path.join('download', 'synthetic.pdf');
  const originalFindUnique = prisma.contractFile.findUnique;
  prisma.contractFile.findUnique = async () => ({ id: 'attachment-1', filePath: storedPath, fileName: 'synthetic.pdf' });
  t.after(() => { prisma.contractFile.findUnique = originalFindUnique; });
  const downloaded = [];
  const res = { download(filePath, fileName, callback) { downloaded.push({ filePath, fileName }); callback(null); } };
  for (const filePath of [storedPath, absolutePath]) {
    storedPath = filePath;
    await purchaseController.downloadFile({ params: { fileId: 'attachment-1' } }, res, (error) => { throw error; });
  }
  assert.equal(downloaded.length, 2);
  for (const file of downloaded) {
    assert.equal(file.filePath, absolutePath);
    assert.equal(file.fileName, 'synthetic.pdf');
    assert.equal(fs.readFileSync(file.filePath, 'utf8'), contents);
  }
});

test('updateStatus: 已收货正向完成保留库存', async (t) => {
  t.mock.method(prisma, '$transaction', async (callback) => callback({
    purchaseContract: {
      findUnique: async () => ({ id: 'pc-1', status: 'RECEIVED', totalAmount: 100, paidAmount: 100, items: [{ id: 'pi-1' }] }),
      update: async ({ data }) => ({ id: 'pc-1', ...data }),
    },
    inventory: { deleteMany: async () => { assert.fail('正向完成不可删除库存'); } },
  }));
  const res = { status() { return this; }, json(value) { this.payload = value; } };
  await purchaseController.updateStatus({ params: { id: 'pc-1' }, body: { status: 'COMPLETED' } }, res, (error) => { throw error; });
  assert.equal(res.payload.data.status, 'COMPLETED');
});

test('list: 服务端分页、商品全部明细搜索与店铺筛选共用条件', async (t) => {
  let query;
  const oldFind = prisma.purchaseContract.findMany; const oldCount = prisma.purchaseContract.count;
  t.after(() => { prisma.purchaseContract.findMany = oldFind; prisma.purchaseContract.count = oldCount; });
  prisma.purchaseContract.findMany = async (args) => { if (args.skip !== undefined) query = args; return []; };
  const oldGroup = prisma.purchaseContract.groupBy; t.after(() => { prisma.purchaseContract.groupBy = oldGroup; });
  prisma.purchaseContract.groupBy = async () => [];
  prisma.purchaseContract.count = async ({ where }) => { assert.deepEqual(where, query.where); return 223; };
  const res = { status() { return this; }, json(value) { this.payload = value; } };
  await purchaseController.list({ query: { page: '6', pageSize: '20', productKeyword: '第二商品', storeName: '合成店铺' } }, res, (error) => { throw error; });
  assert.equal(query.skip, 100);
  assert.equal(query.take, 20);
  assert.deepEqual(query.where.items, { some: { product: { customsName: { contains: '第二商品' } } } });
  assert.deepEqual(query.where.storeName, { contains: '合成店铺' });
  assert.equal(res.payload.data.pagination.total, 223);
});

test('getProductPriceHistory: 比价采用不含税单价', async (t) => {
  const oldFind = prisma.purchaseItem.findMany; t.after(() => { prisma.purchaseItem.findMany = oldFind; });
  prisma.purchaseItem.findMany = async () => [{ quantity: 10, unitPrice: 100, totalPrice: 1130, purchaseContract: { contractNo: 'synthetic', createdAt: new Date(0) } }];
  const res = { status() { return this; }, json(value) { this.payload = value; } };
  await purchaseController.getProductPriceHistory({ params: { productId: 'product-1' } }, res, (error) => { throw error; });
  assert.equal(res.payload.data.averagePrice, 100);
  assert.equal(res.payload.data.history[0].price, 100);
});

test('updateStatus: 仅未履行合同允许取消，已付款或已发货不得借取消回滚', async (t) => {
  const oldTransaction = prisma.$transaction; t.after(() => { prisma.$transaction = oldTransaction; });
  for (const existing of [
    { status: 'DRAFT', paidAmount: 0, _count: { payments: 0 }, items: [] },
    { status: 'SIGNED', paidAmount: 1, _count: { payments: 1 }, items: [] },
    { status: 'SHIPPED', paidAmount: 0, _count: { payments: 0 }, items: [] },
    { status: 'RECEIVED', paidAmount: 0, _count: { payments: 0 }, items: [] },
    { status: 'DRAFT', paidAmount: 0, _count: { payments: 0 }, items: [{ _count: { inventories: 1, packingItems: 0 } }] },
    { status: 'DRAFT', paidAmount: 0, _count: { payments: 0, receipts: 1 }, items: [] },
  ]) {
    let updated = false;
    prisma.$transaction = async (run) => run({ purchaseContract: { findUnique: async () => existing, update: async () => { updated = true; return { status: 'CANCELLED' }; } } });
    let caught;
    const res = { status() { return this; }, json() {} };
    await purchaseController.updateStatus({ params: { id: 'p-1' }, body: { status: 'CANCELLED' } }, res, (error) => { caught = error; });
    if (existing.status === 'DRAFT' && existing.items.length === 0 && !existing._count.receipts) { assert.equal(caught, undefined); assert.equal(updated, true); }
    else { assert.equal(caught?.statusCode, 400); assert.equal(updated, false); }
  }
});

test('updateStatus: 直接已发货→已收货不能绕过批次验货入库', async (t) => {
  let stockCreated = false;
  t.mock.method(prisma, '$transaction', async (run) => run({
    purchaseContract: {
      findUnique: async () => ({ id: 'pc-1', status: 'SHIPPED', _count: { receipts: 0 }, items: [{ id: 'pi-1', productId: 'product-1', quantity: 10 }] }),
      update: async () => ({ status: 'RECEIVED' }),
    },
    purchaseReceiptItem: { groupBy: async () => [] },
    inventory: { findMany: async () => [], createMany: async () => { stockCreated = true; return {}; } },
    purchaseItem: { aggregate: async () => ({ _sum: { totalPrice: 0 } }) },
  }));
  let caught;
  const res = { status() { return this; }, json() {} };
  await purchaseController.updateStatus({ params: { id: 'pc-1' }, body: { status: 'RECEIVED' } }, res, (error) => { caught = error; });
  assert.equal(caught?.statusCode, 400);
  assert.equal(stockCreated, false);
});

test('addItem: 与共享草稿更正一致，已签约/发货/完成/付款/归档不能加行', async (t) => {
  const oldTransaction = prisma.$transaction;
  t.after(() => { prisma.$transaction = oldTransaction; });
  const draft = { status: 'DRAFT', taxRate: 13, paidAmount: 0, _count: { receipts: 0, payments: 0, files: 0 }, items: [] };
  for (const contract of [draft, { ...draft, status: 'SIGNED' }, { ...draft, status: 'SHIPPED' }, { ...draft, status: 'COMPLETED' }, { ...draft, paidAmount: 1 }, { ...draft, _count: { ...draft._count, files: 1 } }]) {
    let added = false;
    prisma.$transaction = async (run) => run({ purchaseContract: { findUnique: async () => contract, update: async () => ({}) }, purchaseItem: { create: async ({ data }) => { added = true; return data; }, aggregate: async () => ({ _sum: { totalPrice: 11.3 } }) } });
    let caught;
    const res = { status() { return this; }, json() {} };
    await purchaseController.addItem({ params: { id: 'pc-1' }, body: { productId: 'product-1', quantity: 1, unitPrice: 10 } }, res, (error) => { caught = error; });
    if (contract === draft) { assert.equal(caught, undefined); assert.equal(added, true); }
    else { assert.equal(caught?.statusCode, 400); assert.equal(added, false); }
  }
});
