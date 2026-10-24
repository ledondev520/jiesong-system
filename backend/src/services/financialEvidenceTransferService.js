/**
 * Input: 明确选择的财务资料、版本化结构化迁移包、目标库预检计划与 Prisma Adapter
 * Output: 可校验迁移包、只读计划、事务内仅新增/跳过结果；不含原始工作簿或数据库凭据
 * Pos: 财务资料跨机迁移核心；没有 update/delete/upsert，不改变业务账期及既有资料
 * Note: 更新时同步 backend/src/README.md、SECURITY.md、AGENTS.md 与数据分类。
 */
const crypto = require('node:crypto');

const FORMAT = 'jiesong-financial-evidence-transfer-v1';
const PLAN_FORMAT = 'jiesong-financial-evidence-transfer-plan-v1';
const DOC_FIELDS = ['sourceKey', 'contentSha256', 'parseVersion', 'relativePath', 'fileName', 'fileSize',
  'category', 'categoryLabel', 'analysisScope', 'periodYear', 'periodMonth', 'sourceSheetCount',
  'importedSheetCount', 'rowCount', 'numericCellCount', 'textCellCount', 'redactionCount', 'originalArchived'];
const SHEET_FIELDS = ['sheetIndex', 'sheetName', 'sourceRange', 'rowCount', 'columnCount',
  'nonEmptyCellCount', 'formulaCellCount', 'numericCellCount', 'textCellCount', 'redactionCount'];
const ROW_FIELDS = ['sourceRow', 'rowKind', 'values', 'redactionCount'];
const TYPES = {
  MONTHLY_STATEMENT_SNAPSHOT: ['financial-snapshot-v1', 'STATEMENT'],
  ACCOUNT_BALANCE_SNAPSHOT: ['financial-snapshot-v1', 'LEDGER'],
  GENERAL_LEDGER_CUMULATIVE_SNAPSHOT: ['financial-snapshot-v1', 'LEDGER'],
  GENERAL_LEDGER_MONTHLY_SNAPSHOT: ['financial-snapshot-v1', 'LEDGER'],
  TAX_RECONCILIATION: ['manual-tax-reconciliation-v1', 'TAX'],
};
const include = { sheets: { orderBy: { sheetIndex: 'asc' }, include: { rows: { orderBy: { sourceRow: 'asc' } } } } };
const fail = message => { const error = new Error(message); error.code = 'FINANCE_TRANSFER_VALIDATION'; throw error; };
const requireThat = (value, message) => { if (!value) fail(message); };
const integer = (v, min = 0, max = 10000000) => Number.isSafeInteger(v) && v >= min && v <= max;
const text = (v, max = 2000) => typeof v === 'string' && v.length > 0 && v.length <= max && !v.includes('\0');
const digest = value => crypto.createHash('sha256').update(canonical(value)).digest('hex');
const pick = (object, fields) => Object.fromEntries(fields.map(field => [field, object[field]]));

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

function exactFields(object, fields) {
  requireThat(object && typeof object === 'object' && !Array.isArray(object), '结构字段无效');
  requireThat(Object.keys(object).length === fields.length && fields.every(k => Object.hasOwn(object, k)), '存在缺失或不允许的字段');
}

