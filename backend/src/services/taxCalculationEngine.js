/**
 * Input: 销售合同对象或合同 ID
 * Output: 税务测算结果，以及 Excel/PDF 导出二进制
 * Pos: 税务测算引擎，集中处理 HS 编码匹配、出口退税估算与导出
 */

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const prisma = require('../utils/prisma');

const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PDF_MIME = 'application/pdf';

const HS_RULES = Object.freeze([
  { code: '0808100000', description: '鲜苹果', vatRate: 13, refundRate: 9, taxCategory: '农产品' },
  { code: '0806100000', description: '鲜葡萄', vatRate: 13, refundRate: 9, taxCategory: '农产品' },
  { code: '0810909000', description: '其他鲜水果', vatRate: 13, refundRate: 9, taxCategory: '农产品' },
  { code: '3924100000', description: '塑料制餐厨用品', vatRate: 13, refundRate: 13, taxCategory: '塑料制品' },
  { code: '3924900000', description: '其他塑料家庭用品', vatRate: 13, refundRate: 13, taxCategory: '塑料制品' },
  { code: '6911101900', description: '其他瓷餐具及厨房用品', vatRate: 13, refundRate: 13, taxCategory: '陶瓷制品' },
  { code: '0808', description: '鲜苹果及相关鲜果', vatRate: 13, refundRate: 9, taxCategory: '农产品' },
  { code: '3924', description: '塑料制餐厨及家庭用品', vatRate: 13, refundRate: 13, taxCategory: '塑料制品' },
  { code: '69', description: '陶瓷制品', vatRate: 13, refundRate: 13, taxCategory: '陶瓷制品' },
]);

const DEFAULT_RULE = Object.freeze({
  description: '未匹配税则，请人工确认',
  vatRate: 13,
  refundRate: 0,
  taxCategory: '待确认',
});

const formatDate = (value) => {
  const date = value ? new Date(value) : new Date();
  return date.toISOString().slice(0, 10);
};

const roundCurrency = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Number(numeric.toFixed(2));
};

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeHsCode = (value) => {
  const digits = String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 10);

  if (!digits) {
    return '';
  }

  if (digits.length >= 10) {
    return digits;
  }

  return digits.padEnd(10, '0');
};

const lookupHsCode = (value) => {
  const rawDigits = String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 10);
  const normalizedCode = normalizeHsCode(value);

  if (!rawDigits) {
    return {
      normalizedCode,
      matchedCode: null,
      matchType: 'missing',
      ...DEFAULT_RULE,
    };
  }

  const exactRule = HS_RULES.find((rule) => rule.code.length === 10 && rule.code === normalizedCode);
  if (exactRule) {
    return {
      normalizedCode,
      matchedCode: exactRule.code,
      matchType: 'exact',
      ...exactRule,
    };
  }

  const prefixRule = HS_RULES
    .filter((rule) => rawDigits.startsWith(rule.code) || normalizedCode.startsWith(rule.code))
    .sort((left, right) => right.code.length - left.code.length)[0];

  if (prefixRule) {
    return {
      normalizedCode,
      matchedCode: prefixRule.code,
      matchType: 'prefix',
      ...prefixRule,
    };
  }

  return {
    normalizedCode,
    matchedCode: null,
    matchType: 'fallback',
    ...DEFAULT_RULE,
  };
};

const collectPdfBuffer = (doc) => {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.end();
  });
};

const applyHeaderStyle = (worksheet) => {
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF1F2D3D' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFADC0D8' } },
    };
  });
};

const createFilenameBase = (contractNo) => `${contractNo || 'unknown'}_税务测算_${formatDate()}`;

const loadSalesContract = async (contractId) => {
  const contract = await prisma.salesContract.findUnique({
    where: { id: contractId },
    include: {
      port: true,
      items: {
        include: {
          product: true,
          store: true,
        },
      },
      packingItems: {
        include: {
          product: true,
          store: true,
        },
      },
    },
  });

  if (!contract) {
    throw new Error(`合同不存在: ${contractId}`);
  }

  return contract;
};

const resolveContract = async (contractOrId) => {
  if (typeof contractOrId === 'string') {
    return loadSalesContract(contractOrId);
  }
  return contractOrId;
};

const extractLineItems = (contract = {}) => {
  const hasPackingItems = Array.isArray(contract.packingItems) && contract.packingItems.length > 0;
  const sourceItems = hasPackingItems ? contract.packingItems : (contract.items || []);

  return sourceItems.map((item) => {
    const quantity = toNumber(item.quantity);
    const unitPriceUsd = toNumber(
      item.unitPrice,
      Number.isFinite(Number(item.sellingPrice))
        ? Number(item.sellingPrice)
        : quantity > 0
          ? toNumber(item.totalPrice) / quantity
          : 0,
    );
    const lineAmountUsd = roundCurrency(
      Number.isFinite(Number(item.totalPrice)) ? Number(item.totalPrice) : quantity * unitPriceUsd,
    );

    return {
      productName: item.product?.customsName || item.product?.name || '-',
      hsCode: item.hsCode || item.product?.hsCode || '',
      declaration: item.declaration || item.product?.declaration || '',
      storeName: item.store?.name || contract.port?.name || '-',
      quantity: roundCurrency(quantity),
      unit: item.unit || item.product?.unit || '-',
      unitPriceUsd: roundCurrency(unitPriceUsd),
      lineAmountUsd,
      note: item.note || '',
    };
  });
};

