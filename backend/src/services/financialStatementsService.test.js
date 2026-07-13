/**
 * Input: financialStatementsService、ExcelJS 工作簿与 Prisma 测试 Adapter
 * Output: 月度会计报表预览确认契约测试
 * Pos: 财务报表服务测试，锁住只读预览、覆盖确认和事务写入 Interface
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const ExcelJS = require('exceljs');
const XLSX = require('xlsx');

const createStatementBuffer = async ({ balanced = true, blankRevenueCost = false } = {}) => {
  const workbook = new ExcelJS.Workbook();
  const balanceSheet = workbook.addWorksheet('资产负债表');
  balanceSheet.getRow(4).getCell(2).value = 30;
  balanceSheet.getRow(4).getCell(3).value = 1000;
  balanceSheet.getRow(5).getCell(6).value = 47;
  balanceSheet.getRow(5).getCell(7).value = 400;
  balanceSheet.getRow(6).getCell(6).value = 52;
  balanceSheet.getRow(6).getCell(7).value = balanced ? 600 : 500;
  balanceSheet.getRow(7).getCell(2).value = 1;
  balanceSheet.getRow(7).getCell(3).value = 300;

  const incomeStatement = workbook.addWorksheet('利润表');
  incomeStatement.getRow(4).getCell(2).value = 1;
  incomeStatement.getRow(4).getCell(3).value = 5000;
  incomeStatement.getRow(4).getCell(4).value = blankRevenueCost ? null : 800;
  incomeStatement.getRow(5).getCell(2).value = 2;
  incomeStatement.getRow(5).getCell(3).value = 3200;
  incomeStatement.getRow(5).getCell(4).value = blankRevenueCost ? null : 500;
  incomeStatement.getRow(6).getCell(2).value = 32;
  incomeStatement.getRow(6).getCell(3).value = 900;
  incomeStatement.getRow(6).getCell(4).value = 120;

  return Buffer.from(await workbook.xlsx.writeBuffer());
};

const createBundleStatementBuffer = async ({ period = '2026-07', includeCashFlow = true } = {}) => {
  const workbook = new ExcelJS.Workbook();
  const balanceSheet = workbook.addWorksheet('资产负债表');
  balanceSheet.getRow(3).getCell(1).value = '企业名称: 示例国际物流有限公司';
  balanceSheet.getRow(3).getCell(5).value = `${period}-31`;
  balanceSheet.getRow(4).getCell(2).value = 30;
  balanceSheet.getRow(4).getCell(3).value = 1000;
  balanceSheet.getRow(5).getCell(6).value = 47;
  balanceSheet.getRow(5).getCell(7).value = 400;
  balanceSheet.getRow(6).getCell(6).value = 52;
  balanceSheet.getRow(6).getCell(7).value = 600;
  balanceSheet.getRow(7).getCell(2).value = 1;
  balanceSheet.getRow(7).getCell(3).value = 300;

  const incomeStatement = workbook.addWorksheet('利润表');
  incomeStatement.getRow(2).getCell(1).value = '企业名称: 示例国际物流有限公司';
  incomeStatement.getRow(2).getCell(2).value = period;
  incomeStatement.getRow(4).getCell(1).value = '营业收入';
  incomeStatement.getRow(4).getCell(2).value = 1;
  incomeStatement.getRow(4).getCell(3).value = 5000;
  incomeStatement.getRow(4).getCell(4).value = 800;
  incomeStatement.getRow(5).getCell(1).value = '营业成本';
  incomeStatement.getRow(5).getCell(2).value = 2;
  incomeStatement.getRow(5).getCell(3).value = 3200;
  incomeStatement.getRow(5).getCell(4).value = 500;
  incomeStatement.getRow(6).getCell(1).value = '净利润';
  incomeStatement.getRow(6).getCell(2).value = 32;
  incomeStatement.getRow(6).getCell(3).value = 900;
  incomeStatement.getRow(6).getCell(4).value = 120;

  if (includeCashFlow) {
    const cashFlow = workbook.addWorksheet('现金流量表');
    cashFlow.getRow(3).getCell(1).value = '企业名称: 示例国际物流有限公司';
    cashFlow.getRow(3).getCell(2).value = period;
    const cashRows = [
      ['项目', '行次', '本年累计金额', '本月金额'],
      ['经营活动产生的现金流量净额', 7, 300, 50],
      ['现金净增加额', 20, 20, -10],
      ['期初现金余额', 21, 280, 310],
      ['期末现金余额', 22, 300, 300],
    ];
    cashRows.forEach((values, index) => {
      values.forEach((value, column) => {
        cashFlow.getRow(index + 4).getCell(column + 1).value = value;
      });
    });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

const createTrialBalanceBuffer = ({ period = '2026年07月-2026年07月' } = {}) => {
  const rows = [
    ['科目余额表'],
    ['核算单位: 示例国际物流有限公司', null, null, `期间: ${period}`, null, null, null, '单位：元'],
    ['科目编码', '科目名称', '期初余额', null, '本期发生额', null, '本年累计发生额', null, '期末余额', null],
    [null, null, '借方', '贷方', '借方', '贷方', '借方', '贷方', '借方', '贷方'],
    ['1002', '银行存款', 300, 0, 100, 50, 100, 50, 350, 0],
    ['2202', '应付账款', 0, 400, 20, 40, 20, 40, 0, 420],
    [null, '总计', 1000, 1000, 500, 500, 2000, 2000, 1500, 1500],
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '科目余额表');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'biff8' });
};

const createGeneralLedgerBuffer = ({ period = '2026年7月-2026年7月' } = {}) => {
  const rows = [
    ['明细账'],
    ['编制单位：示例国际物流有限公司', null, null, `期间：${period}`, null, null, '单位：元'],
    ['科目编码', '科目名称', '日期', '凭证号', '摘要', '借方', '贷方', '方向', '余额'],
    ['1002', '银行存款', '2026-07-01', null, '期初余额', null, null, '借', 300],
    ['1002', '银行存款', '2026-07-10', '记-1', '收款', 100, null, '借', 400],
    ['1002', '银行存款', '2026-07-31', null, '本期合计', 100, 50, '借', 350],
    ['2202', '应付账款', '2026-07-01', null, '期初余额', null, null, '贷', 400],
    ['2202', '应付账款', '2026-07-31', null, '本期合计', 20, 40, '贷', 420],
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '明细账');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

const createBundleSources = async (options = {}) => ({
  statement: {
    buffer: await createBundleStatementBuffer(options),
    fileName: '2026-07-会计报表.xlsx',
  },
  trialBalance: {
    buffer: createTrialBalanceBuffer(options),
    fileName: '2026-07-科目余额.xls',
  },
  generalLedger: {
    buffer: createGeneralLedgerBuffer(options),
    fileName: '2026-07-明细账.xlsx',
  },
});

test('previewFromBuffer: 只解析不写库并返回账期、平衡校验和成本摘要', async () => {
  const service = require('./financialStatementsService');
  const buffer = await createStatementBuffer();
  let transactionCalled = false;
  const db = {
    financialPeriod: { findUnique: async () => null },
    $transaction: async () => {
      transactionCalled = true;
      throw new Error('preview must not write');
    },
  };

  const preview = await service.previewFromBuffer(buffer, 2026, 7, '2026年7账期', db);

  assert.equal(transactionCalled, false);
  assert.equal(preview.ready, true);
  assert.equal(preview.period.existing, false);
  assert.equal(preview.summary.totalAssets, 1000);
  assert.equal(preview.summary.accountingEquationDifference, 0);
  assert.equal(preview.summary.revenueMonth, 800);
  assert.equal(preview.summary.costOfSalesMonth, 500);
  assert.equal(preview.summary.netProfitMonth, 120);
  assert.match(preview.previewId, /^[a-f0-9]{64}$/);
});

test('previewFromBuffer: 资产负债表不平时阻止确认', async () => {
  const service = require('./financialStatementsService');
  const preview = await service.previewFromBuffer(
    await createStatementBuffer({ balanced: false }),
    2026,
    7,
    '2026年7账期',
    { financialPeriod: { findUnique: async () => null } },
  );

  assert.equal(preview.ready, false);
  assert.equal(preview.summary.accountingEquationDifference, 100);
  assert.ok(preview.blockers.some((message) => message.includes('资产负债表不平衡')));
});

test('previewFromBuffer: 空白收入或成本保留复核提示但不伪造数值或阻止空账期', async () => {
  const service = require('./financialStatementsService');
  const preview = await service.previewFromBuffer(
    await createStatementBuffer({ blankRevenueCost: true }),
    2026,
    7,
    '2026年7账期',
    { financialPeriod: { findUnique: async () => null } },
  );

  assert.equal(preview.ready, true);
  assert.equal(preview.summary.revenueMonth, null);
  assert.equal(preview.summary.costOfSalesMonth, null);
  assert.ok(preview.warnings.some((message) => message.includes('本月营业收入')));
  assert.ok(preview.warnings.some((message) => message.includes('本月营业成本')));
});

test('confirmImportFromBuffer: 同账期必须明确确认覆盖且在一个事务内写入', async () => {
  const service = require('./financialStatementsService');
  const buffer = await createStatementBuffer();
  const writes = [];
  const tx = {
    financialPeriod: {
      upsert: async (args) => {
        writes.push(['period', args]);
        return { id: 'period-1' };
      },
    },
    balanceSheetEntry: {
      upsert: async (args) => writes.push(['balance', args]),
    },
    incomeStatementEntry: {
      upsert: async (args) => writes.push(['income', args]),
    },
  };
  let transactionCount = 0;
  const db = {
    financialPeriod: { findUnique: async () => ({ id: 'existing-period' }) },
    $transaction: async (callback) => {
      transactionCount += 1;
      return callback(tx);
    },
  };
  const preview = await service.previewFromBuffer(buffer, 2026, 7, '2026年7账期', db);

  await assert.rejects(
    () => service.confirmImportFromBuffer(
      buffer,
      2026,
      7,
      '2026年7账期',
      { previewId: preview.previewId, allowOverwrite: false },
      db,
    ),
    /明确确认覆盖/,
  );
  assert.equal(transactionCount, 0);

  const result = await service.confirmImportFromBuffer(
    buffer,
    2026,
    7,
    '2026年7账期',
    { previewId: preview.previewId, allowOverwrite: true },
    db,
  );

  assert.equal(result.imported, 1);
  assert.equal(result.overwritten, true);
  assert.equal(transactionCount, 1);
  assert.deepEqual(writes.map(([type]) => type), ['period', 'balance', 'income']);
});

test('confirmImportFromBuffer: 文件或账期变化后旧预览凭证失效', async () => {
  const service = require('./financialStatementsService');
  const buffer = await createStatementBuffer();
  const db = {
    financialPeriod: { findUnique: async () => null },
    $transaction: async () => { throw new Error('must not write'); },
  };
  const preview = await service.previewFromBuffer(buffer, 2026, 7, '2026年7账期', db);

  await assert.rejects(
    () => service.confirmImportFromBuffer(
      buffer,
      2026,
      8,
      '2026年8账期',
      { previewId: preview.previewId, allowOverwrite: false },
      db,
    ),
    /预览已失效/,
  );
});

test('previewBundleFromBuffers: 三份来源只读解析并返回现金流、科目余额和明细账摘要', async () => {
  const service = require('./financialStatementsService');
  const preview = await service.previewBundleFromBuffers(
    await createBundleSources(),
    2026,
    7,
    '2026年7账期',
    { financialPeriod: { findUnique: async () => null } },
  );

  assert.equal(preview.ready, true);
  assert.equal(preview.summary.cashFlowFieldCount, 8);
  assert.equal(preview.summary.accountBalanceRowCount, 3);
  assert.equal(preview.summary.generalLedgerRowCount, 5);
  assert.equal(preview.summary.sourceFileCount, 3);
  assert.equal(preview.summary.trialBalanceChecks.periodDifference, 0);
  assert.equal(preview.summary.trialBalanceChecks.endingDifference, 0);
  assert.equal(preview.sources.length, 3);
  assert.ok(preview.sources.every((source) => /^[a-f0-9]{64}$/.test(source.sha256)));
  assert.match(preview.previewId, /^[a-f0-9]{64}$/);
});

test('previewBundleFromBuffers: 任一来源账期不同即阻止确认', async () => {
  const service = require('./financialStatementsService');
  const sources = await createBundleSources();
  sources.generalLedger = {
    buffer: createGeneralLedgerBuffer({ period: '2026年8月-2026年8月' }),
    fileName: '2026-08-明细账.xlsx',
  };

  const preview = await service.previewBundleFromBuffers(
    sources,
    2026,
    7,
    '2026年7账期',
    { financialPeriod: { findUnique: async () => null } },
  );

  assert.equal(preview.ready, false);
  assert.ok(preview.blockers.some((message) => message.includes('明细账账期')));
});

test('previewBundleFromBuffers: 历史月报没有现金流量表时保留为空并提示但允许导入其余真实数据', async () => {
  const service = require('./financialStatementsService');
  const sources = await createBundleSources({ includeCashFlow: false });
  const preview = await service.previewBundleFromBuffers(
    sources,
    2026,
    7,
    '2026年7账期',
    { financialPeriod: { findUnique: async () => null } },
  );

  assert.equal(preview.ready, true);
  assert.equal(preview.summary.cashFlowFieldCount, 0);
  assert.equal(preview.cashFlowStatement, null);
  assert.ok(preview.warnings.some((message) => message.includes('现金流量表')));
});

test('confirmBundleImportFromBuffers: 六类账期数据与来源元数据在同一事务覆盖写入', async () => {
  const service = require('./financialStatementsService');
  const sources = await createBundleSources();
  const writes = [];
  const tx = {
    financialPeriod: {
      upsert: async () => {
        writes.push('period');
        return { id: 'period-1' };
      },
    },
    balanceSheetEntry: { upsert: async () => writes.push('balance') },
    incomeStatementEntry: { upsert: async () => writes.push('income') },
    cashFlowStatementEntry: { upsert: async () => writes.push('cash-flow') },
    accountBalanceEntry: {
      deleteMany: async () => writes.push('account-delete'),
      createMany: async ({ data }) => writes.push(`account-create:${data.length}`),
    },
    generalLedgerEntry: {
      deleteMany: async () => writes.push('ledger-delete'),
      createMany: async ({ data }) => writes.push(`ledger-create:${data.length}`),
    },
    financialDataSource: {
      deleteMany: async () => writes.push('source-delete'),
      createMany: async ({ data }) => writes.push(`source-create:${data.length}`),
    },
  };
  const db = {
    financialPeriod: { findUnique: async () => null },
    $transaction: async (callback) => callback(tx),
  };
  const preview = await service.previewBundleFromBuffers(sources, 2026, 7, '2026年7账期', db);
  const result = await service.confirmBundleImportFromBuffers(
    sources,
    2026,
    7,
    '2026年7账期',
    { previewId: preview.previewId },
    db,
  );

  assert.equal(result.imported, 3);
  assert.deepEqual(writes, [
    'period',
    'balance',
    'income',
    'cash-flow',
    'account-delete',
    'account-create:3',
    'ledger-delete',
    'ledger-create:5',
    'source-delete',
    'source-create:3',
  ]);
});

test('getPeriodDetail: 账期下钻按源行返回现金流、科目余额、明细账和来源校验', async () => {
  const service = require('./financialStatementsService');
  let query;
  const db = {
    financialPeriod: {
      findUnique: async (args) => {
        query = args;
        return { id: 'period-1' };
      },
    },
  };

  await service.getPeriodDetail(2026, 6, db);

  assert.deepEqual(query.where, { year_month: { year: 2026, month: 6 } });
  assert.equal(query.include.cashFlowStatement, true);
  assert.deepEqual(query.include.accountBalances, { orderBy: { sourceRow: 'asc' } });
  assert.deepEqual(query.include.generalLedgerEntries, { orderBy: { sourceRow: 'asc' } });
  assert.deepEqual(query.include.dataSources, { orderBy: { type: 'asc' } });
});
