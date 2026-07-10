/**
 * Input: 出口单证准备度结果或出口合同 ID
 * Output: 基于当前税则证据和采购专票口径的税务测算，以及 Excel/PDF 导出二进制
 * Pos: 税务测算 Module；不内置税则小表，不从出口销售额反推采购发票金额
 */

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { createError } = require('../middleware/errorHandler');
const { getExportReadiness } = require('./exportReadinessService');

const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PDF_MIME = 'application/pdf';

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toISOString().slice(0, 10);
};

const roundCurrency = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : 0;
};

const toNullableNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeHsCode = (value) => String(value ?? '').replace(/\D/g, '').slice(0, 10);

/**
 * 职责：只在调用者提供的当前税则证据中做精确匹配；未命中时显式返回缺证据。
 */
const lookupHsCode = (value, currentRecords = []) => {
  const normalizedCode = normalizeHsCode(value);
  const record = (Array.isArray(currentRecords) ? currentRecords : []).find((item) => (
    normalizeHsCode(item?.hsCode) === normalizedCode
  ));
  if (!record || normalizedCode.length !== 10) {
    return {
      normalizedCode,
      matchedCode: null,
      matchType: 'missing_evidence',
      description: '当前税则证据缺失，禁止据此估算退税',
      vatRate: null,
      refundRate: null,
    };
  }
  return {
    normalizedCode,
    matchedCode: normalizedCode,
    matchType: 'exact',
    description: record.productName || record.description || '当前税则记录',
    vatRate: toNullableNumber(record.vatRate),
    refundRate: toNullableNumber(record.refundRate),
    effectiveDate: record.effectiveDate || null,
    fetchedAt: record.fetchedAt || null,
    sourceUrl: record.sourceUrl || null,
  };
};

const resolveReadiness = async (input) => {
  if (typeof input === 'string') return getExportReadiness(input);
  if (input?.exportReadiness?.lines && input?.exportReadiness?.summary) return input.exportReadiness;
  if (input?.lines && input?.summary && (input.contractId || input.contractNo)) return input;
  if (input?.id) return getExportReadiness(input.id);
  throw createError('税务测算需要出口合同 ID 或出口单证准备度结果', 400);
};

const collectPdfBuffer = (doc) => new Promise((resolve, reject) => {
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  doc.on('error', reject);
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.end();
});

const applyHeaderStyle = (worksheet) => {
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF1F2D3D' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFADC0D8' } } };
  });
};

const createFilenameBase = (contractNo) => `${contractNo || 'unknown'}_税务测算_${formatDate(new Date())}`;

/**
 * 职责：将出口准备度的逐行事实转换为可导出的税务摘要。
 * 退税基数直接使用准备度 Module 已按采购含税成本和采购税率推导的发票注明金额。
 */
const calculateTaxSummary = (readiness = {}) => {
  const exchangeRate = roundCurrency(readiness.exchangeRate || 0);
  const lines = (Array.isArray(readiness.lines) ? readiness.lines : []).map((line, index) => {
    const evidence = line.hsEvidence || null;
    const lineAmountUsd = roundCurrency(line.totalPriceUsd);
    return {
      index: line.index || index + 1,
      productName: line.productName || '-',
      hsCode: normalizeHsCode(line.hsCode),
      hsDescription: evidence?.productName || '当前税则证据缺失',
      declaration: line.declarationElements || '',
      storeName: line.storeName || readiness.portName || '-',
      quantity: roundCurrency(line.quantity),
      unit: line.unit || '-',
      unitPriceUsd: roundCurrency(line.unitPriceUsd),
      lineAmountUsd,
      exchangeRate,
      lineAmountCny: roundCurrency(lineAmountUsd * exchangeRate),
      vatRate: toNullableNumber(line.purchaseVatRate),
      refundRate: toNullableNumber(evidence?.refundRate),
      refundBaseCny: roundCurrency(line.refundBaseCny),
      estimatedRefundCny: roundCurrency(line.estimatedRefundCny),
      nonRefundableTaxCny: roundCurrency(line.nonRefundableInputTaxCny),
      hsSource: line.hsSource || 'missing',
      evidenceEffectiveDate: evidence?.effectiveDate || null,
      evidenceFetchedAt: evidence?.fetchedAt || null,
      evidenceSourceUrl: evidence?.sourceUrl || null,
      matchType: evidence ? 'current_snapshot' : 'missing_evidence',
      note: line.note || '',
    };
  });

  const issues = Array.isArray(readiness.issues) ? readiness.issues : [];
  const summary = {
    currency: 'CNY',
    exchangeRate,
    totalSalesUsd: roundCurrency(lines.reduce((sum, line) => sum + line.lineAmountUsd, 0)),
    totalSalesCny: roundCurrency(lines.reduce((sum, line) => sum + line.lineAmountCny, 0)),
    totalPurchaseCostCny: roundCurrency(readiness.summary?.totalPurchaseCostCny),
    totalRefundBaseCny: roundCurrency(lines.reduce((sum, line) => sum + line.refundBaseCny, 0)),
    totalRefundAmountCny: roundCurrency(lines.reduce((sum, line) => sum + line.estimatedRefundCny, 0)),
    totalNonRefundableTaxCny: roundCurrency(lines.reduce((sum, line) => sum + line.nonRefundableTaxCny, 0)),
    lineCount: lines.length,
    matchedLineCount: lines.filter((line) => line.matchType === 'current_snapshot').length,
    fallbackLineCount: lines.filter((line) => line.matchType === 'missing_evidence').length,
    noRefundLineCount: lines.filter((line) => line.refundRate === 0).length,
    errorCount: issues.filter((issue) => issue.severity === 'error').length,
    warningCount: issues.filter((issue) => issue.severity === 'warning').length,
    customsReady: Boolean(readiness.customsReady),
    taxRefundReady: Boolean(readiness.taxRefundReady),
  };

  const evidenceByCode = new Map();
  lines.forEach((line) => {
    if (!line.hsCode || line.matchType !== 'current_snapshot' || evidenceByCode.has(line.hsCode)) return;
    evidenceByCode.set(line.hsCode, {
      hsCode: line.hsCode,
      description: line.hsDescription,
      vatRate: line.vatRate,
      refundRate: line.refundRate,
      hsSource: line.hsSource,
      effectiveDate: line.evidenceEffectiveDate,
      fetchedAt: line.evidenceFetchedAt,
      sourceUrl: line.evidenceSourceUrl,
    });
  });

  return {
    contract: {
      id: readiness.contractId,
      contractNo: readiness.contractNo || '-',
      exchangeRate,
      portName: readiness.portName || '-',
      note: readiness.note || '',
    },
    summary,
    lines,
    evidence: Array.from(evidenceByCode.values()),
    issues,
  };
};