const calculateTaxSummary = (contract = {}) => {
  const exchangeRate = roundCurrency(toNumber(contract.exchangeRate, 1));
  const lines = extractLineItems(contract).map((line, index) => {
    const hsRule = lookupHsCode(line.hsCode);
    const lineAmountCny = roundCurrency(line.lineAmountUsd * exchangeRate);
    const refundBaseCny = roundCurrency(
      hsRule.vatRate > 0 ? lineAmountCny / (1 + hsRule.vatRate / 100) : lineAmountCny,
    );
    const estimatedRefundCny = roundCurrency(refundBaseCny * (hsRule.refundRate / 100));
    const nonRefundableTaxCny = roundCurrency(
      refundBaseCny * (Math.max(hsRule.vatRate - hsRule.refundRate, 0) / 100),
    );

    return {
      index: index + 1,
      productName: line.productName,
      hsCode: hsRule.normalizedCode,
      hsDescription: hsRule.description,
      declaration: line.declaration || '',
      storeName: line.storeName,
      quantity: line.quantity,
      unit: line.unit,
      unitPriceUsd: line.unitPriceUsd,
      lineAmountUsd: line.lineAmountUsd,
      exchangeRate,
      lineAmountCny,
      vatRate: hsRule.vatRate,
      refundRate: hsRule.refundRate,
      refundBaseCny,
      estimatedRefundCny,
      nonRefundableTaxCny,
      taxCategory: hsRule.taxCategory,
      matchType: hsRule.matchType,
      note: line.note,
    };
  });

  const summary = {
    currency: 'CNY',
    exchangeRate,
    totalSalesUsd: roundCurrency(lines.reduce((sum, line) => sum + line.lineAmountUsd, 0)),
    totalSalesCny: roundCurrency(lines.reduce((sum, line) => sum + line.lineAmountCny, 0)),
    totalRefundBaseCny: roundCurrency(lines.reduce((sum, line) => sum + line.refundBaseCny, 0)),
    totalRefundAmountCny: roundCurrency(lines.reduce((sum, line) => sum + line.estimatedRefundCny, 0)),
    totalNonRefundableTaxCny: roundCurrency(lines.reduce((sum, line) => sum + line.nonRefundableTaxCny, 0)),
    lineCount: lines.length,
    matchedLineCount: lines.filter((line) => line.matchType === 'exact' || line.matchType === 'prefix').length,
    fallbackLineCount: lines.filter((line) => line.matchType === 'fallback' || line.matchType === 'missing').length,
  };

  return {
    contract: {
      id: contract.id,
      contractNo: contract.contractNo || '-',
      exchangeRate,
      portName: contract.port?.name || '-',
      note: contract.note || '',
    },
    summary,
    lines,
    rules: HS_RULES.map((rule) => ({
      hsCode: rule.code,
      description: rule.description,
      vatRate: rule.vatRate,
      refundRate: rule.refundRate,
      taxCategory: rule.taxCategory,
    })),
  };
};

