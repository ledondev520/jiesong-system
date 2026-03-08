/**
 * Input: customsDeclarationDraftService、prisma
 * Output: 自动生成报关单草稿测试
 * Pos: 后端服务层测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const prisma = require('../utils/prisma');
const customsDeclarationDraftService = require('./customsDeclarationDraftService');

const withMockDelegates = async (mockMap, callback) => {
  const originals = new Map();

  Object.entries(mockMap).forEach(([key, value]) => {
    originals.set(key, prisma[key]);
    prisma[key] = value;
  });

  try {
    await callback();
  } finally {
    originals.forEach((value, key) => {
      if (typeof value === 'undefined') {
        delete prisma[key];
      } else {
        prisma[key] = value;
      }
    });
  }
};

test('generateCustomsDeclarationDrafts: 基于销售合同与装箱明细生成报关单草稿', async () => {
  const createdPayloads = [];

  await withMockDelegates({
    salesContract: {
      findMany: async () => ([
        {
          id: 'sc-1',
          contractNo: 'EXP2400001',
          exchangeRate: 7.12,
          totalAmount: 42684.2,
          note: 'existing contract note',
          packingItems: [
            {
              id: 'pk-1',
              productId: 'p-1',
              quantity: 10,
              unit: '个',
              totalPrice: 1500,
              unitPrice: 150,
              grossWeight: 200,
              netWeight: 180,
              product: {
                customsName: '传送带',
                hsCode: '4010110000',
                declaration: '传菜用途|长条回转带',
                unit: '个',
              },
            },
            {
              id: 'pk-2',
              productId: 'p-2',
              quantity: 5,
              unit: null,
              totalPrice: 2500,
              unitPrice: 500,
              grossWeight: 100,
              netWeight: 90,
              product: {
                customsName: '钢化玻璃',
                hsCode: '7007190000',
                declaration: null,
                unit: '片',
              },
            },
          ],
        },
      ]),
    },
    customsDeclaration: {
      findFirst: async () => null,
      create: async ({ data }) => {
        createdPayloads.push(data);
        return { id: 'cd-1', ...data };
      },
      delete: async () => {
        throw new Error('should not delete');
      },
    },
    hsCode: {
      findFirst: async ({ where }) => {
        if (where.hsCode === '7007190000') {
          return {
            hsCode: '7007190000',
            declarationElements: '0|0|防尘用途|钢化|无品牌|',
          };
        }
        return null;
      },
    },
  }, async () => {
    const result = await customsDeclarationDraftService.generateCustomsDeclarationDrafts({
      salesContractId: 'sc-1',
    });

    assert.equal(result.created, 1);
    assert.equal(result.skipped, 0);
    assert.equal(createdPayloads.length, 1);
    assert.match(createdPayloads[0].declarationNo, /^CUS-AUTO-\d{8}-001$/);
    assert.equal(createdPayloads[0].salesContractId, 'sc-1');
    assert.equal(createdPayloads[0].currency, 'USD');
    assert.equal(createdPayloads[0].exchangeRate, 7.12);
    assert.equal(createdPayloads[0].totalAmount, 4000);
    assert.equal(createdPayloads[0].totalQuantity, 15);
    assert.equal(createdPayloads[0].totalGrossWeight, 300);
    assert.equal(createdPayloads[0].totalNetWeight, 270);
    assert.equal(createdPayloads[0].status, 'DRAFT');
    assert.equal(createdPayloads[0].items.create.length, 2);
    assert.equal(createdPayloads[0].items.create[0].hsCode, '4010110000');
    assert.equal(createdPayloads[0].items.create[0].declarationElements, '传菜用途|长条回转带');
    assert.equal(createdPayloads[0].items.create[1].declarationElements, '0|0|防尘用途|钢化|无品牌|');
  });
});

test('generateCustomsDeclarationDrafts: 已存在报关单时默认跳过', async () => {
  await withMockDelegates({
    salesContract: {
      findMany: async () => ([
        {
          id: 'sc-2',
          contractNo: 'EXP2400002',
          packingItems: [],
        },
      ]),
    },
    customsDeclaration: {
      findFirst: async () => ({ id: 'cd-existing' }),
      create: async () => {
        throw new Error('should not create');
      },
    },
    hsCode: {
      findFirst: async () => null,
    },
  }, async () => {
    const result = await customsDeclarationDraftService.generateCustomsDeclarationDrafts({
      salesContractId: 'sc-2',
    });

    assert.equal(result.created, 0);
    assert.equal(result.skipped, 1);
    assert.equal(result.items[0].reason, 'existing_declaration');
  });
});

