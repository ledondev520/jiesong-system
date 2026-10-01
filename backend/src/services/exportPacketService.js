/**
 * Input: 出口合同装箱明细、当前 HS/退税证据、历史报价与本票制单参数
 * Output: 出口三单预检、定价建议及合同/商业发票/装箱单 Excel 归档版本
 * Pos: 出口三单工作台领域 Module；预览只读，确认生成时统一回写价格并归档
 */

const ExcelJS = require('exceljs');
const crypto = require('node:crypto');
const prisma = require('../utils/prisma');
const { buildDerivedSalesAmountUpdate } = require('./salesContractAmount');
const { createError } = require('../middleware/errorHandler');
const { getExportReadiness } = require('./exportReadinessService');
const fileService = require('./fileService');

const DEFAULT_SELLER_NAME = '上海捷淞国际物流有限公司';
const FX_BUFFER = 0.2;
const REFUNDABLE_MARKUP = 0.3;
const NO_REFUND_MARKUP_CAP = 0.1;
const REFUNDABLE_TOLERANCE = 0.05;
const MONEY_EPSILON = 0.01;
const EXPORT_PACKET_DESCRIPTION = '出口三单生成版本（外销合同、商业发票、装箱单）';
const buildPackingSourceVersion = (items) => crypto.createHash('sha256').update(JSON.stringify(
  [...items].sort((a, b) => a.id.localeCompare(b.id)).map((item) => ({
    id: item.id, productId: item.productId, quantity: item.quantity, unit: item.unit,
    boxes: item.boxes, grossWeight: item.grossWeight, netWeight: item.netWeight,
    volume: item.volume, unitPrice: item.unitPrice, totalPrice: item.totalPrice,
    name: item.product?.customsName, supplement: item.supplement,
    specification: item.specification, origin: item.origin,
    hsCode: item.hsCode, declarationElements: item.declarationElements,
    productHsCode: item.product?.hsCode, productDeclaration: item.product?.declaration,
  })),
)).digest('hex');

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((toNumber(value) + Number.EPSILON) * factor) / factor;
};

const normalizeText = (value) => String(value || '').trim().replace(/\s+/g, '').toLowerCase();

const makeIssue = (code, severity, message, packingItemId = null, productName = '') => ({
  code,
  severity,
  message,
  packingItemId,
  productName,
});

const realizedMarkup = (unitPriceUsd, quantity, effectiveRate, costCny) => (
  costCny > 0 ? (unitPriceUsd * quantity * effectiveRate) / costCny - 1 : null
);

const historicalQuoteAllowed = ({ unitPriceUsd, quantity, effectiveRate, costCny, refundRate }) => {
  const markup = realizedMarkup(unitPriceUsd, quantity, effectiveRate, costCny);
  if (markup === null) return { allowed: false, markup };
  if (refundRate === 0) {
    return { allowed: markup >= -1e-9 && markup <= NO_REFUND_MARKUP_CAP + 1e-9, markup };
  }
  return {
    allowed: Math.abs(markup - REFUNDABLE_MARKUP) <= REFUNDABLE_TOLERANCE + 1e-9,
    markup,
  };
};

const unitForRoundedTotal = (total, quantity) => {
  const exact = total / quantity;
  for (let precision = 0; precision <= 10; precision += 1) {
    const factor = 10 ** precision;
    const candidates = [
      Math.floor(exact * factor) / factor,
      round(exact, precision),
      Math.ceil(exact * factor) / factor,
    ].sort((a, b) => Math.abs(a - exact) - Math.abs(b - exact));
    const matching = candidates.find((unit) => round(unit * quantity, 1) === round(total, 1));
    if (matching !== undefined) return matching;
  }
  return round(exact, 10);
};