const exportTaxCalculationExcel = async (contractOrId) => {
  const contract = await resolveContract(contractOrId);
  const taxResult = calculateTaxSummary(contract);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = '捷淞进销存系统';
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet('税务汇总');
  summarySheet.columns = [
    { header: '字段', key: 'field', width: 24 },
    { header: '值', key: 'value', width: 24 },
  ];
  applyHeaderStyle(summarySheet);
  [
    ['合同编号', taxResult.contract.contractNo],
    ['汇率', taxResult.summary.exchangeRate],
    ['销售金额(USD)', taxResult.summary.totalSalesUsd],
    ['销售金额(CNY)', taxResult.summary.totalSalesCny],
    ['预计退税额(CNY)', taxResult.summary.totalRefundAmountCny],
    ['退税基数(CNY)', taxResult.summary.totalRefundBaseCny],
    ['不可退税额(CNY)', taxResult.summary.totalNonRefundableTaxCny],
    ['明细行数', taxResult.summary.lineCount],
    ['已匹配行数', taxResult.summary.matchedLineCount],
    ['待确认行数', taxResult.summary.fallbackLineCount],
    ['目的港', taxResult.contract.portName],
    ['备注', taxResult.contract.note || '-'],
  ].forEach(([field, value]) => summarySheet.addRow({ field, value }));

  const detailSheet = workbook.addWorksheet('税务明细');
  detailSheet.columns = [
    { header: '序号', key: 'index', width: 8 },
    { header: '商品名称', key: 'productName', width: 20 },
    { header: 'HS编码', key: 'hsCode', width: 16 },
    { header: 'HS描述', key: 'hsDescription', width: 24 },
    { header: '申报要素', key: 'declaration', width: 28 },
    { header: '门店/客户', key: 'storeName', width: 18 },
    { header: '数量', key: 'quantity', width: 10 },
    { header: '单位', key: 'unit', width: 8 },
    { header: '单价(USD)', key: 'unitPriceUsd', width: 12 },
    { header: '金额(USD)', key: 'lineAmountUsd', width: 12 },
    { header: '退税基数(CNY)', key: 'refundBaseCny', width: 14 },
    { header: '预计退税额(CNY)', key: 'estimatedRefundCny', width: 16 },
    { header: '不可退税额(CNY)', key: 'nonRefundableTaxCny', width: 16 },
    { header: '增值税率(%)', key: 'vatRate', width: 12 },
    { header: '退税率(%)', key: 'refundRate', width: 12 },
    { header: '匹配类型', key: 'matchType', width: 12 },
    { header: '税务分类', key: 'taxCategory', width: 14 },
    { header: '备注', key: 'note', width: 20 },
  ];
  applyHeaderStyle(detailSheet);
  if (!taxResult.lines.length) {
    detailSheet.addRow({ index: '-', productName: '（暂无可测算明细）' });
  } else {
    taxResult.lines.forEach((line) => detailSheet.addRow(line));
  }

  const ruleSheet = workbook.addWorksheet('HS编码规则');
  ruleSheet.columns = [
    { header: 'HS编码/前缀', key: 'hsCode', width: 18 },
    { header: '描述', key: 'description', width: 28 },
    { header: '增值税率(%)', key: 'vatRate', width: 14 },
    { header: '退税率(%)', key: 'refundRate', width: 14 },
    { header: '税务分类', key: 'taxCategory', width: 18 },
  ];
  applyHeaderStyle(ruleSheet);
  taxResult.rules.forEach((rule) => ruleSheet.addRow(rule));

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
  doc.fillColor('black');
  doc.font('Helvetica').fontSize(10);
};

const addPdfKeyValues = (doc, rows) => {
  rows.forEach(([label, value]) => {
    doc.font('Helvetica-Bold').text(`${label}:`, { continued: true });
    doc.font('Helvetica').text(` ${value}`);
  });
};

const addPdfLineItems = (doc, lines) => {
  if (!lines.length) {
    doc.text('（暂无可测算明细）');
    return;
  }

  lines.forEach((line) => {
    doc.text(
      `${line.index}. ${line.productName} | HS:${line.hsCode || '-'} | USD:${line.lineAmountUsd.toFixed(2)} | 退税:${line.estimatedRefundCny.toFixed(2)} | 不可退:${line.nonRefundableTaxCny.toFixed(2)} | ${line.taxCategory}`,
    );
  });
};

const exportTaxCalculationPdf = async (contractOrId) => {
  const contract = await resolveContract(contractOrId);
  const taxResult = calculateTaxSummary(contract);
  const doc = new PDFDocument({
    margin: 40,
    size: 'A4',
    compress: false,
  });

  addPdfTitle(doc, 'Tax Calculation Report', `Contract ${taxResult.contract.contractNo}`);

  addPdfSection(doc, 'Summary');
  addPdfKeyValues(doc, [
    ['Contract No.', taxResult.contract.contractNo],
    ['Port', taxResult.contract.portName],
    ['Exchange Rate', taxResult.summary.exchangeRate.toFixed(2)],
    ['Sales Amount (USD)', taxResult.summary.totalSalesUsd.toFixed(2)],
    ['Sales Amount (CNY)', taxResult.summary.totalSalesCny.toFixed(2)],
    ['Estimated Refund (CNY)', taxResult.summary.totalRefundAmountCny.toFixed(2)],
    ['Refund Base (CNY)', taxResult.summary.totalRefundBaseCny.toFixed(2)],
    ['Non-refundable Tax (CNY)', taxResult.summary.totalNonRefundableTaxCny.toFixed(2)],
    ['Matched Lines', `${taxResult.summary.matchedLineCount}/${taxResult.summary.lineCount}`],
  ]);

  addPdfSection(doc, 'Line Items');
  addPdfLineItems(doc, taxResult.lines);

  doc.moveDown(1);
  doc.fontSize(8).fillColor('#6F7F8E').text(`Exported at: ${formatDate(new Date())}`);
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
  HS_RULES,
  normalizeHsCode,
  lookupHsCode,
  calculateTaxSummary,
  exportTaxCalculationExcel,
  exportTaxCalculationPdf,
};
