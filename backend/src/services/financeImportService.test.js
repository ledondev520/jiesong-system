/**
 * Input: financeImportService 模块
 * Output: 模块导出冒烟测试 + 核心解析逻辑测试
 * Pos: 财务导入服务自动测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const financeImportService = require('./financeImportService');

test('financeImportService: 模块可正常加载并导出', () => {
  assert.ok(financeImportService);
  assert.strictEqual(typeof financeImportService.parseBankStatement, 'function');
  assert.strictEqual(typeof financeImportService.parseInvoices, 'function');
  assert.strictEqual(typeof financeImportService.importBankTransactions, 'function');
  assert.strictEqual(typeof financeImportService.importInvoiceRecords, 'function');
});

test('parseBankStatement: 解析空 buffer 应返回空记录', () => {
  const xlsx = require('xlsx');
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([['交易日期', '收入', '支出', '对方户名', '摘要']]), 'Sheet1');
  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const result = financeImportService.parseBankStatement(buf, 'GENERIC');
  assert.ok(Array.isArray(result.records));
  assert.ok(Array.isArray(result.errors));
  assert.strictEqual(result.records.length, 0);
});

test('parseBankStatement: 解析通用模板银行流水', () => {
  const xlsx = require('xlsx');
  const wb = xlsx.utils.book_new();
  const data = [
    ['交易日期', '收入', '支出', '对方户名', '摘要', '余额', '交易流水号'],
    ['2025-03-15', 10000, 0, '测试供应商A', '货款', 50000, 'TXN001'],
    ['2025-03-16', 0, 5000, '测试供应商B', '运费', 45000, 'TXN002'],
  ];
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(data), 'Sheet1');
  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const result = financeImportService.parseBankStatement(buf, 'GENERIC');
  assert.strictEqual(result.records.length, 2);
  assert.strictEqual(result.records[0].amount, 10000);
  assert.strictEqual(result.records[0].direction, 'IN');
  assert.strictEqual(result.records[1].amount, -5000);
  assert.strictEqual(result.records[1].direction, 'OUT');
  assert.strictEqual(result.records[0].txnId, 'TXN001');
});

test('parseInvoices: 解析通用模板发票', () => {
  const xlsx = require('xlsx');
  const wb = xlsx.utils.book_new();
  const data = [
    ['发票号码', '销方名称', '开票日期', '金额', '税额', '价税合计', '发票状态'],
    ['INV001', '测试销方公司', '2025-03-15', 10000, 1300, 11300, '正常'],
  ];
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(data), 'Sheet1');
  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const result = financeImportService.parseInvoices(buf, 'all');
  assert.strictEqual(result.records.length, 1);
  assert.strictEqual(result.records[0].seller, '测试销方公司');
  assert.strictEqual(result.records[0].amount, 10000);
  assert.strictEqual(result.records[0].tax, 1300);
  assert.strictEqual(result.records[0].total, 11300);
});

test('parseBankStatement: 日期格式容错', () => {
  const xlsx = require('xlsx');
  const wb = xlsx.utils.book_new();
  const data = [
    ['交易日期', '收入'],
    ['2025/03/15', 1000],
    ['2025年03月16日', 2000],
  ];
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(data), 'Sheet1');
  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const result = financeImportService.parseBankStatement(buf, 'GENERIC');
  assert.strictEqual(result.records.length, 2);
  assert.strictEqual(result.records[0].txnDate, '2025-03-15');
  assert.strictEqual(result.records[1].txnDate, '2025-03-16');
});

test('parseInvoices: 缺少销方名称应记录错误', () => {
  const xlsx = require('xlsx');
  const wb = xlsx.utils.book_new();
  const data = [
    ['发票号码', '销方名称', '开票日期', '金额'],
    ['INV001', '', '2025-03-15', 1000],
  ];
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(data), 'Sheet1');
  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const result = financeImportService.parseInvoices(buf, 'all');
  assert.strictEqual(result.records.length, 0);
  assert.strictEqual(result.errors.length, 1);
  assert.ok(result.errors[0].reason.includes('销方'));
});
