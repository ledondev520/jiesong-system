/**
 * Input: financialEvidenceService、示例工作簿与 Prisma 测试 Adapter
 * Output: 财务分析资料分类、脱敏、幂等导入和查询契约测试
 * Pos: 财务分析资料库服务测试
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const XLSX = require('xlsx');

const createPayrollBuffer = () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['工资明细'],
    ['序号', '姓名', '身份证号', '手机号码', '应发工资'],
    [1, '测试员工', '110101199001011234', '13800000000', 1000],
    [],
  ]);
  sheet.E3 = { t: 'n', v: 1100, f: 'E3+100' };
  XLSX.utils.book_append_sheet(workbook, sheet, '工资表');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[]]), '空白说明');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

test('classifyFinancialEvidenceFile: 区分专用 Module 与剩余分析资料', () => {
  const service = require('./financialEvidenceService');

  const inputInvoice = service.classifyFinancialEvidenceFile('示例_2026年5账期_进项发票列表.xlsx');
  assert.equal(inputInvoice.category, 'INPUT_INVOICE');
  assert.equal(inputInvoice.handledElsewhere, true);

  const temporaryPayroll = service.classifyFinancialEvidenceFile('示例_2026年5账期_临时工资表.xls');
  assert.equal(temporaryPayroll.category, 'TEMP_PAYROLL');
  assert.equal(temporaryPayroll.handledElsewhere, false);
  assert.equal(temporaryPayroll.analysisScope, 'PAYROLL');

  const voucher = service.classifyFinancialEvidenceFile('示例_2026年5期-5期_凭证.xls');
  assert.equal(voucher.category, 'VOUCHER');
  assert.equal(voucher.handledElsewhere, false);
  assert.equal(voucher.analysisScope, 'LEDGER');
});

test('parseFinancialEvidenceSource: 只保留非空行并在持久化前脱敏个人字段', () => {
  const service = require('./financialEvidenceService');
  const parsed = service.parseFinancialEvidenceSource({
    buffer: createPayrollBuffer(),
    fileName: '示例_2026年5账期_工资表.xls',
    relativePath: '2026年5账期/示例_2026年5账期_工资表.xls',
  });

  assert.equal(parsed.category, 'PAYROLL');
  assert.equal(parsed.periodYear, 2026);
  assert.equal(parsed.periodMonth, 5);
  assert.equal(parsed.sourceSheetCount, 2);
  assert.equal(parsed.importedSheetCount, 1);
  assert.equal(parsed.rowCount, 3);
  assert.equal(parsed.sheets[0].formulaCellCount, 1);
  assert.ok(parsed.redactionCount >= 3);

  const dataRow = parsed.sheets[0].rows.find((row) => row.sourceRow === 3);
  const values = JSON.parse(dataRow.valuesJson);
  assert.equal(values[1], '<已脱敏>');
  assert.equal(values[2], '<已脱敏>');
  assert.equal(values[3], '<已脱敏>');
  assert.equal(values[4], 1100);
  assert.doesNotMatch(dataRow.searchText, /测试员工|110101199001011234|13800000000/);
});

test('importFinancialEvidenceDocuments: 内容和解析版本不变时幂等跳过', async () => {
  const service = require('./financialEvidenceService');
  const parsed = service.parseFinancialEvidenceSource({
    buffer: createPayrollBuffer(),
    fileName: '示例_2026年5账期_工资表.xls',
    relativePath: '2026年5账期/示例_2026年5账期_工资表.xls',
  });
  let transactionCalled = false;
  const db = {
    financialEvidenceDocument: {
      findUnique: async () => ({
        id: 'existing-document',
        contentSha256: parsed.contentSha256,
        parseVersion: parsed.parseVersion,
      }),
    },
    $transaction: async () => {
      transactionCalled = true;
      throw new Error('unchanged evidence must not write');
    },
  };

  const result = await service.importFinancialEvidenceDocuments([parsed], db);

  assert.deepEqual(result, { imported: 0, replaced: 0, skipped: 1, documents: [] });
  assert.equal(transactionCalled, false);
});

test('importFinancialEvidenceDocuments: 新来源的文档、Sheet 与行在一个事务内写入', async () => {
  const service = require('./financialEvidenceService');
  const parsed = service.parseFinancialEvidenceSource({
    buffer: createPayrollBuffer(),
    fileName: '示例_2026年5账期_工资表.xls',
    relativePath: '2026年5账期/示例_2026年5账期_工资表.xls',
  });
  const writes = [];
  const tx = {
    financialPeriod: { findUnique: async () => ({ id: 'period-2026-5' }) },
    financialEvidenceDocument: {
      create: async ({ data }) => {
        writes.push(['document', data]);
        return { id: 'document-1' };
      },
    },
    financialEvidenceSheet: {
      create: async ({ data }) => {
        writes.push(['sheet', data]);
        return { id: 'sheet-1' };
      },
    },
    financialEvidenceRow: {
      createMany: async ({ data }) => {
        writes.push(['rows', data]);
        return { count: data.length };
      },
    },
  };
  const db = {
    financialEvidenceDocument: { findUnique: async () => null },
    $transaction: async (callback) => callback(tx),
  };

  const result = await service.importFinancialEvidenceDocuments([parsed], db);

  assert.equal(result.imported, 1);
  assert.equal(result.replaced, 0);
  assert.equal(result.skipped, 0);
  assert.deepEqual(writes.map(([type]) => type), ['document', 'sheet', 'rows']);
  assert.equal(writes[0][1].periodId, 'period-2026-5');
  assert.equal(writes[2][1].length, 3);
});

test('importFinancialEvidenceDocuments: 来源内容变化时在同一事务替换旧 Sheet', async () => {
  const service = require('./financialEvidenceService');
  const parsed = service.parseFinancialEvidenceSource({
    buffer: createPayrollBuffer(),
    fileName: '示例_2026年5账期_工资表.xls',
    relativePath: '2026年5账期/示例_2026年5账期_工资表.xls',
  });
  const writes = [];
  const tx = {
    financialPeriod: { findUnique: async () => ({ id: 'period-2026-5' }) },
    financialEvidenceDocument: {
      update: async ({ where, data }) => {
        writes.push(['update-document', where, data]);
        return { id: 'existing-document' };
      },
    },
    financialEvidenceSheet: {
      deleteMany: async ({ where }) => { writes.push(['delete-sheets', where]); },
      create: async ({ data }) => {
        writes.push(['create-sheet', data]);
        return { id: 'replacement-sheet' };
      },
    },
    financialEvidenceRow: {
      createMany: async ({ data }) => { writes.push(['create-rows', data]); },
    },
  };
  const db = {
    financialEvidenceDocument: {
      findUnique: async () => ({ id: 'existing-document', contentSha256: 'old-hash', parseVersion: parsed.parseVersion }),
    },
    $transaction: async (callback) => callback(tx),
  };

  const result = await service.importFinancialEvidenceDocuments([parsed], db);

  assert.deepEqual(writes.map(([type]) => type), ['delete-sheets', 'update-document', 'create-sheet', 'create-rows']);
  assert.equal(result.imported, 0);
  assert.equal(result.replaced, 1);
  assert.equal(result.skipped, 0);
});
