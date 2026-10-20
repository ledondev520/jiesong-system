const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const batchImportService = require('./batchImportService');

test('batchImportSalesContracts: 使用现有 schema 创建销售合同与明细', async () => {
  const originals = {
    productFindFirst: prisma.product.findFirst,
    storeFindFirst: prisma.store.findFirst,
    salesContractCount: prisma.salesContract.count,
    salesContractCreate: prisma.salesContract.create,
    salesItemCreate: prisma.salesItem.create,
  };
  const captured = { contract: null, item: null };

  prisma.product.findFirst = async () => ({ id: 'prod-1' });
  prisma.store.findFirst = async () => ({ id: 'store-1' });
  prisma.salesContract.count = async () => 7;
  prisma.salesContract.create = async (args) => {
    captured.contract = args;
    return { id: 'sc-1', ...args.data };
  };
  prisma.salesItem.create = async (args) => {
    captured.item = args;
    return { id: 'si-1', ...args.data };
  };

  try {
    const result = await batchImportService.batchImportSalesContracts([{
      _rowNum: 2,
      productName: '瓷砖',
      storeName: '圣荷西2115',
      quantity: '10',
      costPrice: '100',
      sellingPrice: '150',
      exchangeRate: '7.2',
    }], 'user-1');

    assert.equal(result.success, 1);
    assert.equal(result.failed, 0);
    assert.match(captured.contract.data.contractNo, /^EXP\d{2}\d{5}$/);
    assert.equal(captured.item.data.salesContractId, 'sc-1');
    assert.equal(captured.item.data.productId, 'prod-1');
    assert.equal(captured.item.data.storeId, 'store-1');
  } finally {
    prisma.product.findFirst = originals.productFindFirst;
    prisma.store.findFirst = originals.storeFindFirst;
    prisma.salesContract.count = originals.salesContractCount;
    prisma.salesContract.create = originals.salesContractCreate;
    prisma.salesItem.create = originals.salesItemCreate;
  }
});

const purchaseRow = {
  _rowNum: 3,
  supplierName: '合成供应商',
  productName: '合成商品',
  quantity: '6',
  price: '80',
  deliveryDate: '2026-04-10',
};

const mockPurchaseImport = (t) => {
  // Prisma delegates are proxies, so restore assigned methods explicitly.
  const mockMethod = (object, key, implementation) => {
    const original = object[key];
    object[key] = implementation;
    t.after(() => { object[key] = original; });
  };
  const calls = { transactions: 0, numbers: 0, contracts: [], items: [] };
  const prefix = `CG${new Date().getFullYear().toString().slice(-2)}`;
  const tx = {
    purchaseContract: {
      findMany: async () => {
        calls.numbers++;
        return [{ contractNo: `${prefix}${String(11 + calls.numbers).padStart(5, '0')}` }];
      },
      create: async ({ data }) => {
        calls.contracts.push(data);
        return { id: `synthetic-purchase-${calls.contracts.length}`, ...data };
      },
    },
    purchaseItem: {
      create: async ({ data }) => {
        calls.items.push(data);
        return { id: 'synthetic-item', ...data };
      },
    },
  };
  mockMethod(prisma.supplier, 'findFirst', async () => ({ id: 'synthetic-supplier' }));
  mockMethod(prisma.product, 'findFirst', async () => ({ id: 'synthetic-product' }));
  const outsideTransaction = async () => { throw new Error('采购编号/写入必须使用同一事务客户端'); };
  mockMethod(prisma.purchaseContract, 'findMany', outsideTransaction);
  mockMethod(prisma.purchaseContract, 'create', outsideTransaction);
  mockMethod(prisma.purchaseItem, 'create', outsideTransaction);
  mockMethod(prisma, '$transaction', async (handler) => {
    calls.transactions++;
    return handler(tx);
  });
  return { calls, tx, prefix };
};

const conflict = (code = 'P2002', target = ['contractNo']) => Object.assign(
  new Error('synthetic database failure'), { code, meta: { target } },
);

