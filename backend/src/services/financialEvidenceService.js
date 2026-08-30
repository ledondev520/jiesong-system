/**
 * Input: 财务工作簿/PDF buffer、来源文件名/相对路径、Prisma Adapter 与查询筛选
 * Output: 分类后的脱敏结构化文档、幂等导入结果、资料库摘要与行级下钻
 * Pos: 财务与税务证据分析库深 Module；原始文件不落盘，个人敏感字段在持久化前脱敏
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const crypto = require('crypto');
const XLSX = require('xlsx');
const prisma = require('../utils/prisma');

const PARSE_VERSION = 'financial-evidence-v2';
const REDACTED_VALUE = '<已脱敏>';

const CATEGORY_RULES = [
  { category: 'TAX_REFUND_EXPORT_DETAIL', label: '出口退税出口明细', analysisScope: 'TAX_REFUND', handledElsewhere: false, pattern: /外贸企业出口退税出口明细申报表.*\.xlsx?$/ },
  { category: 'TAX_REFUND_PURCHASE_DETAIL', label: '出口退税进货明细', analysisScope: 'TAX_REFUND', handledElsewhere: false, pattern: /外贸企业出口退税进货明细申报表.*\.xlsx?$/ },
  { category: 'TAX_REFUND_ACCEPTANCE_NOTICE', label: '出口退税准予受理通知书', analysisScope: 'TAX_REFUND', handledElsewhere: false, pattern: /准予受理通知书.*\.pdf$/ },
  { category: 'MONTHLY_STATEMENT', label: '会计报表', analysisScope: 'STATEMENT', handledElsewhere: true, pattern: /会计报表\.xlsx$/ },
  { category: 'ACCOUNT_BALANCE', label: '科目余额', analysisScope: 'LEDGER', handledElsewhere: true, pattern: /科目余额\.(xlsx|xls)$/ },
  { category: 'GENERAL_LEDGER_DETAIL', label: '明细账', analysisScope: 'LEDGER', handledElsewhere: true, pattern: /明细账\.xlsx$/ },
  { category: 'INPUT_INVOICE', label: '进项发票', analysisScope: 'INVOICE', handledElsewhere: true, pattern: /进项发票列表\.xlsx$/ },
  { category: 'OUTPUT_INVOICE_REFERENCE', label: '销项参考清单', analysisScope: 'INVOICE_REFERENCE', handledElsewhere: false, pattern: /销项发票列表\.xlsx$/ },
  { category: 'VOUCHER_SUMMARY', label: '凭证汇总', analysisScope: 'LEDGER', handledElsewhere: false, pattern: /凭证汇总\.xls$/ },
  { category: 'VOUCHER', label: '会计凭证', analysisScope: 'LEDGER', handledElsewhere: false, pattern: /凭证\.xls$/ },
  { category: 'BANK_JOURNAL', label: '银行日记账', analysisScope: 'LEDGER', handledElsewhere: false, pattern: /银行日记账\.xls$/ },
  { category: 'CASH_JOURNAL', label: '现金日记账', analysisScope: 'LEDGER', handledElsewhere: false, pattern: /现金日记账\.xls$/ },
  { category: 'GENERAL_LEDGER', label: '总账', analysisScope: 'LEDGER', handledElsewhere: false, pattern: /总账\.xlsx$/ },
  { category: 'TEMP_PAYROLL', label: '临时工资', analysisScope: 'PAYROLL', handledElsewhere: false, pattern: /临时工资表\.xls$/ },
  { category: 'PAYROLL', label: '工资', analysisScope: 'PAYROLL', handledElsewhere: false, pattern: /工资表\.xls$/ },
  { category: 'SOCIAL_SECURITY', label: '社保', analysisScope: 'PAYROLL', handledElsewhere: false, pattern: /社保.*\.xls$/ },
  { category: 'INDIVIDUAL_INCOME_TAX', label: '综合所得申报', analysisScope: 'TAX', handledElsewhere: false, pattern: /综合所得申报表\.xls$/ },
  { category: 'LABOR_REMUNERATION', label: '劳务报酬申报', analysisScope: 'TAX', handledElsewhere: false, pattern: /劳务报酬.*\.xls$/ },
  { category: 'VAT_RETURN', label: '增值税申报', analysisScope: 'TAX', handledElsewhere: false, pattern: /增值税一般纳税人申报表.*\.xls$/ },
  { category: 'CORPORATE_INCOME_TAX', label: '企业所得税申报', analysisScope: 'TAX', handledElsewhere: false, pattern: /企业所得税.*\.xls$/ },
  { category: 'STAMP_DUTY_RETURN', label: '印花税申报', analysisScope: 'TAX', handledElsewhere: false, pattern: /印花税纳税申报表.*\.xls$/ },
  { category: 'TAX_FINANCIAL_STATEMENT', label: '税局财务报表', analysisScope: 'TAX', handledElsewhere: false, pattern: /小企业会计准则财务报表.*\.xls$/ },
];

const SENSITIVE_HEADER_PATTERN = /(姓名|证件|身份证|护照|手机|联系电话|电话号码|银行账号|银行卡|卡号|对方账号|个人账号|家庭住址|联系地址|邮箱|社保编号)/i;
const BUSINESS_IDENTIFIER_HEADER_PATTERN = /(关联号|报关单号|发票号|进货凭证号|供货方纳税号|税票号|商品代码|证明号)/i;
const SENSITIVE_VALUE_PATTERNS = [
  /(^|\D)\d{17}[\dXx](?=\D|$)/,
  /(^|\D)1[3-9]\d{9}(?=\D|$)/,
  /(^|\D)\d{16,19}(?=\D|$)/,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
];
const PDF_SENSITIVE_VALUE_PATTERNS = [
  /(?<!\d)\d{17}[\dXx](?!\d)/g,
  /(?<!\d)1[3-9]\d{9}(?!\d)/g,
  /(?<!\d)\d{16,19}(?!\d)/g,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
];

function classifyFinancialEvidenceFile(fileName) {
  const normalized = String(fileName || '').trim();
  const rule = CATEGORY_RULES.find((item) => item.pattern.test(normalized));
  if (!rule) {
    return {
      category: 'UNSUPPORTED',
      categoryLabel: '未识别资料',
      analysisScope: 'OTHER',
      handledElsewhere: false,
      eligible: false,
    };
  }
  return {
    category: rule.category,
    categoryLabel: rule.label,
    analysisScope: rule.analysisScope,
    handledElsewhere: rule.handledElsewhere,
    eligible: !rule.handledElsewhere,
  };
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function detectPeriod(relativePath, fileName) {
  const source = `${relativePath || ''}/${fileName || ''}`;
  const monthly = source.match(/(20\d{2})年(\d{1,2})账期/);
  if (monthly) return { periodYear: Number(monthly[1]), periodMonth: Number(monthly[2]) };
  const period = source.match(/(20\d{2})年(\d{1,2})期/);
  if (period) return { periodYear: Number(period[1]), periodMonth: Number(period[2]) };
  const annual = source.match(/(?:^|\/)(20\d{2})年(?:\/|_)/);
  return annual
    ? { periodYear: Number(annual[1]), periodMonth: null }
    : { periodYear: null, periodMonth: null };
}

function inferPeriodFromValues(values) {
  const periods = values
    .flatMap((value) => {
      const normalized = String(value ?? '').trim();
      return /^(20\d{2})(0[1-9]|1[0-2])$/.test(normalized) ? [normalized] : [];
    });
  const uniquePeriods = [...new Set(periods)];
  const years = [...new Set(uniquePeriods.map((period) => Number(period.slice(0, 4))))];
  if (years.length !== 1) return { periodYear: null, periodMonth: null };
  return {
    periodYear: years[0],
    periodMonth: uniquePeriods.length === 1 ? Number(uniquePeriods[0].slice(4, 6)) : null,
  };
}

function inferPeriodFromSheets(sheets) {
  return inferPeriodFromValues(sheets.flatMap((sheet) => sheet.rows.flatMap((row) => JSON.parse(row.valuesJson))));
}

function normalizeRelativePath(relativePath, fileName) {
  const normalized = String(relativePath || fileName || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .slice(-3)
    .join('/');
  return normalized || String(fileName || 'unknown.xls');
}

function rawCellValue(cell) {
  if (!cell || cell.v === undefined || cell.v === null) return null;
  if (cell.v instanceof Date) return cell.v.toISOString();
  if (typeof cell.v === 'number' || typeof cell.v === 'boolean') return cell.v;
  const text = String(cell.v).trim();
  return text === '' ? null : text.slice(0, 2000);
}

function isNonEmpty(value) {
  return value !== null && value !== undefined && value !== '';
}

function isSensitiveHeader(value) {
  return typeof value === 'string' && SENSITIVE_HEADER_PATTERN.test(value);
}

function sanitizeValue(value, sensitiveColumn, businessIdentifierColumn = false) {
  if (!isNonEmpty(value)) return { value: null, redacted: false };
  if (isSensitiveHeader(value)) return { value, redacted: false };
  if (businessIdentifierColumn) return { value, redacted: false };
  const text = String(value);
  if (sensitiveColumn || SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(text))) {
    return { value: REDACTED_VALUE, redacted: true };
  }
  return { value, redacted: false };
}

function sanitizePdfText(value) {
  let text = String(value || '');
  let redactionCount = 0;
  for (const pattern of PDF_SENSITIVE_VALUE_PATTERNS) {
    text = text.replace(pattern, () => {
      redactionCount += 1;
      return REDACTED_VALUE;
    });
  }
  return { value: text, redactionCount };
}

function inferRowKind(values, sourceRow, numericCellCount) {
  const text = values.filter((value) => typeof value === 'string').join(' ');
  if (/(合计|总计|小计|本期合计|本年累计)/.test(text)) return 'TOTAL';
  if (numericCellCount > 0) return 'DATA';
  if (sourceRow <= 10) return 'HEADER';
  return 'NOTE';
}

function parseSheet(sheet, sheetName, sheetIndex) {
  if (!sheet?.['!ref']) return null;
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const sensitiveColumns = new Set();
  const businessIdentifierColumns = new Set();
  const scanEndRow = Math.min(range.e.r, range.s.r + 39);

  for (let row = range.s.r; row <= scanEndRow; row++) {
    for (let column = range.s.c; column <= range.e.c; column++) {
      const value = rawCellValue(sheet[XLSX.utils.encode_cell({ r: row, c: column })]);
      if (isSensitiveHeader(value)) sensitiveColumns.add(column);
      if (typeof value === 'string' && BUSINESS_IDENTIFIER_HEADER_PATTERN.test(value)) businessIdentifierColumns.add(column);
    }
  }

  const rows = [];
  let nonEmptyCellCount = 0;
  let formulaCellCount = 0;
  let redactionCount = 0;
  let numericCellCount = 0;
  let textCellCount = 0;

  for (let row = range.s.r; row <= range.e.r; row++) {
    const values = [];
    let rowNonEmpty = false;
    let rowRedactions = 0;
    let rowNumeric = 0;
    let rowText = 0;

    for (let column = range.s.c; column <= range.e.c; column++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      const raw = rawCellValue(cell);
      if (cell?.f) formulaCellCount += 1;
      if (isNonEmpty(raw)) {
        rowNonEmpty = true;
        nonEmptyCellCount += 1;
      }
      const sanitized = sanitizeValue(raw, sensitiveColumns.has(column), businessIdentifierColumns.has(column));
      if (sanitized.redacted) {
        rowRedactions += 1;
        redactionCount += 1;
      }
      if (typeof sanitized.value === 'number') {
        rowNumeric += 1;
        numericCellCount += 1;
      } else if (typeof sanitized.value === 'string') {
        rowText += 1;
        textCellCount += 1;
      }
      values.push(sanitized.value);
    }

    if (!rowNonEmpty) continue;
    while (values.length > 0 && values[values.length - 1] === null) values.pop();
    const sourceRow = row + 1;
    rows.push({
      sourceRow,
      rowKind: inferRowKind(values, sourceRow, rowNumeric),
      valuesJson: JSON.stringify(values),
      searchText: values.filter(isNonEmpty).map(String).join(' ').slice(0, 2000),
      numericCellCount: rowNumeric,
      textCellCount: rowText,
      redactionCount: rowRedactions,
    });
  }

  if (rows.length === 0) return null;
  return {
    sheetIndex,
    sheetName: String(sheetName).slice(0, 200),
    sourceRange: sheet['!ref'],
    rowCount: rows.length,
    columnCount: range.e.c - range.s.c + 1,
    nonEmptyCellCount,
    formulaCellCount,
    numericCellCount,
    textCellCount,
    redactionCount,
    rows,
  };
}

function parseFinancialEvidenceSource({ buffer, fileName, relativePath }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('财务资料文件为空');
  const classification = classifyFinancialEvidenceFile(fileName);
  if (!classification.eligible) {
    const reason = classification.handledElsewhere ? '该文件由现有专用 Module 管理' : '未识别的财务资料类型';
    throw new Error(`${fileName}: ${reason}`);
  }

  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellFormula: true });
  } catch (error) {
    throw new Error(`${fileName}: 工作簿解析失败（${error.message}）`);
  }

  const safeRelativePath = normalizeRelativePath(relativePath, fileName);
  const pathPeriod = detectPeriod(safeRelativePath, fileName);
  const contentSha256 = sha256(buffer);
  const sheets = workbook.SheetNames
    .map((sheetName, sheetIndex) => parseSheet(workbook.Sheets[sheetName], sheetName, sheetIndex))
    .filter(Boolean);

  if (sheets.length === 0) throw new Error(`${fileName}: 没有可利用的非空 Sheet`);

  const inferredPeriod = inferPeriodFromSheets(sheets);
  const period = pathPeriod.periodYear ? pathPeriod : inferredPeriod;
  const sourceKey = sha256([
    classification.category,
    period.periodYear || '',
    period.periodMonth || '',
    safeRelativePath,
  ].join('|'));

  return {
    sourceKey,
    contentSha256,
    parseVersion: PARSE_VERSION,
    relativePath: safeRelativePath,
    fileName: String(fileName).slice(0, 500),
    fileSize: buffer.length,
    ...classification,
    ...period,
    sourceSheetCount: workbook.SheetNames.length,
    importedSheetCount: sheets.length,
    rowCount: sheets.reduce((sum, sheet) => sum + sheet.rowCount, 0),
    numericCellCount: sheets.reduce((sum, sheet) => sum + sheet.numericCellCount, 0),
    textCellCount: sheets.reduce((sum, sheet) => sum + sheet.textCellCount, 0),
    redactionCount: sheets.reduce((sum, sheet) => sum + sheet.redactionCount, 0),
    originalArchived: false,
    sheets,
  };
}

function normalizePdfText(items) {
  return items
    .map((item) => String(item?.str || '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function parseFinancialEvidencePdfSource({ buffer, fileName, relativePath }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('财务资料文件为空');
  const classification = classifyFinancialEvidenceFile(fileName);
  if (!classification.eligible || classification.category !== 'TAX_REFUND_ACCEPTANCE_NOTICE') {
    throw new Error(`${fileName}: 未识别的出口退税 PDF 资料类型`);
  }

  let pdf;
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer), disableWorker: true }).promise;
  } catch (error) {
    throw new Error(`${fileName}: PDF 解析失败（${error.message}）`);
  }

  const sheets = [];
  const periodValues = [];
  let redactionCount = 0;
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const text = normalizePdfText((await page.getTextContent()).items);
    if (!text) continue;
    const sanitized = sanitizePdfText(text);
    const value = sanitized.value;
    const monthMatch = value.match(/申报\s*年月\s*[:：]?\s*(20\d{2})(0[1-9]|1[0-2])/);
    if (monthMatch) periodValues.push(`${monthMatch[1]}${monthMatch[2]}`);
    redactionCount += sanitized.redactionCount;
    sheets.push({
      sheetIndex: pageNumber - 1,
      sheetName: `第${pageNumber}页`,
      sourceRange: `PDF:${pageNumber}`,
      rowCount: 1,
      columnCount: 1,
      nonEmptyCellCount: 1,
      formulaCellCount: 0,
      numericCellCount: 0,
      textCellCount: 1,
      redactionCount: sanitized.redactionCount,
      rows: [{
        sourceRow: 1,
        rowKind: 'DATA',
        valuesJson: JSON.stringify([value]),
        searchText: value.slice(0, 2000),
        numericCellCount: 0,
        textCellCount: 1,
        redactionCount: sanitized.redactionCount,
      }],
    });
  }
  if (sheets.length === 0) throw new Error(`${fileName}: PDF 没有可利用的文本页`);

  const safeRelativePath = normalizeRelativePath(relativePath, fileName);
  const pathPeriod = detectPeriod(safeRelativePath, fileName);
  const inferredPeriod = inferPeriodFromValues(periodValues);
  const period = pathPeriod.periodYear ? pathPeriod : inferredPeriod;
  const contentSha256 = sha256(buffer);
  const sourceKey = sha256([
    classification.category,
    period.periodYear || '',
    period.periodMonth || '',
    safeRelativePath,
  ].join('|'));

  return {
    sourceKey,
    contentSha256,
    parseVersion: PARSE_VERSION,
    relativePath: safeRelativePath,
    fileName: String(fileName).slice(0, 500),
    fileSize: buffer.length,
    ...classification,
    ...period,
    sourceSheetCount: pdf.numPages,
    importedSheetCount: sheets.length,
    rowCount: sheets.length,
    numericCellCount: 0,
    textCellCount: sheets.length,
    redactionCount,
    originalArchived: false,
    sheets,
  };
}

function documentData(document, periodId) {
  return {
    periodId,
    sourceKey: document.sourceKey,
    contentSha256: document.contentSha256,
    parseVersion: document.parseVersion,
    relativePath: document.relativePath,
    fileName: document.fileName,
    fileSize: document.fileSize,
    category: document.category,
    categoryLabel: document.categoryLabel,
    analysisScope: document.analysisScope,
    periodYear: document.periodYear,
    periodMonth: document.periodMonth,
    sourceSheetCount: document.sourceSheetCount,
    importedSheetCount: document.importedSheetCount,
    rowCount: document.rowCount,
    numericCellCount: document.numericCellCount,
    textCellCount: document.textCellCount,
    redactionCount: document.redactionCount,
    originalArchived: false,
  };
}

async function persistDocument(document, existing, tx) {
  const period = document.periodYear && document.periodMonth
    ? await tx.financialPeriod.findUnique({
      where: { year_month: { year: document.periodYear, month: document.periodMonth } },
      select: { id: true },
    })
    : null;
  let stored;
  if (existing) {
    await tx.financialEvidenceSheet.deleteMany({ where: { documentId: existing.id } });
    stored = await tx.financialEvidenceDocument.update({
      where: { id: existing.id },
      data: documentData(document, period?.id || null),
    });
  } else {
    stored = await tx.financialEvidenceDocument.create({
      data: documentData(document, period?.id || null),
    });
  }

  for (const sheet of document.sheets) {
    const storedSheet = await tx.financialEvidenceSheet.create({
      data: {
        documentId: stored.id,
        sheetIndex: sheet.sheetIndex,
        sheetName: sheet.sheetName,
        sourceRange: sheet.sourceRange,
        rowCount: sheet.rowCount,
        columnCount: sheet.columnCount,
        nonEmptyCellCount: sheet.nonEmptyCellCount,
        formulaCellCount: sheet.formulaCellCount,
        numericCellCount: sheet.numericCellCount,
        textCellCount: sheet.textCellCount,
        redactionCount: sheet.redactionCount,
      },
    });
    for (let index = 0; index < sheet.rows.length; index += 200) {
      const chunk = sheet.rows.slice(index, index + 200).map((row) => ({
        ...row,
        sheetId: storedSheet.id,
      }));
      await tx.financialEvidenceRow.createMany({ data: chunk });
    }
  }
  return stored;
}

async function importFinancialEvidenceDocuments(documents, db = prisma) {
  const result = { imported: 0, replaced: 0, skipped: 0, documents: [] };
  for (const document of documents) {
    const existing = await db.financialEvidenceDocument.findUnique({
      where: { sourceKey: document.sourceKey },
      select: { id: true, contentSha256: true, parseVersion: true },
    });
    if (existing && existing.contentSha256 === document.contentSha256 && existing.parseVersion === document.parseVersion) {
      result.skipped += 1;
      continue;
    }
    const stored = await db.$transaction(
      (tx) => persistDocument(document, existing, tx),
      { timeout: 20000 },
    );
    if (existing) result.replaced += 1;
    else result.imported += 1;
    result.documents.push({ id: stored.id, sourceKey: document.sourceKey, action: existing ? 'REPLACED' : 'IMPORTED' });
  }
  return result;
}

async function getFinancialEvidenceSummary(db = prisma) {
  const documents = await db.financialEvidenceDocument.findMany({
    select: {
      category: true,
      categoryLabel: true,
      analysisScope: true,
      periodYear: true,
      periodMonth: true,
      importedSheetCount: true,
      rowCount: true,
      redactionCount: true,
      importedAt: true,
    },
  });
  const categories = new Map();
  for (const document of documents) {
    const current = categories.get(document.category) || {
      category: document.category,
      categoryLabel: document.categoryLabel,
      analysisScope: document.analysisScope,
      documentCount: 0,
      sheetCount: 0,
      rowCount: 0,
      redactionCount: 0,
    };
    current.documentCount += 1;
    current.sheetCount += document.importedSheetCount;
    current.rowCount += document.rowCount;
    current.redactionCount += document.redactionCount;
    categories.set(document.category, current);
  }
  const periods = [...new Set(documents
    .filter((item) => item.periodYear)
    .map((item) => item.periodMonth ? `${item.periodYear}-${String(item.periodMonth).padStart(2, '0')}` : `${item.periodYear}`))]
    .sort();
  return {
    totals: {
      documentCount: documents.length,
      sheetCount: documents.reduce((sum, item) => sum + item.importedSheetCount, 0),
      rowCount: documents.reduce((sum, item) => sum + item.rowCount, 0),
      redactionCount: documents.reduce((sum, item) => sum + item.redactionCount, 0),
    },
    categories: [...categories.values()].sort((a, b) => b.documentCount - a.documentCount || a.category.localeCompare(b.category)),
    periods,
    latestImportedAt: documents.map((item) => item.importedAt).sort().at(-1) || null,
  };
}

async function listFinancialEvidenceDocuments(filters = {}, db = prisma) {
  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 20));
  const where = {};
  if (filters.category) where.category = filters.category;
  if (filters.year) where.periodYear = Number(filters.year);
  if (filters.month) where.periodMonth = Number(filters.month);
  const [items, total] = await Promise.all([
    db.financialEvidenceDocument.findMany({
      where,
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }, { category: 'asc' }, { fileName: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.financialEvidenceDocument.count({ where }),
  ]);
  return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}

async function getFinancialEvidenceDocument(id, options = {}, db = prisma) {
  const document = await db.financialEvidenceDocument.findUnique({
    where: { id },
    include: { sheets: { orderBy: { sheetIndex: 'asc' } } },
  });
  if (!document) return null;
  const selectedSheet = options.sheetId
    ? document.sheets.find((sheet) => sheet.id === options.sheetId)
    : document.sheets[0];
  if (!selectedSheet) return { ...document, selectedSheet: null, rows: [], pagination: null };
  const page = Math.max(1, Number(options.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(options.pageSize) || 50));
  const rows = await db.financialEvidenceRow.findMany({
    where: { sheetId: selectedSheet.id },
    orderBy: { sourceRow: 'asc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  return {
    ...document,
    selectedSheet,
    rows: rows.map(({ valuesJson, ...row }) => ({ ...row, values: JSON.parse(valuesJson) })),
    pagination: {
      page,
      pageSize,
      total: selectedSheet.rowCount,
      totalPages: Math.ceil(selectedSheet.rowCount / pageSize),
    },
  };
}

module.exports = {
  PARSE_VERSION,
  REDACTED_VALUE,
  classifyFinancialEvidenceFile,
  parseFinancialEvidenceSource,
  parseFinancialEvidencePdfSource,
  importFinancialEvidenceDocuments,
  getFinancialEvidenceSummary,
  listFinancialEvidenceDocuments,
  getFinancialEvidenceDocument,
};
