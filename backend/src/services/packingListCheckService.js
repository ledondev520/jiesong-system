/**
 * Input: 船司装箱单 PDF Buffer（pdfjs-dist 解析）、出口合同及装箱明细（Prisma）
 * Output: 装箱单与系统数据的逐项比对结果（合同号/箱数/毛重/净重/体积/明细行，含差异警示）
 * Pos: 出口环节核对服务，供 POST /sales/:id/packing-list-check 使用
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const path = require('path');
const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');

// pdfjs-dist 标准字体目录（缺失时部分 PDF 会告警甚至解析失败）
const PDFJS_STANDARD_FONTS_DIR = path.join(
  path.dirname(require.resolve('pdfjs-dist/package.json')),
  'standard_fonts/',
);

/**
 * 职责：用 pdfjs-dist 提取 PDF 全文文本（逐页拼接）
 * 思路：pdfjs-dist 仅提供 ESM legacy 构建，CommonJS 下通过动态 import 加载；
 *       资源释放需调用 loadingTask.destroy()（文档代理本身无 destroy）
 * @param {Buffer} buffer PDF 文件内容
 * @returns {Promise<string>} 全文文本
 */
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

/**
 * 职责：从 PDF 文本中提取所有数值（去千分位）
 * @param {string} text PDF 全文
 * @returns {number[]} 数值列表（保留重复）
 */
const extractNumbers = (text) => {
  const matches = String(text || '').match(/\d[\d,]*(?:\.\d+)?/g) || [];
  return matches
    .map((token) => Number.parseFloat(token.replace(/,/g, '')))
    .filter((n) => Number.isFinite(n));
};

/**
 * 职责：在 PDF 数值集合中查找与期望值最接近的数，并判断是否在容差内匹配
 * 思路：容差取「绝对容差」与「相对容差 × 期望值」二者较大者，兼顾小数值与大数值
 * @param {number[]} numbers PDF 提取的数值列表
 * @param {number} expected 系统期望值
 * @param {number} tolAbs 绝对容差
 * @param {number} tolRel 相对容差（如 0.005 = 0.5%）
 * @returns {{ matched: boolean, closest: number|null }}
 */
const matchNumber = (numbers, expected, tolAbs = 0, tolRel = 0) => {
  if (!Number.isFinite(expected)) {
    return { matched: false, closest: null };
  }
  const tolerance = Math.max(tolAbs, Math.abs(expected) * tolRel);
  let closest = null;
  let minDiff = Infinity;
  for (const n of numbers) {
    const diff = Math.abs(n - expected);
    if (diff < minDiff) {
      minDiff = diff;
      closest = n;
    }
  }
  return { matched: closest !== null && minDiff <= tolerance, closest };
};

/**
 * 职责：将合同数据与 PDF 文本做逐项比对（纯函数，便于测试）
 * 思路：
 *   1. 合同号做子串匹配（忽略大小写与空白）
 *   2. 汇总指标（箱数/毛重/净重/体积）在 PDF 数值集合中按容差匹配
 *   3. 每条装箱明细的箱数与数量分别匹配，任一缺失记为差异
 * @param {object} contract 含 contractNo/totalBoxes/grossWeight/netWeight/volume/packingItems
 * @param {string} pdfText PDF 全文文本
 * @returns {{ summary: object, fields: object[], items: object[] }}
 */
const buildComparison = (contract, pdfText) => {
  const text = String(pdfText || '');
  const compactText = text.replace(/\s+/g, '').toLowerCase();
  const numbers = extractNumbers(text);

  // 1. 合同号匹配
  const contractNo = String(contract.contractNo || '');
  const contractNoFound = contractNo
    ? compactText.includes(contractNo.replace(/\s+/g, '').toLowerCase())
    : false;

  // 2. 汇总指标匹配（箱数精确；毛重/净重 ±1kg 或 0.5%；体积 ±0.05 或 1%）
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
      expected: contractNo || '-',
      matched: contractNoFound,
      closest: contractNoFound ? contractNo : null,
    },
    ...fieldDefs.map(({ key, label, expected, tolAbs, tolRel }) => {
      const value = Number(expected) || 0;
      if (value <= 0) {
        // 系统未录入该指标，跳过比对（不算差异，但标记提示）
        return { key, label, expected: null, matched: null, closest: null };
      }
      const { matched, closest } = matchNumber(numbers, value, tolAbs, tolRel);
      return { key, label, expected: value, matched, closest };
    }),
  ];

  // 3. 装箱明细逐行匹配（箱数精确 + 数量精确）
  const items = (contract.packingItems || []).map((item) => {
    const productName = item.product?.customsName || '未知商品';
    const boxes = Number(item.boxes) || 0;
    const quantity = Number(item.quantity) || 0;
    const boxesResult = boxes > 0 ? matchNumber(numbers, boxes, 0, 0) : { matched: null, closest: null };
    const quantityResult = quantity > 0 ? matchNumber(numbers, quantity, 0, 0) : { matched: null, closest: null };
    return {
      productName,
      boxes: { expected: boxes > 0 ? boxes : null, matched: boxesResult.matched, closest: boxesResult.closest },
      quantity: { expected: quantity > 0 ? quantity : null, matched: quantityResult.matched, closest: quantityResult.closest },
    };
  });

  // 4. 汇总统计（matched === null 的字段视为未比对，不计入差异）
  const comparableFields = fields.filter((f) => f.matched !== null);
  const mismatchedFields = comparableFields.filter((f) => f.matched === false);
  const itemChecks = items.flatMap((i) => [i.boxes, i.quantity]).filter((c) => c.matched !== null);
  const mismatchedItemChecks = itemChecks.filter((c) => c.matched === false);

  return {
    summary: {
      ok: mismatchedFields.length === 0 && mismatchedItemChecks.length === 0,
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

/**
 * 职责：解析上传的船司装箱单 PDF 并与出口合同数据比对
 * 思路：
 *   1. 读取合同（含装箱明细与商品名）
 *   2. pdf-parse 提取全文文本，文本过短视为扫描件（无法比对）
 *   3. 调 buildComparison 输出结构化比对结果
 * @param {string} contractId 出口合同 ID
 * @param {Buffer} pdfBuffer 上传的 PDF 文件内容
 * @returns {Promise<object>} 比对结果
 * @throws 404 合同不存在；422 PDF 无可提取文本
 */
const checkPackingListPdf = async (contractId, pdfBuffer) => {
  // 1. 查询合同
  const contract = await prisma.salesContract.findUnique({
    where: { id: contractId },
    include: {
      packingItems: { include: { product: { select: { customsName: true } } } },
    },
  });
  if (!contract) {
    throw createError('出口合同不存在', 404);
  }

  // 2. 解析 PDF 文本
  let rawText;
  try {
    rawText = await extractPdfText(pdfBuffer);
  } catch (error) {
    throw createError('PDF 解析失败，请确认文件未损坏', 422);
  }

  const text = String(rawText || '').trim();
  if (text.length < 20) {
    throw createError('PDF 中未提取到有效文本（可能是扫描件/图片型 PDF），无法自动比对，请人工核对', 422);
  }

  // 3. 比对
  return buildComparison(contract, text);
};

module.exports = {
  buildComparison,
  checkPackingListPdf,
  _internal: { extractNumbers, matchNumber, extractPdfText },
};
