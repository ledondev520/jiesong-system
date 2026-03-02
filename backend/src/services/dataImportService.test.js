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

test('importRecords: 同次导入命中映射缓存，避免重复 find/create', async () => {
  const calls = {
    portFindMany: 0,
    supplierFindMany: 0,
    productFindMany: 0,
    storeFindMany: 0,
    salesContractFindMany: 0,
    purchaseContractFindMany: 0,
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
    salesContractFindManyCalledByContainer: 0,
    purchaseContractFindUnique: 0,
    purchaseContractCreate: 0,
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

  await withPrismaMocks({
    findMany: async () => [],
    portFindMany: async () => {
      calls.portFindMany += 1;
      return [];
    },
    supplierFindMany: async () => {
      calls.supplierFindMany += 1;
      return [];
    },
    productFindMany: async () => {
      calls.productFindMany += 1;
      return [];
    },
    storeFindMany: async () => {
      calls.storeFindMany += 1;
      return [];
    },
    salesContractFindMany: async () => {
      calls.salesContractFindMany += 1;
      if (calls.salesContractFindManyCalledByContainer > 0) {
        return [];
      }
      calls.salesContractFindManyCalledByContainer += 1;
      return [];
    },
    purchaseContractFindMany: async () => {
      calls.purchaseContractFindMany += 1;
      return [];
    },
    portFindUnique: async () => {
      calls.portFindUnique += 1;
      return null;
    },
    supplierFindFirst: async () => {
      calls.supplierFindFirst += 1;
      return null;
    },
    productFindFirst: async () => {
      calls.productFindFirst += 1;
      return null;
    },
    storeFindFirst: async () => {
      calls.storeFindFirst += 1;
      return null;
    },
    salesContractFindUnique: async () => {
      calls.salesContractFindUnique += 1;
      return null;
    },
    purchaseContractFindUnique: async () => {
      calls.purchaseContractFindUnique += 1;
      return null;
    },
    salesItemFindFirst: async () => null,
    packingItemFindFirst: async () => null,
    portCreate: async (input) => {
      calls.portCreate += 1;
      return { id: 'port-1', ...input.data };
    },
    supplierCreate: async (input) => {
      calls.supplierCreate += 1;
      return { id: 'supplier-1', name: input.data.name, shortName: input.data.shortName };
    },
    productCreate: async (input) => {
      calls.productCreate += 1;
      return { id: 'product-1', customsName: input.data.customsName };
    },
    storeCreate: async (input) => {
      calls.storeCreate += 1;
      return { id: 'store-1', name: input.data.name, portId: input.data.portId };
    },
    salesContractCreate: async (input) => {
      calls.salesContractCreate += 1;
      return { id: `contract-${calls.salesContractCreate}`, contractNo: input.data.contractNo };
    },
    purchaseContractCreate: async (input) => {
      calls.purchaseContractCreate += 1;
      return { id: `pc-${calls.purchaseContractCreate}`, contractNo: input.data.contractNo };
    },
    salesItemCreate: async () => ({ id: 'sales-item' }),
    packingItemCreate: async () => ({ id: 'packing-item' }),
    salesContractUpdate: async () => null,
    inventoryCreate: async () => ({ id: 'inventory-item' }),
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

    assert.equal(calls.portFindMany, 1);
    assert.equal(calls.supplierFindMany, 1);
    assert.equal(calls.productFindMany, 1);
    assert.equal(calls.storeFindMany, 1);
    assert.equal(calls.salesContractFindMany, 2);
    assert.equal(calls.purchaseContractFindMany, 1);
    assert.equal(calls.portFindUnique, 1);
    assert.equal(calls.portCreate, 1);
    assert.equal(calls.supplierFindFirst, 1);
    assert.equal(calls.supplierCreate, 1);
    assert.equal(calls.productFindFirst, 1);
    assert.equal(calls.productCreate, 1);
    assert.equal(calls.storeFindFirst, 1);
    assert.equal(calls.storeCreate, 1);
    assert.equal(calls.salesContractFindUnique, 2);
    assert.equal(calls.salesContractCreate, 1);
    assert.equal(calls.purchaseContractFindUnique, 1);
    assert.equal(calls.purchaseContractCreate, 1);
  });
});
