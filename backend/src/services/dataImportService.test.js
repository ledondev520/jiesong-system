/**
 * Input: dataImportService 模块
 * Output: 对比/导入核心逻辑回归测试
 * Pos: 关键链路行为校验
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const dataImportService = require('./dataImportService');

const withPrismaMocks = async (mocks, fn) => {
  const original = {
    transaction: prisma.$transaction,
    findMany: prisma.packingItem.findMany,
    portFindMany: prisma.port.findMany,
    supplierFindMany: prisma.supplier.findMany,
    productFindMany: prisma.product.findMany,
    storeFindMany: prisma.store.findMany,
    salesContractFindMany: prisma.salesContract.findMany,
    purchaseContractFindMany: prisma.purchaseContract.findMany,
    portFindUnique: prisma.port.findUnique,
    supplierFindFirst: prisma.supplier.findFirst,
    productFindFirst: prisma.product.findFirst,
    storeFindFirst: prisma.store.findFirst,
    salesContractFindUnique: prisma.salesContract.findUnique,
    purchaseContractFindUnique: prisma.purchaseContract.findUnique,
    salesItemFindFirst: prisma.salesItem.findFirst,
    packingItemFindFirst: prisma.packingItem.findFirst,
    portCreate: prisma.port.create,
    supplierCreate: prisma.supplier.create,
    productCreate: prisma.product.create,
    storeCreate: prisma.store.create,
    salesContractCreate: prisma.salesContract.create,
    purchaseContractCreate: prisma.purchaseContract.create,
    salesItemCreate: prisma.salesItem.create,
    packingItemCreate: prisma.packingItem.create,
    salesContractUpdate: prisma.salesContract.update,
    inventoryCreate: prisma.inventory.create,
    importRecordCreate: prisma.importRecord.create,
  };

  prisma.$transaction = mocks.transaction ?? original.transaction;
  prisma.packingItem.findMany = mocks.findMany;
  prisma.port.findMany = mocks.portFindMany;
  prisma.supplier.findMany = mocks.supplierFindMany;
  prisma.product.findMany = mocks.productFindMany;
  prisma.store.findMany = mocks.storeFindMany;
  prisma.salesContract.findMany = mocks.salesContractFindMany;
  prisma.purchaseContract.findMany = mocks.purchaseContractFindMany;
  prisma.port.findUnique = mocks.portFindUnique;
  prisma.supplier.findFirst = mocks.supplierFindFirst;
  prisma.product.findFirst = mocks.productFindFirst;
  prisma.store.findFirst = mocks.storeFindFirst;
  prisma.salesContract.findUnique = mocks.salesContractFindUnique;
  prisma.purchaseContract.findUnique = mocks.purchaseContractFindUnique;
  prisma.salesItem.findFirst = mocks.salesItemFindFirst;
  prisma.packingItem.findFirst = mocks.packingItemFindFirst;
  prisma.port.create = mocks.portCreate;
  prisma.supplier.create = mocks.supplierCreate;
  prisma.product.create = mocks.productCreate;
  prisma.store.create = mocks.storeCreate;
  prisma.salesContract.create = mocks.salesContractCreate;
  prisma.purchaseContract.create = mocks.purchaseContractCreate;
  prisma.salesItem.create = mocks.salesItemCreate;
  prisma.packingItem.create = mocks.packingItemCreate;
  prisma.salesContract.update = mocks.salesContractUpdate;
  prisma.inventory.create = mocks.inventoryCreate;
  prisma.importRecord.create = mocks.importRecordCreate;

  try {
    await fn();
  } finally {
    prisma.$transaction = original.transaction;
    prisma.packingItem.findMany = original.findMany;
    prisma.port.findMany = original.portFindMany;
    prisma.supplier.findMany = original.supplierFindMany;
    prisma.product.findMany = original.productFindMany;
    prisma.store.findMany = original.storeFindMany;
    prisma.salesContract.findMany = original.salesContractFindMany;
    prisma.purchaseContract.findMany = original.purchaseContractFindMany;
    prisma.port.findUnique = original.portFindUnique;
    prisma.supplier.findFirst = original.supplierFindFirst;
    prisma.product.findFirst = original.productFindFirst;
    prisma.store.findFirst = original.storeFindFirst;
    prisma.salesContract.findUnique = original.salesContractFindUnique;
    prisma.purchaseContract.findUnique = original.purchaseContractFindUnique;
    prisma.salesItem.findFirst = original.salesItemFindFirst;
    prisma.packingItem.findFirst = original.packingItemFindFirst;
    prisma.port.create = original.portCreate;
    prisma.supplier.create = original.supplierCreate;
    prisma.product.create = original.productCreate;
    prisma.store.create = original.storeCreate;
    prisma.salesContract.create = original.salesContractCreate;
    prisma.purchaseContract.create = original.purchaseContractCreate;
    prisma.salesItem.create = original.salesItemCreate;
    prisma.packingItem.create = original.packingItemCreate;
    prisma.salesContract.update = original.salesContractUpdate;
    prisma.inventory.create = original.inventoryCreate;
    prisma.importRecord.create = original.importRecordCreate;
  }
};

test('compareWithDatabase: 正确区分重复与新增记录', async () => {
  const calls = { findMany: 0 };
  const rows = [
    { '序号': '1', '报关名': '花瓶', '柜子编号': '25-001-LA', '报关数量': '10', '港口': '洛杉矶' },
    { '序号': '2', '报关名': '碗', '柜子编号': '25-202-LA', '报关数量': '6', '港口': '洛杉矶' },
    { '序号': '3', '报关名': '盘子', '柜子编号': '30-333-LA', '报关数量': '1', '港口': '洛杉矶' },
    { '序号': '4', '报关名': '托盘' },
  ];

  await withPrismaMocks({
    transaction: async () => null,
    findMany: async () => {
      calls.findMany += 1;
      return [
        { product: { customsName: '花瓶' }, salesContract: { contractNo: '25-001-LA' }, quantity: 10 },
        { product: { customsName: '碗' }, salesContract: { contractNo: 'CN25-202-LA' }, quantity: 6 },
      ];
    },
    portFindMany: async () => [],
    supplierFindMany: async () => [],
    productFindMany: async () => [],
    storeFindMany: async () => [],
    salesContractFindMany: async () => [],
    purchaseContractFindMany: async () => [],
    portFindUnique: async () => null,
    supplierFindFirst: async () => null,
    productFindFirst: async () => null,
    storeFindFirst: async () => null,
    salesContractFindUnique: async () => null,
    purchaseContractFindUnique: async () => null,
    salesItemFindFirst: async () => null,
    packingItemFindFirst: async () => null,
    portCreate: async () => null,
    supplierCreate: async () => null,
    productCreate: async () => null,
    storeCreate: async () => null,
    salesContractCreate: async () => null,
    purchaseContractCreate: async () => null,
    salesItemCreate: async () => null,
    packingItemCreate: async () => null,
    salesContractUpdate: async () => null,
    inventoryCreate: async () => null,
    importRecordCreate: async () => null,
  }, async () => {
    const result = await dataImportService.compareWithDatabase(rows);

    assert.equal(result.summary.total, 4);
    assert.equal(result.summary.existing, 2);
    assert.equal(result.summary.new, 1);
    assert.equal(result.summary.invalid, 1);

    assert.equal(result.existingRecords.length, 2);
    assert.equal(result.newRecords.length, 1);
    assert.equal(result.invalidRecords.length, 1);

    assert.deepEqual(result.existingRecords.map((item) => item.customsName), ['花瓶', '碗']);
    assert.deepEqual(result.newRecords.map((item) => item.customsName), ['盘子']);
    assert.deepEqual(result.invalidRecords[0].reason, '货柜号/合同号缺失');
  });

  assert.equal(calls.findMany, 1);
});

test('deriveSourceParty: 第三方拼柜优先取厂家，其次购销合同号，否则标默认来源', () => {
  assert.equal(
    dataImportService.deriveSourceParty({
      manufacturer: '阿珍贵州',
      purchaseContractNo: 'CG2500001',
      note: '非捷淞报关，属拼船或他方自行报关',
    }),
    '阿珍贵州',
  );

  assert.equal(
    dataImportService.deriveSourceParty({
      manufacturer: '',
      purchaseContractNo: 'CG2500068',
      note: '共用发票',
    }),
    'CG2500068',
  );

  assert.equal(
    dataImportService.deriveSourceParty({
      manufacturer: '',
      purchaseContractNo: '',
      note: '非捷淞报关，属拼船或他方自行报关',
    }),
    '第三方拼柜',
  );

  assert.equal(
    dataImportService.deriveSourceParty({
      manufacturer: '捷淞自有',
      purchaseContractNo: 'CG2500002',
      note: '正常记录',
    }),
    null,
  );
});

test('importRecords: 同次导入命中映射缓存，且事务内写操作统一走 tx client', async () => {
  const preloadCalls = {
    portFindMany: 0,
    supplierFindMany: 0,
    productFindMany: 0,
    storeFindMany: 0,
    salesContractFindMany: 0,
    purchaseContractFindMany: 0,
  };
  const txCalls = {
    portFindUnique: 0,
    portCreate: 0,
    supplierFindFirst: 0,
    supplierCreate: 0,
    productFindFirst: 0,
    productCreate: 0,
    storeFindFirst: 0,
    storeCreate: 0,
    salesContractFindUnique: 0,
    salesContractCreate: 0,
    purchaseContractFindUnique: 0,
    purchaseContractCreate: 0,
    salesItemFindFirst: 0,
    salesItemCreate: 0,
    packingItemFindFirst: 0,
    packingItemCreate: 0,
    salesContractUpdate: 0,
    inventoryCreate: 0,
  };

  const rows = [
    {
      '序号': '1',
      '报关名': '花杯',
      '门店': '华强店',
      '厂家': '黎总',
      '港口': '洛杉矶',
      '柜子编号': '25-001-LA',
      '合同号': '25-001-LA',
      '购销合同号': 'PO-2026-001',
      '报关数量': '2',
      '箱数': '3',
      '毛重': '10',
      '净重': '9',
      '体积': '1.2',
      '采购金额': '200',
      '出口金额': '300',
      '规格': '标准'
    },
    {
      '序号': '2',
      '报关名': '花杯',
      '门店': '华强店',
      '厂家': '黎总',
      '港口': '洛杉矶',
      '柜子编号': '25-001-LA',
      '合同号': '25-001-LA',
      '购销合同号': 'PO-2026-001',
      '报关数量': '4',
      '箱数': '1',
      '毛重': '8',
      '净重': '7',
      '体积': '0.8',
      '采购金额': '160',
      '出口金额': '240',
      '规格': '标准'
    },
  ];

  const txClient = {
    port: {
      findUnique: async () => {
        txCalls.portFindUnique += 1;
        return null;
      },
      create: async (input) => {
        txCalls.portCreate += 1;
        return { id: 'port-1', ...input.data };
      },
    },
    supplier: {
      findFirst: async () => {
        txCalls.supplierFindFirst += 1;
        return null;
      },
      create: async (input) => {
        txCalls.supplierCreate += 1;
        return { id: 'supplier-1', name: input.data.name, shortName: input.data.shortName };
      },
    },
    product: {
      findFirst: async () => {
        txCalls.productFindFirst += 1;
        return null;
      },
      create: async (input) => {
        txCalls.productCreate += 1;
        return { id: 'product-1', customsName: input.data.customsName };
      },
    },
    store: {
      findFirst: async () => {
        txCalls.storeFindFirst += 1;
        return null;
      },
      create: async (input) => {
        txCalls.storeCreate += 1;
        return { id: 'store-1', name: input.data.name, portId: input.data.portId };
      },
    },
    salesContract: {
      findUnique: async () => {
        txCalls.salesContractFindUnique += 1;
        return null;
      },
      create: async (input) => {
        txCalls.salesContractCreate += 1;
        return { id: `contract-${txCalls.salesContractCreate}`, contractNo: input.data.contractNo };
      },
      update: async () => {
        txCalls.salesContractUpdate += 1;
        return { id: 'contract-1' };
      },
    },
    purchaseContract: {
      findUnique: async () => {
        txCalls.purchaseContractFindUnique += 1;
        return null;
      },
      create: async (input) => {
        txCalls.purchaseContractCreate += 1;
        return { id: `pc-${txCalls.purchaseContractCreate}`, contractNo: input.data.contractNo };
      },
    },
    salesItem: {
      findFirst: async () => {
        txCalls.salesItemFindFirst += 1;
        return null;
      },
      create: async () => {
        txCalls.salesItemCreate += 1;
        return { id: `sales-item-${txCalls.salesItemCreate}` };
      },
    },
    packingItem: {
      findFirst: async () => {
        txCalls.packingItemFindFirst += 1;
        return null;
      },
      create: async () => {
        txCalls.packingItemCreate += 1;
        return { id: `packing-item-${txCalls.packingItemCreate}` };
      },
    },
    inventory: {
      create: async () => {
        txCalls.inventoryCreate += 1;
        return { id: `inventory-${txCalls.inventoryCreate}` };
      },
    },
  };

  await withPrismaMocks({
    transaction: async (callback) => callback(txClient),
    findMany: async () => [],
    portFindMany: async () => {
      preloadCalls.portFindMany += 1;
      return [];
    },
    supplierFindMany: async () => {
      preloadCalls.supplierFindMany += 1;
      return [];
    },
    productFindMany: async () => {
      preloadCalls.productFindMany += 1;
      return [];
    },
    storeFindMany: async () => {
      preloadCalls.storeFindMany += 1;
      return [];
    },
    salesContractFindMany: async () => {
      preloadCalls.salesContractFindMany += 1;
      return [];
    },
    purchaseContractFindMany: async () => {
      preloadCalls.purchaseContractFindMany += 1;
      return [];
    },
    portFindUnique: async () => {
      throw new Error('root port.findUnique should not be used inside import transaction');
    },
    supplierFindFirst: async () => {
      throw new Error('root supplier.findFirst should not be used inside import transaction');
    },
    productFindFirst: async () => {
      throw new Error('root product.findFirst should not be used inside import transaction');
    },
    storeFindFirst: async () => {
      throw new Error('root store.findFirst should not be used inside import transaction');
    },
    salesContractFindUnique: async () => {
      throw new Error('root salesContract.findUnique should not be used inside import transaction');
    },
    purchaseContractFindUnique: async () => {
      throw new Error('root purchaseContract.findUnique should not be used inside import transaction');
    },
    salesItemFindFirst: async () => {
      throw new Error('root salesItem.findFirst should not be used inside import transaction');
    },
    packingItemFindFirst: async () => {
      throw new Error('root packingItem.findFirst should not be used inside import transaction');
    },
    portCreate: async () => {
      throw new Error('root port.create should not be used inside import transaction');
    },
    supplierCreate: async () => {
      throw new Error('root supplier.create should not be used inside import transaction');
    },
    productCreate: async () => {
      throw new Error('root product.create should not be used inside import transaction');
    },
    storeCreate: async () => {
      throw new Error('root store.create should not be used inside import transaction');
    },
    salesContractCreate: async () => {
      throw new Error('root salesContract.create should not be used inside import transaction');
    },
    purchaseContractCreate: async () => {
      throw new Error('root purchaseContract.create should not be used inside import transaction');
    },
    salesItemCreate: async () => {
      throw new Error('root salesItem.create should not be used inside import transaction');
    },
    packingItemCreate: async () => {
      throw new Error('root packingItem.create should not be used inside import transaction');
    },
    salesContractUpdate: async () => {
      throw new Error('root salesContract.update should not be used inside import transaction');
    },
    inventoryCreate: async () => {
      throw new Error('root inventory.create should not be used inside import transaction');
    },
    importRecordCreate: async (input) => ({ id: 'import-record', data: input.data }),
  }, async () => {
    const result = await dataImportService.importRecords(rows);

    assert.equal(result.created.suppliers, 1);
    assert.equal(result.created.products, 1);
    assert.equal(result.created.stores, 1);
    assert.equal(result.created.salesContracts, 1);
    assert.equal(result.created.containers, 1);
    assert.equal(result.created.purchaseContracts, 1);
    assert.equal(result.failed.length, 0);
    assert.equal(result.success.length, 2);

    assert.equal(preloadCalls.portFindMany, 1);
    assert.equal(preloadCalls.supplierFindMany, 1);
    assert.equal(preloadCalls.productFindMany, 1);
    assert.equal(preloadCalls.storeFindMany, 1);
    assert.equal(preloadCalls.salesContractFindMany, 2);
    assert.equal(preloadCalls.purchaseContractFindMany, 1);

    assert.equal(txCalls.portFindUnique, 1);
    assert.equal(txCalls.portCreate, 1);
    assert.equal(txCalls.supplierFindFirst, 1);
    assert.equal(txCalls.supplierCreate, 1);
    assert.equal(txCalls.productFindFirst, 1);
    assert.equal(txCalls.productCreate, 1);
    assert.equal(txCalls.storeFindFirst, 1);
    assert.equal(txCalls.storeCreate, 1);
    assert.equal(txCalls.salesContractFindUnique, 2);
    assert.equal(txCalls.salesContractCreate, 1);
    assert.equal(txCalls.purchaseContractFindUnique, 1);
    assert.equal(txCalls.purchaseContractCreate, 1);
    assert.equal(txCalls.salesItemCreate, 2);
    assert.equal(txCalls.packingItemCreate, 2);
    assert.equal(txCalls.salesContractUpdate, 2);
    assert.equal(txCalls.inventoryCreate, 2);
  });
});

test('importRecords: 单条事务失败后不会污染后续记录的缓存和创建计数', async () => {
  const rows = [
    {
      '序号': '1',
      '报关名': '花杯',
      '门店': '华强店',
      '厂家': '黎总',
      '港口': '洛杉矶',
      '柜子编号': '25-001-LA',
      '合同号': '25-001-LA',
      '购销合同号': 'PO-2026-001',
      '报关数量': '2',
      '箱数': '3',
      '毛重': '10',
      '净重': '9',
      '体积': '1.2',
      '采购金额': '200',
      '出口金额': '300',
      '规格': '标准'
    },
    {
      '序号': '2',
      '报关名': '花杯',
      '门店': '华强店',
      '厂家': '黎总',
      '港口': '洛杉矶',
      '柜子编号': '25-001-LA',
      '合同号': '25-001-LA',
      '购销合同号': 'PO-2026-001',
      '报关数量': '2',
      '箱数': '3',
      '毛重': '10',
      '净重': '9',
      '体积': '1.2',
      '采购金额': '200',
      '出口金额': '300',
      '规格': '标准'
    },
  ];

  let transactionAttempt = 0;
  const txCalls = {
    portCreate: 0,
    supplierCreate: 0,
    productCreate: 0,
    storeCreate: 0,
    salesContractCreate: 0,
    purchaseContractCreate: 0,
    salesItemCreate: 0,
    packingItemCreate: 0,
    inventoryCreate: 0,
  };

  const createTxClient = () => ({
    port: {
      findUnique: async () => null,
      create: async (input) => {
        txCalls.portCreate += 1;
        return { id: `port-${txCalls.portCreate}`, ...input.data };
      },
    },
    supplier: {
      findFirst: async () => null,
      create: async (input) => {
        txCalls.supplierCreate += 1;
        return { id: `supplier-${txCalls.supplierCreate}`, name: input.data.name, shortName: input.data.shortName };
      },
    },
    product: {
      findFirst: async () => null,
      create: async (input) => {
        txCalls.productCreate += 1;
        return { id: `product-${txCalls.productCreate}`, customsName: input.data.customsName };
      },
    },
    store: {
      findFirst: async () => null,
      create: async (input) => {
        txCalls.storeCreate += 1;
        return { id: `store-${txCalls.storeCreate}`, name: input.data.name, portId: input.data.portId };
      },
    },
    salesContract: {
      findUnique: async () => null,
      create: async (input) => {
        txCalls.salesContractCreate += 1;
        return { id: `contract-${txCalls.salesContractCreate}`, contractNo: input.data.contractNo };
      },
      update: async () => ({ id: 'contract-final' }),
    },
    purchaseContract: {
      findUnique: async () => null,
      create: async (input) => {
        txCalls.purchaseContractCreate += 1;
        return { id: `purchase-${txCalls.purchaseContractCreate}`, contractNo: input.data.contractNo };
      },
    },
    salesItem: {
      findFirst: async () => null,
      create: async () => {
        txCalls.salesItemCreate += 1;
        if (transactionAttempt === 1) {
          throw new Error('forced tx failure');
        }
        return { id: `sales-item-${txCalls.salesItemCreate}` };
      },
    },
    packingItem: {
      findFirst: async () => null,
      create: async () => {
        txCalls.packingItemCreate += 1;
        return { id: `packing-item-${txCalls.packingItemCreate}` };
      },
    },
    inventory: {
      create: async () => {
        txCalls.inventoryCreate += 1;
        return { id: `inventory-${txCalls.inventoryCreate}` };
      },
    },
  });

  await withPrismaMocks({
    transaction: async (callback) => {
      transactionAttempt += 1;
      return callback(createTxClient());
    },
    findMany: async () => [],
    portFindMany: async () => [],
    supplierFindMany: async () => [],
    productFindMany: async () => [],
    storeFindMany: async () => [],
    salesContractFindMany: async () => [],
    purchaseContractFindMany: async () => [],
    portFindUnique: async () => {
      throw new Error('root port.findUnique should not be used inside import transaction');
    },
    supplierFindFirst: async () => {
      throw new Error('root supplier.findFirst should not be used inside import transaction');
    },
    productFindFirst: async () => {
      throw new Error('root product.findFirst should not be used inside import transaction');
    },
    storeFindFirst: async () => {
      throw new Error('root store.findFirst should not be used inside import transaction');
    },
    salesContractFindUnique: async () => {
      throw new Error('root salesContract.findUnique should not be used inside import transaction');
    },
    purchaseContractFindUnique: async () => {
      throw new Error('root purchaseContract.findUnique should not be used inside import transaction');
    },
    salesItemFindFirst: async () => {
      throw new Error('root salesItem.findFirst should not be used inside import transaction');
    },
    packingItemFindFirst: async () => {
      throw new Error('root packingItem.findFirst should not be used inside import transaction');
    },
    portCreate: async () => {
      throw new Error('root port.create should not be used inside import transaction');
    },
    supplierCreate: async () => {
      throw new Error('root supplier.create should not be used inside import transaction');
    },
    productCreate: async () => {
      throw new Error('root product.create should not be used inside import transaction');
    },
    storeCreate: async () => {
      throw new Error('root store.create should not be used inside import transaction');
    },
    salesContractCreate: async () => {
      throw new Error('root salesContract.create should not be used inside import transaction');
    },
    purchaseContractCreate: async () => {
      throw new Error('root purchaseContract.create should not be used inside import transaction');
    },
    salesItemCreate: async () => {
      throw new Error('root salesItem.create should not be used inside import transaction');
    },
    packingItemCreate: async () => {
      throw new Error('root packingItem.create should not be used inside import transaction');
    },
    salesContractUpdate: async () => {
      throw new Error('root salesContract.update should not be used inside import transaction');
    },
    inventoryCreate: async () => {
      throw new Error('root inventory.create should not be used inside import transaction');
    },
    importRecordCreate: async () => ({ id: 'import-record' }),
  }, async () => {
    const result = await dataImportService.importRecords(rows);

    assert.equal(result.failed.length, 1);
    assert.equal(result.success.length, 1);
    assert.equal(result.created.suppliers, 1);
    assert.equal(result.created.products, 1);
    assert.equal(result.created.stores, 1);
    assert.equal(result.created.salesContracts, 1);
    assert.equal(result.created.containers, 1);
    assert.equal(result.created.purchaseContracts, 1);

    assert.equal(txCalls.portCreate, 2);
    assert.equal(txCalls.supplierCreate, 2);
    assert.equal(txCalls.productCreate, 2);
    assert.equal(txCalls.storeCreate, 2);
    assert.equal(txCalls.salesContractCreate, 2);
    assert.equal(txCalls.purchaseContractCreate, 2);
    assert.equal(txCalls.salesItemCreate, 2);
    assert.equal(txCalls.packingItemCreate, 1);
    assert.equal(txCalls.inventoryCreate, 1);
  });
});
