/**
 * Input: 船司装箱单 PDF、出口合同装箱事实、核对人和人工复核结论
 * Output: 原 PDF 受限归档、逐商品差异、历史记录及最终核对结论
 * Pos: 出口单证阶段的船司装箱单核对 Module
 */

const path = require('path');
const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');
const {
  archiveBufferFile,
  CONTRACT_FILE_CATEGORY,
  CONTRACT_TYPE,
} = require('./fileService');

const PARSER_VERSION = '2026-07-product-scoped-v1';
const CHECK_STATUS = Object.freeze({
  PASSED: 'PASSED',
  DIFFERENCE: 'DIFFERENCE',
  NEEDS_MANUAL_REVIEW: 'NEEDS_MANUAL_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
});

const PDFJS_STANDARD_FONTS_DIR = path.join(
  path.dirname(require.resolve('pdfjs-dist/package.json')),
  'standard_fonts/',
);

const CHECK_INCLUDE = Object.freeze({
  file: true,
  checkedBy: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
});

/** 职责：用 pdfjs-dist 提取 PDF 全文文本（逐页拼接）。 */
const extractPdfText = async (buffer) => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
    standardFontDataUrl: PDFJS_STANDARD_FONTS_DIR,
  });
  try {
    const doc = await loadingTask.promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => item.str).join(' '));
    }
    return pages.join('\n');
  } finally {
    await loadingTask.destroy();
  }
};

const extractNumbers = (text) => {
  const matches = String(text || '').match(/\d[\d,]*(?:\.\d+)?/g) || [];
  return matches
    .map((token) => Number.parseFloat(token.replace(/,/g, '')))
    .filter((number) => Number.isFinite(number));
};

const matchNumber = (numbers, expected, tolAbs = 0, tolRel = 0) => {
  if (!Number.isFinite(expected)) return { matched: false, closest: null };
  const tolerance = Math.max(tolAbs, Math.abs(expected) * tolRel);
  let closest = null;
  let minDiff = Infinity;
  for (const number of numbers) {
    const diff = Math.abs(number - expected);
    if (diff < minDiff) {
      minDiff = diff;
      closest = number;
    }
  }
  return { matched: closest !== null && minDiff <= tolerance, closest };
};

const normalizeHsCode = (value) => String(value || '').replace(/\D/g, '').slice(0, 10);

const getItemIdentityCandidates = (item) => {
  const productName = String(item?.product?.customsName || '').trim();
  const hsCode = normalizeHsCode(item?.product?.hsCode);
  return [productName, hsCode.length === 10 ? hsCode : ''].filter(Boolean);
};

const findEarliestIdentity = (lowerText, candidates, startAt = 0) => {
  let best = null;
  candidates.forEach((candidate) => {
    const index = lowerText.indexOf(candidate.toLowerCase(), startAt);
    if (index >= 0 && (!best || index < best.index)) best = { index, candidate };
  });
  return best;
};

/**
 * 职责：定位单个商品在 PDF 中的局部文本片段，避免用整份 PDF 的重复数字伪造逐行匹配。
 */
const locateItemSegment = (text, item, nextItem, startAt = 0) => {
  const lowerText = text.toLowerCase();
  const identity = findEarliestIdentity(lowerText, getItemIdentityCandidates(item), startAt);
  if (!identity) return { matched: false, closest: null, segment: '', nextCursor: startAt };

  const nextIdentity = nextItem
    ? findEarliestIdentity(
        lowerText,
        getItemIdentityCandidates(nextItem),
        identity.index + identity.candidate.length,
      )
    : null;
  const end = nextIdentity?.index || Math.min(text.length, identity.index + 400);
  return {
    matched: true,
    closest: identity.candidate,
    segment: text.slice(identity.index, end),
    nextCursor: identity.index + identity.candidate.length,
  };
};

