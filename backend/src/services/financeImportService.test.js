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

test('parseInvoices: 识别标题行后的进项表头并补全购买方方向', () => {
  const xlsx = require('xlsx');
  const wb = xlsx.utils.book_new();
  const data = [
    ['进项发票导出'],
    ['序号', '发票类型', '发票号码', '销方名称', '销方税号', '税收编码', '开票项目', '金额', '税额', '价税合计', '开票日期'],
    [1, '增值税专用发票', 'TEST-IN-001', '示例供应商有限公司', 'TEST-TAX-ID', 'TEST-CODE', '示例服务', 100, 6, 106, '2026-04-02'],
  ];
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(data), '进项');
  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const result = financeImportService.parseInvoices(buf, 'input');

  assert.strictEqual(result.records.length, 1);
  assert.ok(result.records[0].buyer);
  assert.strictEqual(result.records[0].invNo, 'TEST-IN-001');
  assert.strictEqual(result.records[0].itemName, '示例服务');
  assert.strictEqual(result.records[0].taxClassCode, 'TEST-CODE');
  assert.strictEqual(result.previewMapping.invNo, '发票号码');
  assert.strictEqual(result.headerRow, 2);
});

test('parseInvoices: 同一发票的续行明细聚合且忽略汇总行', () => {
  const xlsx = require('xlsx');
  const wb = xlsx.utils.book_new();
  const data = [
    ['进项发票导出'],
    ['序号', '发票号码', '销方名称', '开票项目', '规格型号', '计量单位', '数量', '单价', '金额', '税率', '税额', '价税合计', '开票日期'],
    [1, 'TEST-IN-002', '示例供应商有限公司', '示例服务A', 'A型', '项', 2, 50, 100, '6%', 6, 106, '2026-04-03'],
    ['', '', '', '示例服务B', 'B型', '项', 1, 200, 200, '6%', 12, 212, ''],
    ['合计', '', '', '', '', '', '', '', 300, '', 18, 318, ''],
    ['电子发票(普通发票)', 1, 0, 1],
  ];
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(data), '进项');
  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const result = financeImportService.parseInvoices(buf, 'input');

  assert.strictEqual(result.records.length, 1);
  assert.strictEqual(result.records[0].itemName, '示例服务A；示例服务B');
  assert.strictEqual(result.records[0].amount, 300);
  assert.strictEqual(result.records[0].tax, 18);
  assert.strictEqual(result.records[0].total, 318);
  assert.strictEqual(result.records[0].qty, null);
  assert.strictEqual(result.records[0].unitPrice, null);
  assert.strictEqual(result.errors.length, 0);
});

test('parseInvoices: 税务全量导出优先读取数电发票号码并聚合同票明细', () => {
  const xlsx = require('xlsx');
  const wb = xlsx.utils.book_new();
  const data = [
    ['序号', '发票代码', '发票号码', '数电发票号码', '销方名称', '购买方名称', '开票日期', '货物或应税劳务名称', '金额', '税额', '价税合计'],
    [1, '', '', '26312000000000000001', '示例供应商有限公司', '上海捷淞国际物流有限公司', '2026-07-01 10:00:00', '商品A', 100, 13, 113],
    [2, '', '', '26312000000000000001', '示例供应商有限公司', '上海捷淞国际物流有限公司', '2026-07-01 10:00:00', '商品B', 200, 26, 226],
  ];
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(data), '信息汇总表');
  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const result = financeImportService.parseInvoices(buf, 'all');

  assert.strictEqual(result.previewMapping.invNo, '数电发票号码');
  assert.strictEqual(result.records.length, 1);
  assert.strictEqual(result.records[0].invNo, '26312000000000000001');
  assert.strictEqual(result.records[0].itemName, '商品A；商品B');
  assert.strictEqual(result.records[0].amount, 300);
  assert.strictEqual(result.records[0].tax, 39);
  assert.strictEqual(result.records[0].total, 339);
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
