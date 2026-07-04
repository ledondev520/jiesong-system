/**
 * Input: packingListCheckService（buildComparison 纯函数与数值提取工具）
 * Output: 装箱单比对逻辑回归测试
 * Pos: 出口装箱单核对服务测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildComparison, _internal } = require('./packingListCheckService');

const SAMPLE_CONTRACT = {
  contractNo: 'EXP-2026-001',
  totalBoxes: 850,
  grossWeight: 18500,
  netWeight: 17200,
  volume: 62.5,
  packingItems: [
    { boxes: 500, quantity: 5000, product: { customsName: '陶瓷杯' } },
    { boxes: 350, quantity: 2800, product: { customsName: '玻璃碗' } },
  ],
};

test('extractNumbers: 提取含千分位与小数的数值', () => {
  const numbers = _internal.extractNumbers('G.W. 18,500.00 KGS  CBM 62.5  850 CTNS');
  assert.deepEqual(numbers, [18500, 62.5, 850]);
});

test('matchNumber: 容差内匹配返回最接近值', () => {
  const result = _internal.matchNumber([18492, 100], 18500, 1, 0.005);
  assert.equal(result.matched, true); // 0.5% 容差 = 92.5 > 8
  assert.equal(result.closest, 18492);
});

test('buildComparison: 数据一致时全部匹配', () => {
  const pdfText = `
    PACKING LIST
    Invoice No.: EXP-2026-001
    TOTAL: 850 CTNS
    G.W.: 18,500.00 KGS   N.W.: 17,200.00 KGS
    MEAS: 62.50 CBM
    Ceramic Cup  500 CTNS  5,000 PCS
    Glass Bowl   350 CTNS  2,800 PCS
  `;
  const result = buildComparison(SAMPLE_CONTRACT, pdfText);

  assert.equal(result.summary.ok, true);
  assert.equal(result.summary.fieldMismatched, 0);
  assert.equal(result.summary.itemCheckMismatched, 0);
  const contractNoField = result.fields.find((f) => f.key === 'contractNo');
  assert.equal(contractNoField.matched, true);
});

test('buildComparison: 毛重不一致时标记差异', () => {
  const pdfText = `
    PACKING LIST for EXP-2026-001
    850 CTNS  G.W. 17,300 KGS  N.W. 17,200 KGS  62.5 CBM
    500 / 5000   350 / 2800
  `;
  const result = buildComparison(SAMPLE_CONTRACT, pdfText);

  assert.equal(result.summary.ok, false);
  const grossField = result.fields.find((f) => f.key === 'grossWeight');
  assert.equal(grossField.matched, false);
  assert.equal(grossField.closest, 17300);
});

test('buildComparison: 合同号缺失与明细数量差异均警示', () => {
  const pdfText = `
    PACKING LIST (no contract number here)
    850 CTNS 18,500 KGS 17,200 KGS 62.5 CBM
    500 CTNS 5,000 PCS
    350 CTNS 2,750 PCS
  `;
  const result = buildComparison(SAMPLE_CONTRACT, pdfText);

  const contractNoField = result.fields.find((f) => f.key === 'contractNo');
  assert.equal(contractNoField.matched, false);

  const bowlRow = result.items.find((i) => i.productName === '玻璃碗');
  assert.equal(bowlRow.quantity.matched, false);
  assert.equal(result.summary.itemCheckMismatched, 1);
});

test('buildComparison: 系统未录入的指标跳过比对（matched=null）', () => {
  const contract = { ...SAMPLE_CONTRACT, netWeight: 0, volume: null };
  const result = buildComparison(contract, 'EXP-2026-001 850 18500');
  const netField = result.fields.find((f) => f.key === 'netWeight');
  const volumeField = result.fields.find((f) => f.key === 'volume');
  assert.equal(netField.matched, null);
  assert.equal(volumeField.matched, null);
});