const calculateFormulaPrice = ({ costCny, quantity, effectiveRate, targetMarkup, strictCap }) => {
  const rawTotal = (costCny * (1 + targetMarkup)) / effectiveRate;
  const rawUnit = rawTotal / quantity;
  const integerUnit = Math.max(1, strictCap ? Math.floor(rawUnit) : Math.round(rawUnit));
  const candidates = [{
    unitPriceUsd: integerUnit,
    totalUsd: round(integerUnit * quantity, 4),
    markup: realizedMarkup(integerUnit, quantity, effectiveRate, costCny),
    roundingMethod: 'integer_unit',
  }];
  const nearestFive = Math.round(rawTotal / 5) * 5;
  for (let offset = -10; offset <= 10; offset += 5) {
    const totalUsd = Math.max(5, nearestFive + offset);
    const unitPriceUsd = unitForRoundedTotal(totalUsd, quantity);
    const markup = realizedMarkup(unitPriceUsd, quantity, effectiveRate, costCny);
    if (strictCap && markup > targetMarkup + 1e-9) continue;
    candidates.push({ unitPriceUsd, totalUsd, markup, roundingMethod: 'total_ends_0_or_5' });
  }
  candidates.sort((a, b) => {
    const gap = Math.abs(a.markup - targetMarkup) - Math.abs(b.markup - targetMarkup);
    if (Math.abs(gap) > 1e-12) return gap;
    const integerPenalty = Number(!Number.isInteger(a.unitPriceUsd)) - Number(!Number.isInteger(b.unitPriceUsd));
    if (integerPenalty !== 0) return integerPenalty;
    return Math.abs(a.totalUsd - rawTotal) - Math.abs(b.totalUsd - rawTotal);
  });
  return { ...candidates[0], rawUnitPriceUsd: rawUnit, rawTotalUsd: rawTotal };
};

const findHistoricalQuote = (historicalQuotes, item, productName) => (
  historicalQuotes.find((quote) => (
    quote.productId === item.productId
    && normalizeText(quote.productName) === normalizeText(productName)
    && normalizeText(quote.specification) === normalizeText(item.specification)
    && normalizeText(item.specification)
  )) || null
);

