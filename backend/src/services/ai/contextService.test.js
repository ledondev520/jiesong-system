/**
 * Input: contextService、prisma
 * Output: AI 上下文构造服务测试
 * Pos: 后端 AI 服务测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../../utils/prisma');
const { extractKeywords, buildContextQueries, getDbContext } = require('./contextService');

test('extractKeywords: 提取中文关键词、合同号与柜号', () => {
  const keywords = extractKeywords('请帮我查询 CG123 在哪，柜号是 25-001-LA');

  assert.equal(keywords.includes('CG123'), true);
  assert.equal(keywords.includes('25-001-LA'), true);
});

test('buildContextQueries: 根据语义添加合同与货柜任务', () => {
  const { tasks } = buildContextQueries('请查询 EXP100 合同和货柜情况');
  const names = tasks.map((task) => task.name);

  assert.equal(names.includes('stats'), true);
  assert.equal(names.includes('sales:exact:EXP100'), true);
  assert.equal(names.includes('sales:fuzzy:100'), true);
  assert.equal(names.includes('container:recent'), true);
});

test('getDbContext: 拼装统计与合同上下文文本', async () => {
  const originals = {
    productCount: prisma.product.count,
    supplierCount: prisma.supplier.count,
    purchaseCount: prisma.purchaseContract.count,
    salesCount: prisma.salesContract.count,
    salesFindMany: prisma.salesContract.findMany,
  };

  prisma.product.count = async () => 10;
  prisma.supplier.count = async () => 3;
  prisma.purchaseContract.count = async () => 5;
  prisma.salesContract.count = async () => 7;
  prisma.salesContract.findMany = async (args) => {
    const keyword = args?.where?.contractNo?.contains;
    if (keyword === 'EXP100') {
      return [{
        contractNo: 'EXP100',
        status: 'CONFIRMED',
        totalAmount: 800,
        receivedAmount: 200,
        items: [{
          quantity: 2,
          sellingPrice: 400,
          product: { customsName: '马克杯', unit: '件' },
          store: { name: '华强店' },
        }],
      }];
    }
    return [];
  };

  try {
    const context = await getDbContext('请帮我查询 EXP100 合同');

    assert.equal(context.includes('【数据库参考信息】'), true);
    assert.equal(context.includes('【系统统计】商品10种'), true);
    assert.equal(context.includes('【销售合同EXP100】'), true);
    assert.equal(context.includes('马克杯'), true);
  } finally {
    prisma.product.count = originals.productCount;
    prisma.supplier.count = originals.supplierCount;
    prisma.purchaseContract.count = originals.purchaseCount;
    prisma.salesContract.count = originals.salesCount;
    prisma.salesContract.findMany = originals.salesFindMany;
  }
});