const exportTaxCalculationExcel = async (contractOrReadiness) => {
  const readiness = await resolveReadiness(contractOrReadiness);
  const taxResult = calculateTaxSummary(readiness);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '捷淞进销存系统';
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet('税务汇总');
  summarySheet.columns = [
    { header: '字段', key: 'field', width: 26 },
    { header: '值', key: 'value', width: 28 },
  ];
  applyHeaderStyle(summarySheet);
  [
    ['合同编号', taxResult.contract.contractNo],
    ['汇率', taxResult.summary.exchangeRate],
    ['销售金额(USD，仅作货值参考)', taxResult.summary.totalSalesUsd],
    ['销售金额(CNY，仅作货值参考)', taxResult.summary.totalSalesCny],
    ['预计退税额(CNY)', taxResult.summary.totalRefundAmountCny],
    ['采购专票预计计税依据(CNY)', taxResult.summary.totalRefundBaseCny],
    ['不可退进项税额(CNY)', taxResult.summary.totalNonRefundableTaxCny],
    ['明细行数', taxResult.summary.lineCount],
    ['当前税则证据行数', taxResult.summary.matchedLineCount],
    ['缺少当前证据行数', taxResult.summary.fallbackLineCount],
    ['0%退税行数', taxResult.summary.noRefundLineCount],
    ['阻塞项/警示项', `${taxResult.summary.errorCount}/${taxResult.summary.warningCount}`],
    ['退税资料状态', taxResult.summary.taxRefundReady ? '估算资料已齐' : '资料未齐，禁止正式申报'],
    ['测算口径', '预计值；最终以供应商发票、报关单和税务系统确认为准'],
    ['目的港', taxResult.contract.portName],
    ['备注', taxResult.contract.note || '-'],
  ].forEach(([field, value]) => summarySheet.addRow({ field, value }));

  const detailSheet = workbook.addWorksheet('税务明细');
  detailSheet.columns = [
    { header: '序号', key: 'index', width: 8 },
    { header: '商品名称', key: 'productName', width: 20 },
    { header: 'HS编码', key: 'hsCode', width: 16 },
    { header: '当前税则品名', key: 'hsDescription', width: 26 },
    { header: '实际申报要素', key: 'declaration', width: 30 },
    { header: '门店/目的港', key: 'storeName', width: 18 },
    { header: '数量', key: 'quantity', width: 10 },
    { header: '单位', key: 'unit', width: 8 },
    { header: '单价(USD)', key: 'unitPriceUsd', width: 12 },
    { header: '金额(USD)', key: 'lineAmountUsd', width: 12 },
    { header: '采购专票预计依据(CNY)', key: 'refundBaseCny', width: 20 },
    { header: '预计退税额(CNY)', key: 'estimatedRefundCny', width: 16 },
    { header: '不可退进项税(CNY)', key: 'nonRefundableTaxCny', width: 16 },
    { header: '采购增值税率(%)', key: 'vatRate', width: 14 },
    { header: '当前退税率(%)', key: 'refundRate', width: 13 },
    { header: '证据状态', key: 'matchType', width: 16 },
    { header: 'HS来源', key: 'hsSource', width: 18 },
    { header: '税则生效日期', key: 'evidenceEffectiveDate', width: 15 },
    { header: '来源链接', key: 'evidenceSourceUrl', width: 34 },
    { header: '备注', key: 'note', width: 20 },
  ];
  applyHeaderStyle(detailSheet);
  if (!taxResult.lines.length) {
    detailSheet.addRow({ index: '-', productName: '（暂无可测算装箱明细）' });
  } else {
    taxResult.lines.forEach((line) => detailSheet.addRow({
      ...line,
      evidenceEffectiveDate: formatDate(line.evidenceEffectiveDate),
    }));
  }

  const evidenceSheet = workbook.addWorksheet('当前税则证据');
  evidenceSheet.columns = [
    { header: 'HS编码', key: 'hsCode', width: 18 },
    { header: '税则品名', key: 'description', width: 30 },
    { header: '采购增值税率(%)', key: 'vatRate', width: 16 },
    { header: '出口退税率(%)', key: 'refundRate', width: 16 },
    { header: 'HS来源', key: 'hsSource', width: 18 },
    { header: '生效日期', key: 'effectiveDate', width: 15 },
    { header: '采集/复核日期', key: 'fetchedAt', width: 16 },
    { header: '官方来源', key: 'sourceUrl', width: 42 },
  ];
  applyHeaderStyle(evidenceSheet);
  taxResult.evidence.forEach((record) => evidenceSheet.addRow({
    ...record,
    effectiveDate: formatDate(record.effectiveDate),
    fetchedAt: formatDate(record.fetchedAt),
  }));
  if (!taxResult.evidence.length) evidenceSheet.addRow({ description: '（暂无当前税则证据）' });

  const rawBuffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.isBuffer(rawBuffer) ? rawBuffer : Buffer.from(rawBuffer),
    filename: `${createFilenameBase(taxResult.contract.contractNo)}.xlsx`,
    contentType: EXCEL_MIME,
    taxResult,
  };
};