/** 纯函数：用同一组输入形成页面预览和生成器消费的冻结快照。 */
const evaluateExportPacket = (contract, readiness, historicalQuotes = [], options = {}) => {
  const spotRate = toNumber(options.spotRate || contract.exchangeRate);
  const effectiveRate = round(spotRate - FX_BUFFER, 6);
  const buyerName = String(options.buyerName || '').trim();
  const sellerName = String(options.sellerName || '').trim();
  const packageKind = String(options.packageKind || '').trim();
  const tradeTerm = String(options.tradeTerm || '').trim().toUpperCase();
  const documentDate = String(options.documentDate || '').trim();
  const priceOverrideMap = new Map((options.priceOverrides || []).map((entry) => [
    entry.packingItemId,
    toNumber(entry.unitPriceUsd),
  ]));
  const issues = [];

  if (spotRate <= FX_BUFFER) issues.push(makeIssue('INVALID_SPOT_RATE', 'error', '现汇必须大于 0.2'));
  if (!sellerName) issues.push(makeIssue('MISSING_SELLER', 'error', '请确认卖方名称'));
  if (!buyerName) issues.push(makeIssue('MISSING_BUYER', 'error', '请确认买方名称'));
  if (!packageKind) issues.push(makeIssue('MISSING_PACKAGE_KIND', 'error', '请确认包装种类'));
  if (!tradeTerm) issues.push(makeIssue('MISSING_TRADE_TERM', 'error', '请确认贸易术语'));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(documentDate)) {
    issues.push(makeIssue('INVALID_DOCUMENT_DATE', 'error', '请确认单证日期'));
  }

  const readinessById = new Map((readiness.lines || []).map((line) => [line.packingItemId, line]));
  const lines = (contract.packingItems || []).map((item, index) => {
    const evidence = readinessById.get(item.id) || {};
    const productName = evidence.productName || item.product?.customsName || '';
    const declaration = evidence.declarationElements || item.declarationElements || item.product?.declaration || '';
    const specification = String(
      item.specification
      || item.supplement
      || (/无型号/.test(declaration) ? '无型号' : ''),
    ).trim();
    const quantity = toNumber(item.quantity);
    const purchaseCostCny = toNumber(item.purchaseCost);
    const refundRate = evidence.hsEvidence?.refundRate;
    const lineIssues = [];

    if (!productName) lineIssues.push(makeIssue('MISSING_PRODUCT_NAME', 'error', '缺少品名', item.id, productName));
    if (!specification) lineIssues.push(makeIssue('MISSING_SPECIFICATION', 'error', '缺少规格/型号；无型号时请明确填写“无型号”', item.id, productName));
    if (quantity <= 0) lineIssues.push(makeIssue('MISSING_QUANTITY', 'error', '缺少成交数量', item.id, productName));
    if (!String(item.unit || evidence.unit || '').trim()) lineIssues.push(makeIssue('MISSING_UNIT', 'error', '缺少成交单位', item.id, productName));
    if (toNumber(item.boxes) <= 0) lineIssues.push(makeIssue('MISSING_BOXES', 'error', '缺少包装件数', item.id, productName));
    if (toNumber(item.grossWeight) <= 0) lineIssues.push(makeIssue('MISSING_GROSS_WEIGHT', 'error', '缺少毛重', item.id, productName));
    if (toNumber(item.netWeight) <= 0) lineIssues.push(makeIssue('MISSING_NET_WEIGHT', 'error', '缺少净重', item.id, productName));
    if (toNumber(item.grossWeight) + MONEY_EPSILON < toNumber(item.netWeight)) {
      lineIssues.push(makeIssue('NET_EXCEEDS_GROSS', 'error', '净重不能大于毛重', item.id, productName));
    }
    if (toNumber(item.volume) <= 0) lineIssues.push(makeIssue('MISSING_VOLUME', 'error', '缺少体积', item.id, productName));
    if (!evidence.hsCode || String(evidence.hsCode).length !== 10) lineIssues.push(makeIssue('MISSING_HS', 'error', '缺少有效的 10 位 HS 编码', item.id, productName));
    if (!evidence.hsEvidence) lineIssues.push(makeIssue('MISSING_CURRENT_HS_EVIDENCE', 'error', '缺少当前税则证据', item.id, productName));
    if (refundRate === null || refundRate === undefined) lineIssues.push(makeIssue('MISSING_REFUND_RATE', 'error', '缺少当期退税率', item.id, productName));
    if (!declaration) lineIssues.push(makeIssue('MISSING_DECLARATION', 'error', '缺少已确认申报要素', item.id, productName));
    if (purchaseCostCny <= 0) lineIssues.push(makeIssue('MISSING_PURCHASE_COST', 'error', '缺少采购成本', item.id, productName));

    const targetMarkup = refundRate === 0 ? NO_REFUND_MARKUP_CAP : REFUNDABLE_MARKUP;
    const manualUnitPrice = priceOverrideMap.get(item.id) || 0;
    const historical = findHistoricalQuote(historicalQuotes, item, productName);
    const historicalCheck = historical && effectiveRate > 0 && purchaseCostCny > 0 && quantity > 0
      ? historicalQuoteAllowed({
          unitPriceUsd: historical.unitPriceUsd,
          quantity,
          effectiveRate,
          costCny: purchaseCostCny,
          refundRate,
        })
      : null;
    const formula = effectiveRate > 0 && purchaseCostCny > 0 && quantity > 0
      ? calculateFormulaPrice({
          costCny: purchaseCostCny,
          quantity,
          effectiveRate,
          targetMarkup,
          strictCap: refundRate === 0,
        })
      : null;

    let unitPriceUsd = formula?.unitPriceUsd || 0;
    let totalUsd = formula?.totalUsd || 0;
    let pricingSource = 'formula';
    let pricingReference = refundRate === 0 ? '退税率 0%，加价不超过 10%' : '可退税，目标加价 30%';
    let roundingMethod = formula?.roundingMethod || '';
    if (historical && historicalCheck?.allowed) {
      unitPriceUsd = historical.unitPriceUsd;
      totalUsd = round(unitPriceUsd * quantity, 4);
      pricingSource = 'history';
      pricingReference = `参考 ${historical.contractNo} 同品名同规格报价`;
      roundingMethod = 'historical_quote';
    }
    if (manualUnitPrice > 0) {
      unitPriceUsd = manualUnitPrice;
      totalUsd = round(unitPriceUsd * quantity, 4);
      pricingSource = 'manual';
      pricingReference = '本票人工确认单价';
      roundingMethod = 'manual_confirmation';
    }
    const markup = effectiveRate > 0 && purchaseCostCny > 0
      ? realizedMarkup(unitPriceUsd, quantity, effectiveRate, purchaseCostCny)
      : null;
    if (manualUnitPrice > 0 && refundRate === 0 && markup > NO_REFUND_MARKUP_CAP + 1e-9) {
      lineIssues.push(makeIssue('NO_REFUND_MARKUP_EXCEEDED', 'error', '人工单价使零退税商品加价超过 10%', item.id, productName));
    }
    if (manualUnitPrice > 0 && refundRate > 0 && Math.abs(markup - REFUNDABLE_MARKUP) > REFUNDABLE_TOLERANCE + 1e-9) {
      lineIssues.push(makeIssue('REFUNDABLE_MARKUP_OUTSIDE_POLICY', 'error', '人工单价偏离 30% 目标超过 5 个百分点', item.id, productName));
    }

    issues.push(...lineIssues);
    return {
      index: index + 1,
      packingItemId: item.id,
      productId: item.productId,
      productName,
      specification,
      declaration,
      origin: item.origin || evidence.origin || '',
      hsCode: evidence.hsCode || '',
      refundRate: refundRate ?? null,
      hsSource: evidence.hsSource || 'missing',
      quantity,
      unit: item.unit || evidence.unit || '',
      boxes: toNumber(item.boxes),
      grossWeight: toNumber(item.grossWeight),
      netWeight: toNumber(item.netWeight),
      volume: toNumber(item.volume),
      storeName: item.store?.name || evidence.storeName || '',
      purchaseCostCny,
      unitPriceUsd: round(unitPriceUsd, 10),
      totalUsd: round(totalUsd, 4),
      rawUnitPriceUsd: formula ? round(formula.rawUnitPriceUsd, 10) : 0,
      rawTotalUsd: formula ? round(formula.rawTotalUsd, 4) : 0,
      targetMarkup,
      realizedMarkup: markup === null ? null : round(markup, 6),
      pricingSource,
      pricingReference,
      roundingMethod,
      rejectedHistoricalQuote: historical && !historicalCheck?.allowed ? {
        contractNo: historical.contractNo,
        unitPriceUsd: historical.unitPriceUsd,
        realizedMarkup: round(historicalCheck?.markup, 6),
        reason: '按本票成本和调整汇率复算后不符合利润规则',
      } : null,
      issues: lineIssues,
    };
  });

  const sums = {
    boxes: lines.reduce((sum, line) => sum + line.boxes, 0),
    grossWeight: round(lines.reduce((sum, line) => sum + line.grossWeight, 0), 3),
    netWeight: round(lines.reduce((sum, line) => sum + line.netWeight, 0), 3),
    volume: round(lines.reduce((sum, line) => sum + line.volume, 0), 4),
    totalUsd: round(lines.reduce((sum, line) => sum + line.totalUsd, 0), 2),
    purchaseCostCny: round(lines.reduce((sum, line) => sum + line.purchaseCostCny, 0), 2),
  };
  const headerChecks = [
    ['totalBoxes', 'HEADER_BOXES_MISMATCH', '合同件数与明细合计不一致', sums.boxes],
    ['grossWeight', 'HEADER_GROSS_MISMATCH', '合同毛重与明细合计不一致', sums.grossWeight],
    ['netWeight', 'HEADER_NET_MISMATCH', '合同净重与明细合计不一致', sums.netWeight],
    ['volume', 'HEADER_VOLUME_MISMATCH', '合同体积与明细合计不一致', sums.volume],
  ];
  for (const [field, code, message, calculated] of headerChecks) {
    const stored = toNumber(contract[field]);
    if (stored > 0 && Math.abs(stored - calculated) > MONEY_EPSILON) {
      issues.push(makeIssue(code, 'error', `${message}：合同 ${stored}，明细 ${calculated}`));
    }
  }
  if (lines.length === 0) issues.push(makeIssue('NO_PACKING_ITEMS', 'error', '当前 EXP 没有装箱明细'));

  return {
    contractId: contract.id,
    contractNo: contract.contractNo,
    sellerName,
    buyerName,
    packageKind,
    documentDate,
    portName: contract.port?.name || readiness.portName || '',
    containerLabel: contract.containerLabel || '',
    currency: 'USD',
    tradeTerm,
    pricingPolicy: {
      spotRate,
      fxBuffer: FX_BUFFER,
      effectiveRate,
      refundableMarkup: REFUNDABLE_MARKUP,
      noRefundMarkupCap: NO_REFUND_MARKUP_CAP,
      historyRule: '同品名 + 同规格，且按本票成本复算符合利润规则',
    },
    ready: !issues.some((issue) => issue.severity === 'error'),
    issues,
    lines,
    summary: {
      ...sums,
      lineCount: lines.length,
      noRefundLineCount: lines.filter((line) => line.refundRate === 0).length,
      errorCount: issues.filter((issue) => issue.severity === 'error').length,
      warningCount: issues.filter((issue) => issue.severity === 'warning').length,
    },
  };
};