function validateDocument(doc) {
  exactFields(doc, [...DOC_FIELDS, 'sheets']);
  const type = Object.hasOwn(TYPES, doc.category) && TYPES[doc.category];
  requireThat(type && doc.parseVersion === type[0] && doc.analysisScope === type[1], '资料类型或解析版本不受支持');
  for (const key of ['sourceKey', 'contentSha256']) requireThat(/^[a-f0-9]{64}$/.test(doc[key]), '来源标识格式无效');
  requireThat(text(doc.fileName, 500) && text(doc.relativePath, 2000) && text(doc.categoryLabel, 500), '来源字段无效');
  requireThat(doc.originalArchived === false, '迁移包不得包含原始附件归档');
  requireThat(integer(doc.periodYear, 2000, 2099), '资料年度无效');
  const cumulative = doc.category === 'GENERAL_LEDGER_CUMULATIVE_SNAPSHOT';
  requireThat(cumulative ? doc.periodMonth === null : integer(doc.periodMonth, 1, 12), '累计资料不能归入单月，单月资料须有有效账期');
  for (const field of ['fileSize', 'sourceSheetCount', 'importedSheetCount', 'rowCount', 'numericCellCount', 'textCellCount', 'redactionCount']) {
    requireThat(integer(doc[field]), '资料计数字段无效');
  }
  requireThat(Array.isArray(doc.sheets) && doc.sheets.length > 0 && doc.sheets.length <= 100, '工作表数量无效');
  let previousSheet = -1;
  for (const sheet of doc.sheets) {
    exactFields(sheet, [...SHEET_FIELDS, 'rows']);
    requireThat(integer(sheet.sheetIndex) && sheet.sheetIndex > previousSheet, '工作表索引重复或无序');
    previousSheet = sheet.sheetIndex;
    requireThat(text(sheet.sheetName, 200) && (sheet.sourceRange === null || text(sheet.sourceRange, 200)), '工作表字段无效');
    requireThat(integer(sheet.columnCount, 1, 512), '列数无效');
    requireThat(Array.isArray(sheet.rows) && sheet.rows.length > 0 && sheet.rows.length <= 200000, '行数无效');
    for (const field of ['rowCount', 'nonEmptyCellCount', 'formulaCellCount', 'numericCellCount', 'textCellCount', 'redactionCount']) {
      requireThat(integer(sheet[field]), '工作表计数字段无效');
    }
    let previousRow = 0, numeric = 0, strings = 0, nonEmpty = 0, redactions = 0;
    for (const row of sheet.rows) {
      exactFields(row, ROW_FIELDS);
      requireThat(integer(row.sourceRow, 1) && row.sourceRow > previousRow, '物理行号重复或无序');
      previousRow = row.sourceRow;
      requireThat(['HEADER', 'DATA', 'TOTAL', 'NOTE'].includes(row.rowKind), '行类型无效');
      requireThat(Array.isArray(row.values) && row.values.length > 0 && row.values.length <= sheet.columnCount, '单元格数量无效');
      requireThat(integer(row.redactionCount, 0, row.values.length), '脱敏计数无效');
      redactions += row.redactionCount;
      for (const value of row.values) {
        requireThat(value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) || text(value), '单元格类型或长度无效');
        if (value !== null) nonEmpty++;
        if (typeof value === 'number') numeric++;
        if (typeof value === 'string') strings++;
      }
    }
    requireThat(sheet.rowCount === sheet.rows.length && sheet.numericCellCount === numeric
      && sheet.textCellCount === strings && sheet.nonEmptyCellCount === nonEmpty && sheet.redactionCount === redactions, '工作表计数不一致');
  }
  requireThat(doc.importedSheetCount === doc.sheets.length, '工作表计数不一致');
  for (const field of ['rowCount', 'numericCellCount', 'textCellCount', 'redactionCount']) {
    requireThat(doc[field] === doc.sheets.reduce((sum, sheet) => sum + sheet[field], 0), '资料计数不一致');
  }
  if (cumulative) {
    const ledger = doc.sheets.find(sheet => sheet.sheetName === '明细账');
    // 与留存解析的 sheet_to_json(...).slice(0, 3) 一致；空行不持久化，须按原范围的物理行定位。
    const firstRow = Number(ledger?.sourceRange?.match(/^[A-Z]+([1-9]\d*)(?::[A-Z]+[1-9]\d*)?$/)?.[1]);
    requireThat(integer(firstRow, 1), '累计区间缺失或无效');
    const periods = ledger.rows.filter(row => row.sourceRow >= firstRow && row.sourceRow < firstRow + 3)
      .flatMap(row => row.values).flatMap(value => [...String(value ?? '')
        .matchAll(/(20\d{2})[年-](\d{1,2})(?=月|-|$)/g)]
        .map(match => ({ year: Number(match[1]), month: Number(match[2]) })));
    const [start, end] = periods;
    requireThat(periods.length === 2 && start.year === doc.periodYear && end.year === doc.periodYear
      && integer(start.month, 1, 12) && integer(end.month, 1, 12) && start.month < end.month, '累计区间缺失或无效');
    requireThat(doc.categoryLabel.includes(`${doc.periodYear}年${start.month}—${end.month}月累计`), '累计标签与来源区间不符');
  }
  return doc;
}

