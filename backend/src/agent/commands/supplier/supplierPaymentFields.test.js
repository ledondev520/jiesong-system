/**
 * Input: 供应商创建/更新命令与银行汇款字段
 * Output: 收款户名、支行和联行号持久化契约测试
 * Pos: 供应商付款资料 Interface 测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSupplier } = require('./createSupplier');
const { updateSupplier } = require('./updateSupplier');

test('createSupplier: 保存完整收款账户信息', async () => {
  let createdData;
  await createSupplier({
    input: {
      name: '佛山供应商',
      bankAccountName: '佛山供应商有限公司',
      bankName: '中国银行',
      bankBranch: '佛山祖庙支行',
      bankCode: '104581000001',
      bankAccount: '622200001',
    },
    prismaClient: { supplier: { create: async ({ data }) => { createdData = data; return data; } } },
  });

  assert.equal(createdData.bankAccountName, '佛山供应商有限公司');
  assert.equal(createdData.bankBranch, '佛山祖庙支行');
  assert.equal(createdData.bankCode, '104581000001');
});

test('updateSupplier: 可单独更新完整收款账户信息', async () => {
  let updatedData;
  await updateSupplier({
    id: 'supplier-1',
    input: {
      bankAccountName: '新户名',
      bankBranch: '新支行',
      bankCode: '313000000001',
    },
    prismaClient: { supplier: { update: async ({ data }) => { updatedData = data; return data; } } },
  });

  assert.equal(updatedData.bankAccountName, '新户名');
  assert.equal(updatedData.bankBranch, '新支行');
  assert.equal(updatedData.bankCode, '313000000001');
});