const loadPacketSources = async (salesContractId, options = {}, prismaClient = prisma) => {
  const contract = await prismaClient.salesContract.findUnique({
    where: { id: salesContractId },
    include: {
      port: true,
      packingItems: {
        include: { product: true, store: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!contract) throw createError('出口合同不存在', 404);
  const readiness = await getExportReadiness(salesContractId, {
    overrides: options.hsOverrides || [],
  }, prismaClient);
  const productIds = Array.from(new Set(contract.packingItems.map((item) => item.productId).filter(Boolean)));
  const historicalItems = productIds.length > 0
    ? await prismaClient.packingItem.findMany({
        where: {
          salesContractId: { not: salesContractId },
          productId: { in: productIds },
          unitPrice: { gt: 0 },
        },
        include: {
          product: { select: { customsName: true } },
          salesContract: { select: { contractNo: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
    : [];
  const historicalQuotes = historicalItems.map((item) => ({
    productId: item.productId,
    productName: item.product?.customsName || '',
    specification: item.specification || '',
    unitPriceUsd: toNumber(item.unitPrice),
    contractNo: item.salesContract?.contractNo || '',
  }));
  return { contract, readiness, historicalQuotes };
};

const previewExportPacket = async (salesContractId, options = {}, prismaClient = prisma) => {
  const sources = await loadPacketSources(salesContractId, options, prismaClient);
  return evaluateExportPacket(sources.contract, sources.readiness, sources.historicalQuotes, options);
};

const border = { style: 'thin', color: { argb: 'FFB7C4CE' } };
const applyTitle = (sheet, title, subtitle) => {
  sheet.mergeCells('A1:J1');
  sheet.getCell('A1').value = title;
  sheet.getCell('A1').font = { name: 'Arial', size: 18, bold: true };
  sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 30;
  sheet.mergeCells('A2:J2');
  sheet.getCell('A2').value = subtitle;
  sheet.getCell('A2').font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF475569' } };
  sheet.getCell('A2').alignment = { horizontal: 'center' };
};

const styleTable = (sheet, headerRow, lastRow, lastColumn) => {
  const header = sheet.getRow(headerRow);
  header.height = 30;
  header.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { top: border, left: border, bottom: border, right: border };
  });
  for (let rowIndex = headerRow + 1; rowIndex <= lastRow; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    row.height = 28;
    for (let columnIndex = 1; columnIndex <= lastColumn; columnIndex += 1) {
      const cell = row.getCell(columnIndex);
      cell.font = { name: 'Arial', size: 9 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { top: border, left: border, bottom: border, right: border };
      if (rowIndex % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    }
  }
};

const addDocumentMeta = (sheet, packet) => {
  const rows = [
    ['Seller', packet.sellerName, 'Contract No.', packet.contractNo],
    ['Buyer', packet.buyerName, 'Date', packet.documentDate],
    ['Destination', packet.portName || '-', 'Trade Term', packet.tradeTerm],
    ['Currency', packet.currency, 'Package', packet.packageKind],
  ];
  rows.forEach((values, offset) => {
    const row = 4 + offset;
    sheet.getCell(row, 1).value = values[0];
    sheet.mergeCells(row, 2, row, 5);
    sheet.getCell(row, 2).value = values[1];
    sheet.getCell(row, 6).value = values[2];
    sheet.mergeCells(row, 7, row, 10);
    sheet.getCell(row, 7).value = values[3];
    [1, 6].forEach((column) => {
      sheet.getCell(row, column).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF1E3A5F' } };
    });
  });
};

const configureSheet = (sheet) => {
  sheet.views = [{ state: 'frozen', ySplit: 8 }];
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  sheet.pageMargins = { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 };
  sheet.columns = [10, 22, 18, 14, 12, 12, 14, 14, 14, 18].map((width) => ({ width }));
};

const buildExportPacketWorkbook = async (packet) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '捷淞进销存系统';
  workbook.created = new Date();

  const contractSheet = workbook.addWorksheet('外销合同');
  configureSheet(contractSheet);
  applyTitle(contractSheet, 'SALES CONTRACT / 外销合同', packet.contractNo);
  addDocumentMeta(contractSheet, packet);
  contractSheet.getRow(9).values = ['No.', 'Description', 'Specification', 'HS Code', 'Quantity', 'Unit', 'Unit Price (USD)', 'Amount (USD)', 'Package', 'Remarks'];
  packet.lines.forEach((line, index) => {
    contractSheet.getRow(10 + index).values = [line.index, line.productName, line.specification, line.hsCode, line.quantity, line.unit, line.unitPriceUsd, line.totalUsd, packet.packageKind, line.storeName];
  });
  const contractTotalRow = 10 + packet.lines.length;
  contractSheet.mergeCells(contractTotalRow, 1, contractTotalRow, 7);
  contractSheet.getCell(contractTotalRow, 1).value = 'TOTAL / 合计';
  contractSheet.getCell(contractTotalRow, 8).value = packet.summary.totalUsd;
  styleTable(contractSheet, 9, contractTotalRow, 10);
  contractSheet.getCell(contractTotalRow, 1).font = { name: 'Arial', bold: true };
  contractSheet.getCell(contractTotalRow, 8).font = { name: 'Arial', bold: true };
  contractSheet.getColumn(7).numFmt = '#,##0.##########';
  contractSheet.getColumn(8).numFmt = '#,##0.00';

  const invoiceSheet = workbook.addWorksheet('商业发票');
  configureSheet(invoiceSheet);
  applyTitle(invoiceSheet, 'COMMERCIAL INVOICE / 商业发票', `Invoice No. ${packet.contractNo}`);
  addDocumentMeta(invoiceSheet, packet);
  invoiceSheet.getRow(9).values = ['No.', 'Description', 'Specification', 'HS Code', 'Quantity', 'Unit', 'Unit Price (USD)', 'Amount (USD)', 'Origin', 'Declaration'];
  packet.lines.forEach((line, index) => {
    invoiceSheet.getRow(10 + index).values = [line.index, line.productName, line.specification, line.hsCode, line.quantity, line.unit, line.unitPriceUsd, line.totalUsd, line.origin, line.declaration];
  });
  const invoiceTotalRow = 10 + packet.lines.length;
  invoiceSheet.mergeCells(invoiceTotalRow, 1, invoiceTotalRow, 7);
  invoiceSheet.getCell(invoiceTotalRow, 1).value = 'TOTAL / 合计';
  invoiceSheet.getCell(invoiceTotalRow, 8).value = packet.summary.totalUsd;
  styleTable(invoiceSheet, 9, invoiceTotalRow, 10);
  invoiceSheet.getCell(invoiceTotalRow, 1).font = { name: 'Arial', bold: true };
  invoiceSheet.getCell(invoiceTotalRow, 8).font = { name: 'Arial', bold: true };
  invoiceSheet.getColumn(7).numFmt = '#,##0.##########';
  invoiceSheet.getColumn(8).numFmt = '#,##0.00';

  const packingSheet = workbook.addWorksheet('装箱单');
  configureSheet(packingSheet);
  applyTitle(packingSheet, 'PACKING LIST / 装箱单', packet.contractNo);
  addDocumentMeta(packingSheet, packet);
  packingSheet.getRow(9).values = ['No.', 'Description', 'Specification', 'Quantity', 'Unit', 'Packages', 'Gross Wt. (KG)', 'Net Wt. (KG)', 'Volume (CBM)', 'Package Kind'];
  packet.lines.forEach((line, index) => {
    packingSheet.getRow(10 + index).values = [line.index, line.productName, line.specification, line.quantity, line.unit, line.boxes, line.grossWeight, line.netWeight, line.volume, packet.packageKind];
  });
  const packingTotalRow = 10 + packet.lines.length;
  packingSheet.mergeCells(packingTotalRow, 1, packingTotalRow, 5);
  packingSheet.getCell(packingTotalRow, 1).value = 'TOTAL / 合计';
  packingSheet.getCell(packingTotalRow, 6).value = packet.summary.boxes;
  packingSheet.getCell(packingTotalRow, 7).value = packet.summary.grossWeight;
  packingSheet.getCell(packingTotalRow, 8).value = packet.summary.netWeight;
  packingSheet.getCell(packingTotalRow, 9).value = packet.summary.volume;
  styleTable(packingSheet, 9, packingTotalRow, 10);
  [1, 6, 7, 8, 9].forEach((column) => { packingSheet.getCell(packingTotalRow, column).font = { name: 'Arial', bold: true }; });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
};

const generateExportPacket = async (salesContractId, options = {}, prismaClient = prisma) => {
  const sources = await loadPacketSources(salesContractId, options, prismaClient);
  const packet = evaluateExportPacket(sources.contract, sources.readiness, sources.historicalQuotes, options);
  if (!packet.ready) {
    const first = packet.issues.find((issue) => issue.severity === 'error');
    throw createError(`出口三单资料未完整：${first?.productName ? `${first.productName}：` : ''}${first?.message || '请先完成预检'}`, 400);
  }
  const buffer = await buildExportPacketWorkbook(packet);
  const dateTag = packet.documentDate.replace(/-/g, '');
  const fileName = `${packet.contractNo}_出口合同_商业发票_装箱单_${dateTag}.xlsx`;
  let file;
  await prismaClient.$transaction(async (tx) => {
    for (const line of packet.lines) {
      await tx.packingItem.update({
        where: { id: line.packingItemId },
        data: { unitPrice: line.unitPriceUsd, totalPrice: line.totalUsd },
      });
    }
    await tx.salesContract.update({
      where: { id: salesContractId },
      data: {
        ...buildDerivedSalesAmountUpdate(sources.contract, packet.summary.totalUsd),
        exchangeRate: packet.pricingPolicy.spotRate,
      },
    });
    file = await fileService.archiveGeneratedFile({
      contractId: salesContractId,
      contractType: fileService.CONTRACT_TYPE.SALES,
      buffer,
      fileName,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      category: fileService.CONTRACT_FILE_CATEGORY.SYSTEM_GENERATED_XLSX,
      description: `${EXPORT_PACKET_DESCRIPTION}:${buildPackingSourceVersion(sources.contract.packingItems.map((item) => {
        const line = packet.lines.find((entry) => entry.packingItemId === item.id);
        return line ? { ...item, unitPrice: line.unitPriceUsd, totalPrice: line.totalUsd } : item;
      }))}`,
      prismaClient: tx,
    });
  });
  return { packet, file };
};

module.exports = {
  EXPORT_PACKET_DESCRIPTION,
  buildPackingSourceVersion,
  DEFAULT_SELLER_NAME,
  FX_BUFFER,
  NO_REFUND_MARKUP_CAP,
  REFUNDABLE_MARKUP,
  buildExportPacketWorkbook,
  calculateFormulaPrice,
  evaluateExportPacket,
  generateExportPacket,
  historicalQuoteAllowed,
  previewExportPacket,
};
