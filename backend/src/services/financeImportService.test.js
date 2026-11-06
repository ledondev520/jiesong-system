/**
 * Input: financeImportService 模块
 * Output: 模块导出冒烟测试 + 核心解析逻辑测试
 * Pos: 财务导入服务自动测试
 */

const test = require('node:test');
const xlsx = require('xlsx');
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

test('parseBankStatement: 识别标题行后的招商银行美元收支记录并保留账户元数据', () => {
  const xlsx = require('xlsx');
  const wb = xlsx.utils.book_new();
  const data = [
    ['2025-01-01至2025-12-31收支记录汇总'],
    ['付方账户', '付方名称', '付方开户行', '付方账户币种', '收方账户', '收方名称', '收方开户银行', '收方账户币种', '交易金额', '余额', '交易时间', '交易流水号', '交易类型', '摘要'],
    ['***********2001', '上海捷淞国际物流有限公司', '上海分行', '美元', '***********0001', '上海捷淞国际物流有限公司', '招商银行上海浦江镇支行', '美元', -1000, 19000, '2025-01-03 09:01:02', 'USD-OUT-001', '对公结汇', '测试结汇'],
    ['********4362', '示例境外客户', '境外银行', '美元', '***********2001', '上海捷淞国际物流有限公司', '上海分行', '美元', 20000, 20000, '2025-01-02 16:16:20', 'USD-IN-001', '国际结算解付款项', '测试汇入'],
  ];
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(data), '美元流水');
  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const result = financeImportService.parseBankStatement(buf, 'GENERIC');

  assert.strictEqual(result.headerRow, 2);
  assert.strictEqual(result.records.length, 2);
  assert.strictEqual(result.errors.length, 0);
  assert.strictEqual(result.records[0].txnTime, '2025-01-03 09:01:02');
  assert.strictEqual(result.records[0].currency, 'USD');
  assert.strictEqual(result.records[0].accountNoMasked, '****2001');
  assert.strictEqual(result.records[0].direction, 'OUT');
  assert.strictEqual(result.records[0].counterpart, '上海捷淞国际物流有限公司');
  assert.strictEqual(result.records[1].currency, 'USD');
  assert.strictEqual(result.records[1].accountNoMasked, '****2001');
  assert.strictEqual(result.records[1].direction, 'IN');
  assert.strictEqual(result.records[1].counterpart, '示例境外客户');
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

test('importBankTransactions: 跨币种不误判重复、票据号复用不误删且同批次精确重复会跳过', async (t) => {
  const prisma = require('../utils/prisma');
  const originalFindMany = prisma.bankTransaction.findMany;
  const originalCreateMany = prisma.bankTransaction.createMany;
  const originalBatchCreate = prisma.financeDataBatch.create;
  const originalTransaction = prisma.$transaction;
  prisma.$transaction = async (fn) => fn(prisma);
  t.after(() => {
    prisma.$transaction = originalTransaction;
    prisma.bankTransaction.findMany = originalFindMany;
    prisma.bankTransaction.createMany = originalCreateMany;
    prisma.financeDataBatch.create = originalBatchCreate;
  });

  prisma.bankTransaction.findMany = async () => [{
    txnId: 'EXISTING-CNY',
    txnDate: '2026-04-10',
    amount: 68209,
    counterpart: '示例公司',
    balance: 79530.56,
    summary: '结汇',
    currency: 'CNY',
    accountNoMasked: null,
  }];
  let batchData;
  let createdRows = [];
  prisma.financeDataBatch.create = async ({ data }) => {
    batchData = data;
    return { id: 'batch-usd' };
  };
  prisma.bankTransaction.createMany = async ({ data }) => {
    createdRows = createdRows.concat(data);
    return { count: data.length };
  };

  const shared = {
    txnTime: '2026-04-10',
    txnDate: '2026-04-10',
    amount: 68209,
    payer: '示例公司',
    payee: '上海捷淞国际物流有限公司',
    summary: '结汇',
    txnType: '中心收汇',
    balance: 79530.56,
    counterpart: '示例公司',
    direction: 'IN',
    bankName: '示例银行',
  };
  const result = await financeImportService.importBankTransactions([
    { ...shared, txnId: 'PDF-CNY', currency: 'CNY', accountNoMasked: '0001' },
    { ...shared, txnId: 'PDF-USD', currency: 'USD', accountNoMasked: '****2001' },
    { ...shared, txnId: 'PDF-USD', currency: 'USD', accountNoMasked: '****2001' },
    { ...shared, txnId: 'PDF-USD', amount: -68209, direction: 'OUT', summary: '退回', currency: 'USD', accountNoMasked: '****2001' },
  ], 'statement.pdf', 'test');

  assert.strictEqual(result.success, 2);
  assert.strictEqual(result.skipped, 2);
  assert.strictEqual(batchData.recordCount, 2);
  assert.strictEqual(createdRows.length, 2);
  assert.strictEqual(createdRows[0].currency, 'USD');
  assert.strictEqual(createdRows[0].accountNoMasked, '****2001');
  assert.strictEqual(createdRows[1].amount, -68209);
});

test('importBankTransactions: PDF与Excel流水号摘要不同但余额轨迹一致时跳过跨来源重复', async (t) => {
  const prisma = require('../utils/prisma');
  const originalFindMany = prisma.bankTransaction.findMany;
  const originalBatchCreate = prisma.financeDataBatch.create;
  const originalTransaction = prisma.$transaction;
  prisma.$transaction = async (fn) => fn(prisma);
  t.after(() => {
    prisma.$transaction = originalTransaction;
    prisma.bankTransaction.findMany = originalFindMany;
    prisma.financeDataBatch.create = originalBatchCreate;
  });

  prisma.bankTransaction.findMany = async () => [{
    txnId: 'PDF-USD-001',
    txnDate: '2025-03-15',
    amount: 12345.67,
    counterpart: '示例境外客户',
    balance: 23456.78,
    summary: 'PDF摘要',
    currency: 'USD',
    accountNoMasked: '****2001',
  }];
  prisma.financeDataBatch.create = async () => {
    throw new Error('跨来源重复不应创建新批次');
  };

  const result = await financeImportService.importBankTransactions([{
    txnTime: '2025-03-15 09:30:00',
    txnDate: '2025-03-15',
    amount: 12345.67,
    payer: '示例境外客户',
    payee: '上海捷淞国际物流有限公司',
    summary: 'Excel摘要不同',
    txnType: '国际结算解付款项',
    txnId: 'EXCEL-USD-999',
    balance: 23456.78,
    counterpart: '示例境外客户',
    direction: 'IN',
    bankName: '招商银行股份有限公司',
    currency: '美元',
    accountNoMasked: '2001',
  }], 'usd.xlsx', 'test');

  assert.strictEqual(result.success, 0);
  assert.strictEqual(result.skipped, 1);
  assert.strictEqual(result.batchId, null);
});

test('importBankTransactions: 同日同额两笔无流水号转账都入库，重导同一文件全部跳过；历史无账号行每条只抵消一条', async (t) => {
  const prisma = require('../utils/prisma');
  const saved = [prisma.$transaction, prisma.bankTransaction.findMany, prisma.bankTransaction.createMany, prisma.financeDataBatch.create];
  t.after(() => { [prisma.$transaction, prisma.bankTransaction.findMany, prisma.bankTransaction.createMany, prisma.financeDataBatch.create] = saved; });
  prisma.$transaction = async (fn) => fn(prisma);
  let store = [];
  prisma.bankTransaction.findMany = async () => store.map((r) => ({ ...r }));
  prisma.bankTransaction.createMany = async ({ data }) => { store = store.concat(data); return { count: data.length }; };
  prisma.financeDataBatch.create = async () => ({ id: 'b' });
  const row = { txnDate: '2026-05-01', txnTime: '2026-05-01', amount: -20000, counterpart: '示例供应商', direction: 'OUT', currency: 'CNY', accountNoMasked: '****1234', balance: null, txnId: null };
  const first = await financeImportService.importBankTransactions([row, { ...row }], 'a.xlsx', 't');
  assert.strictEqual(first.success, 2);
  const again = await financeImportService.importBankTransactions([row, { ...row }], 'a.xlsx', 't');
  assert.strictEqual(again.success, 0);
  assert.strictEqual(again.skipped, 2);

  // 历史一条无账号行只能抵消新文件里的一条，另一笔同日同额转账保留
  store = [{ ...row, accountNoMasked: null }];
  const legacy = await financeImportService.importBankTransactions([row, { ...row }], 'b.xlsx', 't');
  assert.strictEqual(legacy.success, 1);
  assert.strictEqual(legacy.skipped, 1);
});

test('importBankTransactions: 去重不受 50000 行截断，按文件日期范围查询', async (t) => {
  const prisma = require('../utils/prisma');
  const saved = [prisma.$transaction, prisma.bankTransaction.findMany];
  t.after(() => { [prisma.$transaction, prisma.bankTransaction.findMany] = saved; });
  prisma.$transaction = async (fn) => fn(prisma);
  let args;
  prisma.bankTransaction.findMany = async (a) => { args = a; return []; };
  prisma.financeDataBatch.create = async () => ({ id: 'b' });
  prisma.bankTransaction.createMany = async ({ data }) => ({ count: data.length });
  await financeImportService.importBankTransactions([{ txnDate: '2026-05-02', amount: 1, counterpart: 'x', currency: 'CNY', txnId: 'T1' }], 'a.xlsx', 't');
  assert.strictEqual(args.take, undefined);
  assert.deepStrictEqual(args.where.txnDate, { gte: '2026-05-02', lte: '2026-05-02' });
});

test('importBankTransactions / importInvoiceRecords: 任一块写入失败整体回滚由事务承担（写入走 tx 客户端）', async (t) => {
  const prisma = require('../utils/prisma');
  const saved = prisma.$transaction;
  t.after(() => { prisma.$transaction = saved; });
  let used = 0;
  prisma.$transaction = async (fn, opts) => { used += 1; assert.ok(opts.timeout >= 60000); return fn({
    bankTransaction: { findMany: async () => [], createMany: async () => { throw new Error('boom'); } },
    invoiceRecord: { findMany: async () => [], createMany: async () => { throw new Error('boom'); } },
    financeDataBatch: { create: async () => ({ id: 'b' }) },
  }); };
  await assert.rejects(financeImportService.importBankTransactions([{ txnDate: '2026-05-02', amount: 1, counterpart: 'x', currency: 'CNY', txnId: 'T1' }], 'a', 't'), /boom/);
  await assert.rejects(financeImportService.importInvoiceRecords([{ invCode: 'C', invNo: '1', invDate: '2026-05-02' }], 'a', 't'), /boom/);
  assert.strictEqual(used, 2);
});

test('importInvoiceRecords: 同一工作簿内重复发票只入一条', async (t) => {
  const prisma = require('../utils/prisma');
  const saved = prisma.$transaction;
  t.after(() => { prisma.$transaction = saved; });
  let created = [];
  prisma.$transaction = async (fn) => fn({
    invoiceRecord: { findMany: async () => [], createMany: async ({ data }) => { created = created.concat(data); return { count: data.length }; } },
    financeDataBatch: { create: async () => ({ id: 'b' }) },
  });
  const r = { invCode: 'C1', invNo: '001', invDate: '2026-05-02' };
  const res = await financeImportService.importInvoiceRecords([r, { ...r }], 'a', 't');
  assert.strictEqual(res.success, 1);
  assert.strictEqual(res.skipped, 1);
});

test('parseBankStatement: 错误行回显只保留账号末4位', () => {
  const wb = xlsx.utils.book_new();
  const data = [['交易日期', '收入', '支出', '对方户名', '付款账号'], ['不是日期', 100, '', '示例公司', '6222020200112233445']];
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(data), 'Sheet1');
  const result = financeImportService.parseBankStatement(xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }), 'GENERIC');
  assert.strictEqual(result.errors.length, 1);
  const text = JSON.stringify(result.errors);
  assert.ok(!text.includes('6222020200112233445'));
  assert.ok(text.includes('***************3445'));
});