test('batchImportPurchaseContracts: 编号、合同与明细使用同一事务客户端', async t => {
  const { calls, prefix } = mockPurchaseImport(t);
  const result = await batchImportService.batchImportPurchaseContracts([purchaseRow], 'synthetic-user');
  assert.deepEqual(result, { success: 1, failed: 0, errors: [] });
  assert.equal(calls.transactions, 1);
  assert.equal(calls.numbers, 1);
  assert.equal(calls.contracts[0].contractNo, `${prefix}00013`);
  assert.equal(calls.contracts[0].status, 'DRAFT');
  assert.equal(calls.contracts[0].totalAmount, 480);
  assert.equal(calls.items[0].purchaseContractId, 'synthetic-purchase-1');
  assert.equal(calls.items[0].unitPrice, 80);
  assert.equal(calls.items[0].totalPrice, 480);
});

test('batchImportPurchaseContracts: 自动编号唯一竞争重新分配后只统计一次成功', async t => {
  const { calls, tx, prefix } = mockPurchaseImport(t);
  const create = tx.purchaseContract.create;
  tx.purchaseContract.create = async args => {
    if (calls.transactions === 1) throw conflict();
    return create(args);
  };
  const result = await batchImportService.batchImportPurchaseContracts([purchaseRow], 'synthetic-user');
  assert.deepEqual(result, { success: 1, failed: 0, errors: [] });
  assert.equal(calls.transactions, 2);
  assert.equal(calls.numbers, 2);
  assert.equal(calls.contracts[0].contractNo, `${prefix}00014`);
  assert.equal(calls.items.length, 1);
});

test('batchImportPurchaseContracts: 明细阶段写冲突整行重试，保留显式编号', async t => {
  const { calls, tx } = mockPurchaseImport(t);
  const create = tx.purchaseItem.create;
  tx.purchaseItem.create = async args => {
    if (calls.transactions === 1) throw conflict('P2034');
    return create(args);
  };
  const result = await batchImportService.batchImportPurchaseContracts([{ ...purchaseRow, contractNo: 'SYNTHETIC-EXPLICIT' }], 'synthetic-user');
  assert.deepEqual(result, { success: 1, failed: 0, errors: [] });
  assert.equal(calls.transactions, 2);
  assert.equal(calls.numbers, 0);
  assert.deepEqual(calls.contracts.map(row => row.contractNo), ['SYNTHETIC-EXPLICIT', 'SYNTHETIC-EXPLICIT']);
  assert.equal(calls.items[0].purchaseContractId, 'synthetic-purchase-2');
});

test('batchImportPurchaseContracts: 显式编号重复、其他唯一冲突和未知错误不重试', async t => {
  const { calls, tx } = mockPurchaseImport(t);
  const rows = [
    { ...purchaseRow, contractNo: 'SYNTHETIC-EXPLICIT' },
    { ...purchaseRow, _rowNum: 4 },
    { ...purchaseRow, _rowNum: 5 },
    { ...purchaseRow, _rowNum: 6 },
  ];
  const failures = [conflict(), conflict('P2002', ['id']), conflict('P2028')];
  const create = tx.purchaseContract.create;
  tx.purchaseContract.create = async args => {
    const failure = failures[calls.transactions - 1];
    if (failure) throw failure;
    return create(args);
  };
  const result = await batchImportService.batchImportPurchaseContracts(rows, 'synthetic-user');
  assert.equal(result.success, 1);
  assert.equal(result.failed, 3);
  assert.deepEqual(result.errors.map(error => error.row), [3, 4, 5]);
  assert.equal(calls.transactions, 4);
  assert.equal(calls.items.length, 1);
});

test('batchImportPurchaseContracts: 连续竞争最多五次，失败后继续下一行', async t => {
  const { calls, tx } = mockPurchaseImport(t);
  const create = tx.purchaseContract.create;
  tx.purchaseContract.create = async args => {
    if (calls.transactions <= 5) throw conflict();
    return create(args);
  };
  const result = await batchImportService.batchImportPurchaseContracts([purchaseRow, { ...purchaseRow, _rowNum: 4 }], 'synthetic-user');
  assert.deepEqual(result, { success: 1, failed: 1, errors: [{ row: 3, message: '采购编号正在分配，请稍后重试' }] });
  assert.equal(calls.transactions, 6);
  assert.equal(calls.numbers, 6);
  assert.equal(calls.items.length, 1);
});