function portableDocument(stored) {
  return { ...pick(stored, DOC_FIELDS), sheets: stored.sheets.map(sheet => ({
    ...pick(sheet, SHEET_FIELDS), rows: sheet.rows.map(row => ({
      sourceRow: row.sourceRow, rowKind: row.rowKind, values: JSON.parse(row.valuesJson), redactionCount: row.redactionCount,
    })),
  })) };
}

function createBundle(documents) {
  requireThat(Array.isArray(documents) && documents.length > 0 && documents.length <= 100, '资料数量无效');
  documents.forEach(validateDocument);
  requireThat(new Set(documents.map(doc => doc.sourceKey)).size === documents.length, '迁移包内来源重复');
  requireThat(new Set(documents.map(doc => `${doc.category}|${doc.contentSha256}`)).size === documents.length, '迁移包内同类来源内容重复');
  requireThat(documents.reduce((sum, doc) => sum + doc.rowCount, 0) <= 200000, '迁移包行数超限');
  const payload = { format: FORMAT, documents: [...documents].sort((a, b) => a.sourceKey.localeCompare(b.sourceKey)) };
  return { ...payload, payloadSha256: digest(payload) };
}

function validateBundle(bundle) {
  exactFields(bundle, ['format', 'documents', 'payloadSha256']);
  requireThat(bundle.format === FORMAT, '迁移包版本不受支持');
  const verified = createBundle(bundle.documents);
  requireThat(verified.payloadSha256 === bundle.payloadSha256, '迁移包校验失败');
  return verified;
}

async function exportBundle(ids, db) {
  requireThat(Array.isArray(ids) && ids.length > 0 && ids.length <= 100 && ids.every(id => text(id, 100)) && new Set(ids).size === ids.length, '必须明确选择不重复的资料ID');
  return db.$transaction(async tx => {
    const records = await tx.financialEvidenceDocument.findMany({ where: { id: { in: ids } }, include });
    requireThat(records.length === ids.length, '所选资料不存在，拒绝部分导出');
    return createBundle(records.map(portableDocument));
  }, { timeout: 60000 });
}

async function buildPlan(bundle, tx, targetFingerprint) {
  requireThat(/^[a-f0-9]{64}$/.test(targetFingerprint), '目标数据库标识无效');
  const actions = [];
  for (const doc of bundle.documents) {
    const matches = await tx.financialEvidenceDocument.findMany({ where: { OR: [
      { sourceKey: doc.sourceKey }, { contentSha256: doc.contentSha256, category: doc.category },
    ] }, include });
    if (matches.length) {
      requireThat(matches.length === 1 && canonical(portableDocument(matches[0])) === canonical(doc), '目标已有冲突资料，整批拒绝覆盖');
      if (doc.periodMonth === null) {
        requireThat(matches[0].periodId === null, '目标累计资料关联了单月账期，拒绝覆盖');
      } else if (matches[0].periodId !== null) {
        const linked = await tx.financialPeriod.findUnique({ where: { id: matches[0].periodId }, select: { year: true, month: true } });
        requireThat(linked?.year === doc.periodYear && linked.month === doc.periodMonth, '目标资料账期关联冲突，拒绝覆盖');
      }
    }
    actions.push({ sourceKey: doc.sourceKey, documentSha256: digest(doc), action: matches.length ? 'SKIP' : 'CREATE',
      category: doc.category, label: doc.categoryLabel, year: doc.periodYear, month: doc.periodMonth,
      sheets: doc.importedSheetCount, rows: doc.rowCount });
  }
  const payload = { format: PLAN_FORMAT, bundleSha256: bundle.payloadSha256, targetFingerprint, actions };
  return { ...payload, planSha256: digest(payload) };
}