// 合成 ZIP：一个 deflate 条目，解压后 8 MiB 全零（压缩比远超 1000）
const zipOf = (name, data, level = 9) => {
  const AdmZip = require('adm-zip');
  const zip = new AdmZip();
  zip.addFile(name, data);
  return zip.toBuffer();
};

test('parseBankStatement/parseInvoices: 高压缩比 ZIP 炸弹在 SheetJS 解压前被拒绝', () => {
  const bomb = zipOf('xl/worksheets/sheet1.xml', Buffer.alloc(8 * 1024 * 1024));
  assert.ok(bomb.length < 20 * 1024);
  for (const parse of [financeImportService.parseBankStatement, financeImportService.parseInvoices]) {
    assert.throws(() => parse(bomb, 'generic'), (e) => e.statusCode === 400 && /Office 文件/.test(e.message));
  }
});

test('parseBankStatement: <dimension> 声明超大范围的小文件在 sheet_to_json 前被拒绝', () => {
  const ws = xlsx.utils.aoa_to_sheet([['日期', '金额'], ['2026-01-01', 1]]);
  ws['!ref'] = 'A1:Z1048576';
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'S');
  const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  assert.throws(() => financeImportService.parseBankStatement(buffer, 'generic'), (e) => e.statusCode === 400 && /行列限制/.test(e.message));
});