/** 职责：将合同当前事实与 PDF 文本做汇总及逐商品局部比对。 */
const buildComparison = (contract, pdfText) => {
  const text = String(pdfText || '');
  const compactText = text.replace(/\s+/g, '').toLowerCase();
  const numbers = extractNumbers(text);
  const contractCandidates = [contract.contractNo, contract.containerLabel]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const matchedContractIdentity = contractCandidates.find((candidate) => (
    compactText.includes(candidate.replace(/\s+/g, '').toLowerCase())
  ));

  const fieldDefs = [
    { key: 'totalBoxes', label: '总箱数', expected: contract.totalBoxes, tolAbs: 0, tolRel: 0 },
    { key: 'grossWeight', label: '毛重 (kg)', expected: contract.grossWeight, tolAbs: 1, tolRel: 0.005 },
    { key: 'netWeight', label: '净重 (kg)', expected: contract.netWeight, tolAbs: 1, tolRel: 0.005 },
    { key: 'volume', label: '体积 (CBM)', expected: contract.volume, tolAbs: 0.05, tolRel: 0.01 },
  ];
  const fields = [
    {
      key: 'contractNo',
      label: '合同号/柜号',
      expected: contractCandidates.join(' / ') || '-',
      matched: Boolean(matchedContractIdentity),
      closest: matchedContractIdentity || null,
    },
    ...fieldDefs.map(({ key, label, expected, tolAbs, tolRel }) => {
      const value = Number(expected) || 0;
      if (value <= 0) return { key, label, expected: null, matched: null, closest: null };
      const { matched, closest } = matchNumber(numbers, value, tolAbs, tolRel);
      return { key, label, expected: value, matched, closest };
    }),
  ];

  let cursor = 0;
  const packingItems = contract.packingItems || [];
  const items = packingItems.map((item, index) => {
    const productName = item.product?.customsName || '未知商品';
    const hsCode = normalizeHsCode(item.product?.hsCode);
    const identityExpected = [productName, hsCode].filter(Boolean).join(' / ');
    const located = locateItemSegment(text, item, packingItems[index + 1], cursor);
    if (located.matched) cursor = located.nextCursor;
    const scopedNumbers = located.matched ? extractNumbers(located.segment) : [];
    const boxes = Number(item.boxes) || 0;
    const quantity = Number(item.quantity) || 0;
    const boxesResult = !located.matched || boxes <= 0
      ? { matched: null, closest: null }
      : matchNumber(scopedNumbers, boxes, 0, 0);
    const quantityResult = !located.matched || quantity <= 0
      ? { matched: null, closest: null }
      : matchNumber(scopedNumbers, quantity, 0, 0);
    return {
      packingItemId: item.id || null,
      productId: item.productId || null,
      productName,
      hsCode,
      identity: {
        expected: identityExpected,
        matched: located.matched,
        closest: located.closest,
      },
      boxes: { expected: boxes > 0 ? boxes : null, ...boxesResult },
      quantity: { expected: quantity > 0 ? quantity : null, ...quantityResult },
    };
  });

  const comparableFields = fields.filter((field) => field.matched !== null);
  const mismatchedFields = comparableFields.filter((field) => field.matched === false);
  const itemChecks = items
    .flatMap((item) => [item.identity, item.boxes, item.quantity])
    .filter((check) => check.matched !== null);
  const mismatchedItemChecks = itemChecks.filter((check) => check.matched === false);
  return {
    summary: {
      ok: mismatchedFields.length === 0 && mismatchedItemChecks.length === 0,
      manualReviewRequired: false,
      fieldTotal: comparableFields.length,
      fieldMismatched: mismatchedFields.length,
      itemCheckTotal: itemChecks.length,
      itemCheckMismatched: mismatchedItemChecks.length,
      pdfNumberCount: numbers.length,
      pdfTextLength: text.length,
    },
    fields,
    items,
  };
};

const buildManualReviewComparison = (textLength = 0) => ({
  summary: {
    ok: false,
    manualReviewRequired: true,
    fieldTotal: 0,
    fieldMismatched: 0,
    itemCheckTotal: 0,
    itemCheckMismatched: 0,
    pdfNumberCount: 0,
    pdfTextLength: textLength,
  },
  fields: [],
  items: [],
});

const safeJsonParse = (value, fallback) => {
  try {
    return typeof value === 'string' ? JSON.parse(value) : value || fallback;
  } catch {
    return fallback;
  }
};

const toCheckRecord = (record) => {
  if (!record) return null;
  const { summaryJson, resultJson, ...rest } = record;
  const summary = safeJsonParse(summaryJson, {});
  return {
    ...rest,
    summary,
    comparison: safeJsonParse(resultJson, { summary, fields: [], items: [] }),
  };
};

