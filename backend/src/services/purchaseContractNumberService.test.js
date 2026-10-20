const test = require('node:test');
const assert = require('node:assert/strict');
const { generateNextPurchaseContractNo, isPurchaseNumberConflict } = require('./purchaseContractNumberService');

const generate = (numbers) => generateNextPurchaseContractNo({ purchaseContract: { findMany: async (query) => {
  assert.deepEqual(query, { where: { contractNo: { startsWith: 'CG26' } }, select: { contractNo: true } });
  return numbers.map(contractNo => ({ contractNo }));
} } }, '26');

test('采购编号从现存最大序号递增，删除形成空洞不重用旧号', async () => {
  assert.equal(await generate([]), 'CG2600001');
  assert.equal(await generate(['CG2600001', 'CG2600003']), 'CG2600004');
  assert.equal(await generate(['CG2600012', 'CG26-CUSTOM', 'CG269']), 'CG2600013');
});
test('五位序号溢出和大整数仍按数字递增，不按字符串排序', async () => {
  assert.equal(await generate(['CG2699999', 'CG26100000']), 'CG26100001');
  assert.equal(await generate(['CG269007199254740992']), 'CG269007199254740993');
});
test('仅识别采购合同号的唯一冲突', () => {
  assert.equal(isPurchaseNumberConflict({ code: 'P2002', meta: { target: ['contractNo'] } }), true);
  assert.equal(isPurchaseNumberConflict({ code: 'P2002', meta: { target: ['id'] } }), false);
  assert.equal(isPurchaseNumberConflict({ code: 'P2028' }), false);
});
