/**
 * Input: generateThreeForms（桩化就绪度与内存 tx）
 * Output: A55 A2：三张表同一事务，后一步失败则前面单据一并回滚，重试不产生 -2 重复
 * Pos: 后端服务测试
 */
const test = require('node:test');
const assert = require('node:assert/strict');

// 在加载 threeFormsService 之前替换就绪度，使 generateThreeForms 不依赖数据库
const readiness = require('./exportReadinessService');
readiness.getExportReadiness = async () => ({ issues: [], lines: [], summary: { totalExportAmountUsd: 100 } });
readiness.assertExportReadiness = () => {};

const prisma = require('../utils/prisma');
const { generateThreeForms } = require('./threeFormsService');

const makeDb = ({ failTaxRefundOnce }) => {
  const db = { customs: [], forex: [], refund: [] };
  let failed = !failTaxRefundOnce;
  const table = (name, field, prefix, extra = {}) => ({
    findMany: async () => db[name].map((r) => ({ [field]: r[field] })),
    create: async ({ data }) => {
      if (name === 'refund' && !failed) { failed = true; throw new Error('boom'); }
      const row = { id: `${name}-${db[name].length + 1}`, ...data };
      db[name].push(row);
      return row;
    },
    ...extra,
  });
  const tx = {
    salesContract: { findUnique: async () => ({ id: 's1', contractNo: 'XS260001', exchangeRate: 7, packingItems: [] }) },
    customsDeclaration: table('customs', 'declarationNo', 'BG', { findUnique: async ({ where }) => db.customs.find((r) => r.id === where.id) }),
    customsDeclarationItem: { createMany: async () => {} },
    forexVerification: table('forex', 'verificationNo', 'WH'),
    taxRefund: table('refund', 'refundNo', 'TX'),
  };
  // 简化的事务语义：回调抛错则恢复快照
  const transaction = async (cb) => {
    const snapshot = JSON.stringify(db);
    try { return await cb(tx); } catch (error) {
      Object.assign(db, JSON.parse(snapshot));
      throw error;
    }
  };
  return { db, transaction };
};

test('generateThreeForms：退税单失败时报关单与核销单一并回滚，重试得到无 -2 后缀的单号', async (t) => {
  const { db, transaction } = makeDb({ failTaxRefundOnce: true });
  const original = prisma.$transaction;
  prisma.$transaction = transaction;
  t.after(() => { prisma.$transaction = original; });

  await assert.rejects(() => generateThreeForms({ salesContractId: 's1', items: [] }), /boom/);
  assert.deepEqual([db.customs.length, db.forex.length, db.refund.length], [0, 0, 0]);

  const result = await generateThreeForms({ salesContractId: 's1', items: [] });
  assert.ok(result.customsDeclarationId && result.forexId && result.taxRefundId);
  assert.equal(db.customs.length, 1);
  assert.equal(db.customs[0].declarationNo, 'BG260001');
  assert.equal(db.forex[0].verificationNo, 'WH260001');
  assert.equal(db.refund[0].refundNo, 'TX260001');
});