const normalizeUploadedPdf = (file) => {
  const normalized = Buffer.isBuffer(file)
    ? { buffer: file, originalname: '船司装箱单.pdf', mimetype: 'application/pdf' }
    : file;
  if (!Buffer.isBuffer(normalized?.buffer) || normalized.buffer.length === 0) {
    throw createError('请选择要核对的装箱单 PDF', 400);
  }
  if (normalized.mimetype && normalized.mimetype !== 'application/pdf') {
    throw createError('仅支持 PDF 格式的装箱单', 400);
  }
  return {
    buffer: normalized.buffer,
    fileName: path.basename(normalized.originalname || '船司装箱单.pdf'),
    mimeType: 'application/pdf',
  };
};

/**
 * 职责：解析、归档并持久化一次核对。图片型 PDF 进入人工复核，不丢失原始文件。
 */
const checkPackingListPdf = async (contractId, uploadedFile, {
  checkedById = null,
  prismaClient = prisma,
  extractText = extractPdfText,
  archiveFile = archiveBufferFile,
} = {}) => {
  const file = normalizeUploadedPdf(uploadedFile);
  const contract = await prismaClient.salesContract.findUnique({
    where: { id: contractId },
    include: {
      packingItems: {
        include: { product: { select: { customsName: true, hsCode: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!contract) throw createError('出口合同不存在', 404);

  let rawText;
  try {
    rawText = await extractText(file.buffer);
  } catch {
    throw createError('PDF 解析失败，请确认文件未损坏', 422);
  }
  const text = String(rawText || '').trim();
  const comparison = text.length < 20
    ? buildManualReviewComparison(text.length)
    : buildComparison(contract, text);
  const automaticStatus = comparison.summary.manualReviewRequired
    ? CHECK_STATUS.NEEDS_MANUAL_REVIEW
    : comparison.summary.ok
      ? CHECK_STATUS.PASSED
      : CHECK_STATUS.DIFFERENCE;

  const fileRecord = await archiveFile({
    contractId,
    contractType: CONTRACT_TYPE.SALES,
    buffer: file.buffer,
    fileName: file.fileName,
    mimeType: file.mimeType,
    category: CONTRACT_FILE_CATEGORY.CARRIER_DOCUMENT,
    description: '船司装箱单核对原件',
    storageScope: 'carrier-documents',
    defaultDescription: '船司装箱单核对原件',
    prismaClient,
  });

  const record = await prismaClient.packingListCheck.create({
    data: {
      salesContractId: contractId,
      salesContractFileId: fileRecord.id,
      checkedById,
      automaticStatus,
      status: automaticStatus,
      summaryJson: JSON.stringify(comparison.summary),
      resultJson: JSON.stringify(comparison),
      fieldMismatched: comparison.summary.fieldMismatched,
      itemCheckMismatched: comparison.summary.itemCheckMismatched,
      parserVersion: PARSER_VERSION,
    },
    include: CHECK_INCLUDE,
  });
  return toCheckRecord(record);
};

const listPackingListChecks = async (contractId, { limit = 20 } = {}, prismaClient = prisma) => {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  const records = await prismaClient.packingListCheck.findMany({
    where: { salesContractId: contractId },
    orderBy: [{ checkedAt: 'desc' }, { createdAt: 'desc' }],
    take: safeLimit,
    include: CHECK_INCLUDE,
  });
  return records.map(toCheckRecord);
};

const reviewPackingListCheck = async (contractId, checkId, {
  decision,
  note,
  reviewedById = null,
} = {}, prismaClient = prisma) => {
  if (![CHECK_STATUS.APPROVED, CHECK_STATUS.REJECTED].includes(decision)) {
    throw createError('人工核对结论必须为 APPROVED 或 REJECTED', 400);
  }
  const reviewNote = String(note || '').trim();
  if (!reviewNote) throw createError('请填写人工核对说明', 400);
  if (reviewNote.length > 1000) throw createError('人工核对说明不能超过 1000 字', 400);

  const existing = await prismaClient.packingListCheck.findFirst({
    where: { id: checkId, salesContractId: contractId },
  });
  if (!existing) throw createError('装箱单核对记录不存在', 404);
  const updated = await prismaClient.packingListCheck.update({
    where: { id: checkId },
    data: {
      status: decision,
      reviewNote,
      reviewedById,
      reviewedAt: new Date(),
    },
    include: CHECK_INCLUDE,
  });
  return toCheckRecord(updated);
};

module.exports = {
  CHECK_STATUS,
  PARSER_VERSION,
  buildComparison,
  checkPackingListPdf,
  listPackingListChecks,
  reviewPackingListCheck,
  _internal: {
    buildManualReviewComparison,
    extractNumbers,
    extractPdfText,
    locateItemSegment,
    matchNumber,
    toCheckRecord,
  },
};