const addPdfTitle = (doc, title, subtitle) => {
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#1F2D3D').text(title, { align: 'center' });
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(10).fillColor('#5C6F80').text(subtitle, { align: 'center' });
  doc.moveDown(1);
  doc.fillColor('black');
};

const addPdfSection = (doc, title) => {
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#1F2D3D').text(title);
  doc.moveDown(0.2);
  doc.fillColor('black').font('Helvetica').fontSize(10);
};

const addPdfKeyValues = (doc, rows) => rows.forEach(([label, value]) => {
  doc.font('Helvetica-Bold').text(`${label}:`, { continued: true });
  doc.font('Helvetica').text(` ${value}`);
});

const exportTaxCalculationPdf = async (contractOrReadiness) => {
  const readiness = await resolveReadiness(contractOrReadiness);
  const taxResult = calculateTaxSummary(readiness);
  const doc = new PDFDocument({ margin: 40, size: 'A4', compress: false });

  addPdfTitle(doc, 'Tax Calculation Report', `Contract ${taxResult.contract.contractNo}`);
  addPdfSection(doc, 'Summary');
  addPdfKeyValues(doc, [
    ['Contract No.', taxResult.contract.contractNo],
    ['Port', taxResult.contract.portName],
    ['Exchange Rate', taxResult.summary.exchangeRate.toFixed(2)],
    ['Sales Amount (USD, reference only)', taxResult.summary.totalSalesUsd.toFixed(2)],
    ['Estimated Refund (CNY)', taxResult.summary.totalRefundAmountCny.toFixed(2)],
    ['Estimated Invoice Basis (CNY)', taxResult.summary.totalRefundBaseCny.toFixed(2)],
    ['Non-refundable Input Tax (CNY)', taxResult.summary.totalNonRefundableTaxCny.toFixed(2)],
    ['Current Evidence Lines', `${taxResult.summary.matchedLineCount}/${taxResult.summary.lineCount}`],
    ['Blocking / Warning', `${taxResult.summary.errorCount}/${taxResult.summary.warningCount}`],
  ]);

  addPdfSection(doc, 'Line Items');
  if (!taxResult.lines.length) {
    doc.text('(No packing lines available)');
  } else {
    taxResult.lines.forEach((line) => {
      doc.text(
        `${line.index}. ${line.productName} | HS:${line.hsCode || '-'} | USD:${line.lineAmountUsd.toFixed(2)} | Refund:${line.estimatedRefundCny.toFixed(2)} | Non-refundable:${line.nonRefundableTaxCny.toFixed(2)} | ${line.hsSource}`,
      );
    });
  }

  doc.moveDown(1);
  doc.fontSize(8).fillColor('#6F7F8E').text('Estimate only. Final amounts require supplier invoices, customs declaration and tax-system confirmation.');
  doc.text(`Exported at: ${formatDate(new Date())}`);
  doc.fillColor('black');

  const buffer = await collectPdfBuffer(doc);
  return {
    buffer,
    filename: `${createFilenameBase(taxResult.contract.contractNo)}.pdf`,
    contentType: PDF_MIME,
    taxResult,
  };
};

module.exports = {
  lookupHsCode,
  calculateTaxSummary,
  exportTaxCalculationExcel,
  exportTaxCalculationPdf,
};
