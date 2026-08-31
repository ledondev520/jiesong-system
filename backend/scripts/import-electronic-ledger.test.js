/**
 * Input: 合成跨月科目余额与明细账
 * Output: 拆月、期初结转和勾稽校验测试
 * Pos: 电子账簿导入 Adapter 的最小回归测试
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const XLSX = require('xlsx');
const {
  parseRangeLedger,
  parseRangeTrialBalance,
  deriveMonthlyData,
  validateRangeSources,
} = require('./import-electronic-ledger');

function workbookBuffer(sheetName, rows, bookType = 'xlsx') {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheetName);
  return XLSX.write(workbook, { type: 'buffer', bookType });
}

test('跨月电子账簿按月拆分、结转期初并与科目余额勾稽', () => {
  const ledger = parseRangeLedger(workbookBuffer('明细账', [
    ['明细账'],
    ['编制单位：示例国际物流有限公司', null, null, '期间：2024年1月-2024年2月'],
    ['科目编码', '科目名称', '日期', '凭证号', '摘要', '借方', '贷方', '方向', '余额'],
    ['1002', '银行存款', '2024-01-01', null, '期初余额', null, null, '借', 10],
    ['1002', '银行存款', '2024-01-31', null, '本期合计', 5, 2, '借', 13],
    ['1002', '银行存款', '2024-01-31', null, '本年累计', 5, 2, '借', 13],
    ['1002', '银行存款', '2024-02-29', null, '本期合计', 1, 4, '借', 10],
    ['1002', '银行存款', '2024-02-29', null, '本年累计', 6, 6, '借', 10],
  ]));
  const trialBalance = parseRangeTrialBalance(workbookBuffer('科目余额表', [
    ['科目余额表'],
    ['核算单位: 示例国际物流有限公司', null, null, '期间: 2024年01月-2024年02月'],
    ['科目编码', '科目名称', '期初余额', null, '本期发生额', null, '本年累计发生额', null, '期末余额', null],
    [null, null, '借方', '贷方', '借方', '贷方', '借方', '贷方', '借方', '贷方'],
    ['1002', '银行存款', 10, 0, 6, 6, 6, 6, 10, 0],
  ], 'biff8'));

  const monthly = deriveMonthlyData(ledger);
  assert.deepEqual(monthly.keys, ['2024-01', '2024-02']);
  assert.equal(monthly.balancesByPeriod['2024-02'][0].openingDebit, 13);
  assert.equal(monthly.balancesByPeriod['2024-02'][0].endingDebit, 10);
  assert.deepEqual(validateRangeSources(ledger, trialBalance, monthly), { accountCount: 1 });
});