async function previewBundle(input, db, targetFingerprint) {
  const bundle = validateBundle(input);
  return db.$transaction(tx => buildPlan(bundle, tx, targetFingerprint), { timeout: 60000 });
}

function validatePlan(plan) {
  exactFields(plan, ['format', 'bundleSha256', 'targetFingerprint', 'actions', 'planSha256']);
  const { planSha256, ...payload } = plan;
  requireThat(plan.format === PLAN_FORMAT && digest(payload) === planSha256, '预检计划校验失败');
}

/** 仅由本地CLI在实际目标在线备份成功后调用；事务内重做预检防止计划过期。 */
async function importBundle(input, expectedPlan, db, targetFingerprint) {
  const bundle = validateBundle(input);
  validatePlan(expectedPlan);
  return db.$transaction(async tx => {
    const current = await buildPlan(bundle, tx, targetFingerprint);
    requireThat(canonical(current) === canonical(expectedPlan), '预检计划已过期或目标数据库不符，请重新预检');
    const result = { imported: 0, skipped: 0, replaced: 0, documents: [] };
    for (let i = 0; i < bundle.documents.length; i++) {
      const doc = bundle.documents[i];
      if (current.actions[i].action === 'SKIP') { result.skipped++; continue; }
      // 本机主键不出包。目标ID重新生成；只关联目标上已有的同月账期，累计账恒为null。
      const period = doc.periodMonth === null ? null : await tx.financialPeriod.findUnique({
        where: { year_month: { year: doc.periodYear, month: doc.periodMonth } }, select: { id: true },
      });
      const saved = await tx.financialEvidenceDocument.create({ data: { ...pick(doc, DOC_FIELDS), periodId: period?.id || null } });
      for (const sheet of doc.sheets) {
        const savedSheet = await tx.financialEvidenceSheet.create({ data: { ...pick(sheet, SHEET_FIELDS), documentId: saved.id } });
        for (let offset = 0; offset < sheet.rows.length; offset += 200) {
          await tx.financialEvidenceRow.createMany({ data: sheet.rows.slice(offset, offset + 200).map(row => ({
            sheetId: savedSheet.id, sourceRow: row.sourceRow, rowKind: row.rowKind, valuesJson: JSON.stringify(row.values),
            searchText: row.values.filter(v => v !== null && v !== '').map(String).join(' ').slice(0, 2000),
            numericCellCount: row.values.filter(v => typeof v === 'number').length,
            textCellCount: row.values.filter(v => typeof v === 'string').length, redactionCount: row.redactionCount,
          })) });
        }
      }
      const readback = await tx.financialEvidenceDocument.findUnique({ where: { id: saved.id }, include });
      requireThat(canonical(portableDocument(readback)) === canonical(doc), '新增资料回读不一致，整批回滚');
      requireThat(readback.periodId === (period?.id || null), '新增资料账期关联不一致，整批回滚');
      result.imported++;
      result.documents.push({ id: saved.id, sourceKey: doc.sourceKey });
    }
    return result;
  }, { timeout: 60000 });
}

function summarize(bundle, plan) {
  return { documents: bundle.documents.length, sheets: bundle.documents.reduce((s, d) => s + d.importedSheetCount, 0),
    rows: bundle.documents.reduce((s, d) => s + d.rowCount, 0),
    ...(plan ? { toCreate: plan.actions.filter(a => a.action === 'CREATE').length, toSkip: plan.actions.filter(a => a.action === 'SKIP').length, conflicts: 0 } : {}) };
}

module.exports = { createBundle, validateBundle, exportBundle, previewBundle, validatePlan, importBundle, summarize };
