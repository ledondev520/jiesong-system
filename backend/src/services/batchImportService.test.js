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

test('batchImportPurchaseContracts: 使用现有 schema 创建采购合同与明细', async () => {
  const originals = {
    supplierFindFirst: prisma.supplier.findFirst,
    productFindFirst: prisma.product.findFirst,
    purchaseContractCount: prisma.purchaseContract.count,
    purchaseContractCreate: prisma.purchaseContract.create,
    purchaseItemCreate: prisma.purchaseItem.create,
  };
  const captured = { contract: null, item: null };

  prisma.supplier.findFirst = async () => ({ id: 'sup-1' });
  prisma.product.findFirst = async () => ({ id: 'prod-1' });
  prisma.purchaseContract.count = async () => 12;
  prisma.purchaseContract.create = async (args) => {
    captured.contract = args;
    return { id: 'pc-1', ...args.data };
  };
  prisma.purchaseItem.create = async (args) => {
    captured.item = args;
    return { id: 'pi-1', ...args.data };
  };

  try {
    const result = await batchImportService.batchImportPurchaseContracts([{
      _rowNum: 3,
      supplierName: '供应商A',
      productName: '瓷砖',
      quantity: '6',
      price: '80',
      deliveryDate: '2026-04-10',
    }], 'user-1');

    assert.equal(result.success, 1);
    assert.equal(result.failed, 0);
    assert.equal(captured.contract.data.contractNo, `CG${new Date().getFullYear().toString().slice(-2)}00013`);
    assert.equal(captured.item.data.purchaseContractId, 'pc-1');
    assert.equal(captured.item.data.unitPrice, 80);
    assert.equal(captured.item.data.totalPrice, 480);
  } finally {
    prisma.supplier.findFirst = originals.supplierFindFirst;
    prisma.product.findFirst = originals.productFindFirst;
    prisma.purchaseContract.count = originals.purchaseContractCount;
    prisma.purchaseContract.create = originals.purchaseContractCreate;
    prisma.purchaseItem.create = originals.purchaseItemCreate;
  }
});
