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

test('累计期间可位于前三个物理表头行任意单元格，保留空行和起始行偏移', () => {
  const service = require('./financialEvidenceTransferService');
  for (const [firstRow, headerOffset, values] of [
    [1, 1, ['合成单位', '期间：2026年1月-2026年9月']],
    [1, 2, ['2026-01', null, '2026-09']],
    [5, 1, [null, null, null, '期间：2026年1月-2026年9月']],
  ]) {
    const doc = sample();
    Object.assign(doc, { category: 'GENERAL_LEDGER_CUMULATIVE_SNAPSHOT', parseVersion: 'financial-snapshot-v1',
      analysisScope: 'LEDGER', periodMonth: null, categoryLabel: '明细账（2026年1—9月累计快照）', numericCellCount: 0 });
    const sheet = doc.sheets[0];
    Object.assign(sheet, { sheetName: '明细账', sourceRange: `A${firstRow}:D${firstRow + 3}`, columnCount: 4,
      numericCellCount: 0, rows: [
        { sourceRow: firstRow + headerOffset, rowKind: 'HEADER', values, redactionCount: 0 },
        { sourceRow: firstRow + 3, rowKind: 'DATA', values: ['合成记录'], redactionCount: 0 },
      ] });
    sheet.textCellCount = values.filter(v => typeof v === 'string').length + 1;
    sheet.nonEmptyCellCount = sheet.textCellCount;
    doc.textCellCount = sheet.textCellCount;
    assert.deepEqual(service.validateBundle(service.createBundle([doc])).documents, [doc]);
    const outsideHeader = structuredClone(doc);
    outsideHeader.sheets[0].rows[0].sourceRow = firstRow + 3;
    outsideHeader.sheets[0].rows[1].sourceRow = firstRow + 4;
    assert.throws(() => service.createBundle([outsideHeader]), /累计区间/);
  }
});

test('同包同类别同内容的不同来源标识在查询目标前整批拒绝', async () => {
  const crypto = require('node:crypto');
  const service = require('./financialEvidenceTransferService');
  const doc = sample(), duplicate = { ...sample(), sourceKey: '3'.repeat(64) };
  assert.throws(() => service.createBundle([doc, duplicate]), /重复/);
  // 独立构造有效完整性哈希，证明预检不能只信任包的哈希而漏查批内冲突。
  const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
    : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
      : JSON.stringify(value);
  const payload = { format: service.createBundle([doc]).format, documents: [doc, duplicate] };
  const bundle = { ...payload, payloadSha256: crypto.createHash('sha256').update(canonical(payload)).digest('hex') };
  let queried = false;
  const db = { $transaction: async () => { queried = true; throw new Error('unexpected database access'); } };
  await assert.rejects(service.previewBundle(bundle, db, '4'.repeat(64)), /重复/);
  assert.equal(queried, false);
});
