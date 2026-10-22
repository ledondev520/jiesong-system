/** Input: synthetic portable records. Output: transfer validation and integrity checks. Pos: transfer contract tests. */
const test = require('node:test');
const assert = require('node:assert/strict');

function sample() {
  return {
    sourceKey: '1'.repeat(64), contentSha256: '2'.repeat(64), parseVersion: 'manual-tax-reconciliation-v1',
    relativePath: '合成核验/说明.md', fileName: '合成说明.md', fileSize: 12,
    category: 'TAX_RECONCILIATION', categoryLabel: '税费核验记录（非申报回执）', analysisScope: 'TAX',
    periodYear: 2026, periodMonth: 9, sourceSheetCount: 0, importedSheetCount: 1,
    rowCount: 2, numericCellCount: 1, textCellCount: 3, redactionCount: 0, originalArchived: false,
    sheets: [{ sheetIndex: 0, sheetName: '汇总', sourceRange: null, rowCount: 2, columnCount: 2,
      nonEmptyCellCount: 4, formulaCellCount: 0, numericCellCount: 1, textCellCount: 3, redactionCount: 0,
      rows: [
        { sourceRow: 1, rowKind: 'HEADER', values: ['项目', '金额'], redactionCount: 0 },
        { sourceRow: 2, rowKind: 'DATA', values: ['合成税费', 12.34], redactionCount: 0 },
      ] }],
  };
}

test('迁移包保留结构化值、仅允许指定资料类型且拒绝篡改/未知字段', () => {
  const service = require('./financialEvidenceTransferService');
  const doc = sample();
  const bundle = service.createBundle([doc]);
  assert.deepEqual(service.validateBundle(bundle).documents, [doc]);
  const changed = structuredClone(bundle);
  changed.documents[0].sheets[0].rows[1].values[1] = 99;
  assert.throws(() => service.validateBundle(changed), /校验/);
  assert.throws(() => service.createBundle([{ ...doc, periodId: 'local-id' }]), /字段/);
  assert.throws(() => service.createBundle([{ ...doc, category: 'PAYROLL' }]), /类型/);
  assert.throws(() => service.createBundle([doc, doc]), /重复/);
});

test('迁移包拒绝计数错误、重复物理行及错误累计期间', () => {
  const service = require('./financialEvidenceTransferService');
  assert.throws(() => service.createBundle([{ ...sample(), rowCount: 10 }]), /计数/);
  const duplicate = sample();
  duplicate.sheets[0].rows[1].sourceRow = 1;
  assert.throws(() => service.createBundle([duplicate]), /行号/);
  const cumulative = { ...sample(), category: 'GENERAL_LEDGER_CUMULATIVE_SNAPSHOT', parseVersion: 'financial-snapshot-v1', analysisScope: 'LEDGER' };
  assert.throws(() => service.createBundle([cumulative]), /累计/);
});
