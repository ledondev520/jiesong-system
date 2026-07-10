/**
 * Input: 采购合同明细、合同发票号码和供应商发票附件
 * Output: 规范化发票号码、催票清单和可复用的发票准备状态
 * Pos: 采购详情、专项单和退税准备共享的供应商发票 Module
 */

const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');
const {
  calculateExpectedLineAmounts,
  summarizePurchaseAmounts,
} = require('./purchaseAmountService');

const MAX_INVOICE_COUNT = 50;
const MAX_INVOICE_NUMBER_LENGTH = 64;

const PURCHASE_INVOICE_INCLUDE = Object.freeze({
  supplier: { select: { id: true, name: true, taxId: true } },
  items: {
    include: {
      product: { select: { id: true, customsName: true, unit: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
  files: {
    where: { category: 'SUPPLIER_INVOICE' },
    orderBy: { uploadedAt: 'desc' },
  },
});

/** 将历史逗号字符串或数组收敛成有序、去重的号码列表。 */
const normalizeInvoiceNumbers = (value) => {
  const source = Array.isArray(value) ? value : [value];
  const numbers = source
    .flatMap((entry) => String(entry ?? '').split(/[\s,，;；]+/))
    .map((entry) => entry.trim())
    .filter(Boolean);
  const unique = Array.from(new Set(numbers));

  if (unique.length > MAX_INVOICE_COUNT) {
    throw createError(`单份采购合同最多登记 ${MAX_INVOICE_COUNT} 个发票号码`, 400);
  }
  const tooLong = unique.find((entry) => entry.length > MAX_INVOICE_NUMBER_LENGTH);
  if (tooLong) {
    throw createError(`单个发票号码不能超过 ${MAX_INVOICE_NUMBER_LENGTH} 个字符`, 400);
  }
  return unique;
};

/** 从采购事实构建催票清单与登记完整度；文件是选填证据，号码是完成条件。 */
const buildPurchaseInvoicePreparation = (contract) => {
  const items = Array.isArray(contract?.items) ? contract.items : [];
  const amountSummary = summarizePurchaseAmounts({
    items,
    taxRate: contract?.taxRate,
    totalAmount: contract?.totalAmount,
    paidAmount: contract?.paidAmount,
  });
  const invoiceNumbers = normalizeInvoiceNumbers(contract?.invoiceNo);
  const invoiceFiles = (contract?.files || []).filter((file) => file.category === 'SUPPLIER_INVOICE');
  const requestLines = items.map((item, index) => {
    const calculated = calculateExpectedLineAmounts(item, amountSummary.taxRate);
    const summarized = amountSummary.lines[index] || calculated;
    return {
      purchaseItemId: item.id,
      productId: item.productId,
      productName: item.product?.customsName || '未知商品',
      specification: item.specification || null,
      unit: item.unit || item.product?.unit || '',
      quantity: Number(item.quantity) || 0,
      netUnitPrice: Number(item.unitPrice) || 0,
      netAmount: calculated.netAmount,
      taxRate: amountSummary.taxRate,
      taxAmount: calculated.taxAmount,
      grossAmount: summarized.grossAmount,
    };
  });
  const issues = amountSummary.issues.map((issue) => ({ ...issue, severity: 'warning' }));
  if (invoiceNumbers.length === 0) {
    issues.unshift({
      code: 'MISSING_INVOICE_NUMBER',
      severity: 'error',
      message: '尚未登记供应商发票号码',
    });
  }

  return {
    purchaseContractId: contract?.id,
    complete: invoiceNumbers.length > 0,
    fileRequired: false,
    invoiceNumbers,
    invoiceFiles,
    issues,
    amounts: {
      taxRate: amountSummary.taxRate,
      netAmount: amountSummary.netAmount,
      taxAmount: amountSummary.taxAmount,
      grossAmount: amountSummary.grossAmount,
    },
    request: {
      contractNo: String(contract?.contractNo || '').replace(/^PO/, 'CG'),
      supplierName: contract?.supplier?.name || '',
      supplierTaxId: contract?.supplier?.taxId || '',
      lines: requestLines,
    },
  };
};

const getPurchaseInvoicePreparation = async (contractId, prismaClient = prisma) => {
  const contract = await prismaClient.purchaseContract.findUnique({
    where: { id: contractId },
    include: PURCHASE_INVOICE_INCLUDE,
  });
  if (!contract) throw createError('采购合同不存在', 404);
  return buildPurchaseInvoicePreparation(contract);
};

const registerPurchaseInvoiceNumbers = async (
  contractId,
  { invoiceNumbers } = {},
  prismaClient = prisma,
) => {
  const normalized = normalizeInvoiceNumbers(invoiceNumbers);
  if (normalized.length === 0) throw createError('请至少登记一个发票号码', 400);

  const existing = await prismaClient.purchaseContract.findUnique({
    where: { id: contractId },
    select: { id: true },
  });
  if (!existing) throw createError('采购合同不存在', 404);

  const contract = await prismaClient.purchaseContract.update({
    where: { id: contractId },
    data: { invoiceNo: normalized.join('，') },
    include: PURCHASE_INVOICE_INCLUDE,
  });
  return buildPurchaseInvoicePreparation(contract);
};

module.exports = {
  MAX_INVOICE_COUNT,
  PURCHASE_INVOICE_INCLUDE,
  buildPurchaseInvoicePreparation,
  getPurchaseInvoicePreparation,
  normalizeInvoiceNumbers,
  registerPurchaseInvoiceNumbers,
};
