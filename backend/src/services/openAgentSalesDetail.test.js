/**
 * Input: 真实Agent只读工具定义、合成销售合同装箱资料
 * Output: 第三方拼柜来源和自有货物识别回归
 * Pos: 防止将业务派生字段误当成Prisma原始字段
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function salesDetailTool(contract) {
  // Evaluate the tool file with a fake prisma injected; the tool specs live in agent/tools/readTools.js.
  const filename = require.resolve('./agent/tools/readTools');
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, __dirname: path.dirname(filename), __filename: filename, process, console,
    require: (name) => name === '../../../utils/prisma'
      ? { salesContract: { findFirst: async () => contract } }
      : localRequire(name),
  });
  const specs = module.exports({ toJson: (value) => JSON.stringify(value, null, 2) });
  return specs.find((tool) => tool.name === 'GetSalesContractDetail');
}

test('AI出口合同详情根据装箱行计算第三方来源，去重并保留未命名来源', async () => {
  const result = JSON.parse(await salesDetailTool({
    id: 'synthetic-sales', contractNo: 'EXP-TEST', packingItems: [
      { isOwnedByJiesong: true, sourceParty: '自有' },
      { isOwnedByJiesong: false, sourceParty: '合成第三方' },
      { isOwnedByJiesong: false, sourceParty: '合成第三方' },
      { isOwnedByJiesong: false, sourceParty: null },
    ],
  }).call({ contractNo: 'EXP-TEST' }));
  assert.equal(result.hasThirdPartyCargo, true);
  assert.deepEqual(result.sourceParties, ['合成第三方', '第三方拼柜']);
});

test('仅自有货物不会误判第三方，未找到合同仍返回原有提示', async () => {
  const result = JSON.parse(await salesDetailTool({ packingItems: [{ isOwnedByJiesong: true }] }).call({ contractNo: 'EXP-TEST' }));
  assert.equal(result.hasThirdPartyCargo, false);
  assert.deepEqual(result.sourceParties, []);
  const missing = JSON.parse(await salesDetailTool(null).call({ contractNo: 'EXP-TEST' }));
  assert.match(missing.error, /不存在/);
});
