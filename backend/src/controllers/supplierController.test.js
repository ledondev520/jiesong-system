/**
 * Input: supplierController 模块
 * Output: 模块导出冒烟测试
 * Pos: 自动补齐基础测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');

test('supplierController: 模块可正常加载并导出', () => {
  const mod = require('./supplierController');
  assert.ok(mod !== undefined);
});

test('markQualityIssue: SALES/WAREHOUSE never receive supplier bank fields (R2 P1-1)', async () => {
  const prisma = require('../utils/prisma');
  const { markQualityIssue } = require('./supplierController');
  const row = { id: 's1', name: 'Synthetic Co', hasQualityIssue: true, bankAccountName: 'n', bankName: 'b', bankBranch: 'br', bankCode: 'c', bankAccount: '0000' };
  const original = prisma.supplier.update;
  prisma.supplier.update = async () => ({ ...row });
  try {
    for (const [role, expectBank] of [['SALES', false], ['WAREHOUSE', false], ['PURCHASE', true]]) {
      let body;
      await markQualityIssue({ params: { id: 's1' }, body: { hasQualityIssue: true }, user: { role } },
        { json: (b) => { body = b; }, status() { return this; } }, (e) => { throw e; });
      assert.equal('bankAccount' in body.data, expectBank, role);
    }
  } finally { prisma.supplier.update = original; }
});
