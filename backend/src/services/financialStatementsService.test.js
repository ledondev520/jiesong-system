/**
 * Input: financialStatementsService、ExcelJS 工作簿与 Prisma 测试 Adapter
 * Output: 月度会计报表预览确认契约测试
 * Pos: 财务报表服务测试，锁住只读预览、覆盖确认和事务写入 Interface
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const ExcelJS = require('exceljs');

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
