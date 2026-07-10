/**
 * Input: 退税记录筛选条件
 * Output: 导出前校验结果、告警、可修复提示与 passed-only 导出数据
 * Pos: 税退模块服务层，负责出口退税申报前校验与导出构建
 */

const prisma = require('../utils/prisma');
const { normalizeInvoiceNumbers } = require('./purchaseInvoiceService');
const { normalizePurchaseTaxRate } = require('./purchaseAmountService');

const MATCH_STATUS = {
  PENDING: 'pending',
  PASSED: 'passed',
  BLOCKED: 'blocked',
};

const normalizeIdentifier = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const compacted = String(value).replace(/\s+/g, '').trim();
  if (!compacted) {
    return '';
  }

  const normalized = compacted.replace(/^0+/, '');
  return normalized || compacted;
};

const normalizeVatRateType = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** 发票号码属于业务标识，不能像内部关联号一样删除前导 0。 */
const normalizeInvoiceIdentifier = (value) => {
  try {
    return normalizeInvoiceNumbers(value).join('，');
  } catch {
    return '';
  }
};

const buildWhere = ({ ids, salesContractId, status, keyword } = {}) => {
  const where = {};

  if (Array.isArray(ids) && ids.length > 0) {
    where.id = { in: ids };
  }
  if (salesContractId) {
    where.salesContractId = salesContractId;
  }
  if (status) {
    where.status = status;
  }
  if (keyword) {
    where.OR = [
      { refundNo: { contains: keyword } },
      { note: { contains: keyword } },
    ];
  }

  return where;
};

const escapeCsvValue = (value) => {
  if (value === undefined || value === null) {
    return '';
  }

  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const buildCsv = (items) => {
  const headers = [
    'refund_no',
    'sales_contract_id',
    'customs_declaration_id',
    'relation_no',
    'invoice_no',
    'vat_rate_type',
    'match_status',
    'status',
    'declared_amount',
    'refundable_amount',
    'refunded_amount',
    'applied_at',
    'refunded_at',
    'note',
  ];

  const lines = [
    headers.join(','),
    ...items.map((item) => headers.map((key) => escapeCsvValue(item[key])).join(',')),
  ];

  return lines.join('\n');
};

const buildFixes = (record, normalizedRelationNo, normalizedInvoiceNo) => {
  const fixes = [];

  if (
    record.relation_no !== undefined
    && record.relation_no !== null
    && normalizedRelationNo !== null
    && String(record.relation_no) !== normalizedRelationNo
  ) {
    fixes.push({
      taxRefundId: record.id,
      refundNo: record.refundNo,
      field: 'relation_no',
      from: record.relation_no,
      to: normalizedRelationNo,
      suggestion: '去除空格与前导0后重新保存关联号',
    });
  }

  if (
    record.invoice_no !== undefined
    && record.invoice_no !== null
    && normalizedInvoiceNo !== null
    && String(record.invoice_no) !== normalizedInvoiceNo
  ) {
    fixes.push({
      taxRefundId: record.id,
      refundNo: record.refundNo,
      field: 'invoice_no',
      from: record.invoice_no,
      to: normalizedInvoiceNo,
      suggestion: '去除分隔符两侧空格并按规范分隔后重新保存发票号（保留前导0）',
    });
  }

  return fixes;
};

const buildAmountWarnings = (record) => {
  const warnings = [];
  const declaredAmount = Number(record.declaredAmount || 0);
  const refundableAmount = Number(record.refundableAmount || 0);
  const refundedAmount = Number(record.refundedAmount || 0);

  if (declaredAmount <= 0) {
    warnings.push({
      code: 'amount_abnormal',
      taxRefundId: record.id,
      refundNo: record.refundNo,
      message: '申报金额小于等于 0',
    });
  }
  if (refundableAmount < 0) {
    warnings.push({
      code: 'amount_abnormal',
      taxRefundId: record.id,
      refundNo: record.refundNo,
      message: '可退税金额小于 0',
    });
  }
  if (refundedAmount < 0) {
    warnings.push({
      code: 'amount_abnormal',
      taxRefundId: record.id,
      refundNo: record.refundNo,
      message: '已退金额小于 0',
    });
  }
  if (refundableAmount > declaredAmount) {
    warnings.push({
      code: 'amount_abnormal',
      taxRefundId: record.id,
      refundNo: record.refundNo,
      message: '可退税金额大于申报金额',
    });
  }
  if (refundedAmount > refundableAmount) {
    warnings.push({
      code: 'amount_abnormal',
      taxRefundId: record.id,
      refundNo: record.refundNo,
      message: '已退金额大于可退税金额',
    });
  }

  return warnings;
};

const findInvoiceRelationConflicts = (evaluations) => {
  const grouped = new Map();

  evaluations.forEach((item) => {
    if (!item.normalizedRelationNo || !item.normalizedInvoiceNo) {
      return;
    }

    item.normalizedInvoiceNumbers.forEach((invoiceNo) => {
      if (!grouped.has(invoiceNo)) grouped.set(invoiceNo, new Set());
      grouped.get(invoiceNo).add(item.normalizedRelationNo);
    });
  });

  return Array.from(grouped.entries())
    .filter(([, relations]) => relations.size > 1)
    .map(([invoiceNo, relations]) => ({
      code: 'invoice_relation_conflict',
      invoice_no: invoiceNo,
      relation_nos: Array.from(relations),
      message: `发票号 ${invoiceNo} 被关联到多个采购合同`,
    }));
};

const buildPurchaseContractMap = async () => {
  const contracts = await prisma.purchaseContract.findMany({
    select: {
      id: true,
      contractNo: true,
      invoiceNo: true,
      taxRate: true,
    },
  });

  const map = new Map();
  contracts.forEach((contract) => {
    const key = normalizeIdentifier(contract.contractNo);
    if (!key || map.has(key)) {
      return;
    }

    const value = {
      id: contract.id,
      contractNo: contract.contractNo,
      invoiceNo: contract.invoiceNo,
      invoiceNumbers: normalizeInvoiceNumbers(contract.invoiceNo),
      taxRate: contract.taxRate,
    };
    const aliases = [
      contract.contractNo,
      contract.contractNo?.replace(/^PO/i, 'CG'),
      contract.contractNo?.replace(/^CG/i, 'PO'),
    ];
    aliases.forEach((alias) => {
      const aliasKey = normalizeIdentifier(alias);
      if (aliasKey && !map.has(aliasKey)) map.set(aliasKey, value);
    });
  });

  return map;
};

const evaluateRecord = (record, purchaseContractMap) => {
  const normalizedRelationNo = normalizeIdentifier(record.relation_no);
  const normalizedInvoiceNo = normalizeInvoiceIdentifier(record.invoice_no);
  const normalizedInvoiceNumbers = normalizeInvoiceNumbers(record.invoice_no);
  const normalizedVatRateType = normalizeVatRateType(record.vat_rate_type);
  const fixes = buildFixes(record, normalizedRelationNo, normalizedInvoiceNo);
  const errors = [];
  const warnings = buildAmountWarnings(record);

  if (!normalizedRelationNo) {
    errors.push({
      code: 'missing_relation_no',
      taxRefundId: record.id,
      refundNo: record.refundNo,
      message: '关联号缺失，不能导出',
    });
  }

  if (!normalizedInvoiceNo) {
    errors.push({
      code: 'missing_invoice_no',
      taxRefundId: record.id,
      refundNo: record.refundNo,
      message: '发票号缺失，不能导出',
    });
  }

  if (
    normalizedVatRateType === null
    || normalizedVatRateType <= 0
    || normalizedVatRateType > 100
  ) {
    errors.push({
      code: 'invalid_vat_rate_type',
      taxRefundId: record.id,
      refundNo: record.refundNo,
      message: '征税率必须是大于0且不超过100的有效百分比',
    });
  }

  const purchaseContract = normalizedRelationNo ? purchaseContractMap.get(normalizedRelationNo) : null;
  if (normalizedRelationNo && !purchaseContract) {
    errors.push({
      code: 'relation_not_found',
      taxRefundId: record.id,
      refundNo: record.refundNo,
      relation_no: normalizedRelationNo,
      message: '未找到关联采购合同，不能完成主数据比对或导出',
    });
  }

  if (purchaseContract && normalizedInvoiceNumbers.length > 0) {
    if (purchaseContract.invoiceNumbers.length === 0) {
      errors.push({
        code: 'purchase_invoice_numbers_missing',
        taxRefundId: record.id,
        refundNo: record.refundNo,
        relation_no: normalizedRelationNo,
        message: '关联采购合同尚未登记供应商发票号码',
      });
    } else if (!normalizedInvoiceNumbers.every((number) => purchaseContract.invoiceNumbers.includes(number))) {
      errors.push({
        code: 'invoice_no_mismatch',
        taxRefundId: record.id,
        refundNo: record.refundNo,
        relation_no: normalizedRelationNo,
        invoice_no: normalizedInvoiceNo,
        message: '退税记录发票号与关联采购合同登记的发票号不一致',
      });
    }
  }

  if (
    purchaseContract
    && normalizedVatRateType !== null
    && normalizedVatRateType > 0
    && normalizedVatRateType <= 100
    && normalizePurchaseTaxRate(purchaseContract.taxRate) !== normalizedVatRateType
  ) {
    errors.push({
      code: 'vat_rate_mismatch',
      taxRefundId: record.id,
      refundNo: record.refundNo,
      relation_no: normalizedRelationNo,
      invoice_no: normalizedInvoiceNo,
      expected: normalizePurchaseTaxRate(purchaseContract.taxRate),
      actual: normalizedVatRateType,
      message: `税率不一致，采购合同税率 ${normalizePurchaseTaxRate(purchaseContract.taxRate)}，退税记录税率 ${normalizedVatRateType}`,
    });
  }

  const match_status = errors.length === 0 ? MATCH_STATUS.PASSED : MATCH_STATUS.BLOCKED;

  return {
    record,
    normalizedRelationNo,
    normalizedInvoiceNo,
    normalizedInvoiceNumbers,
    normalizedVatRateType,
    purchaseContract,
    fixes,
    warnings,
    errors,
    match_status,
    exportItem: {
      refund_no: record.refundNo,
      sales_contract_id: record.salesContractId,
      customs_declaration_id: record.customsDeclarationId,
      relation_no: normalizedRelationNo || '',
      invoice_no: normalizedInvoiceNo || '',
      vat_rate_type: normalizedVatRateType ?? '',
      match_status,
      status: record.status,
      declared_amount: record.declaredAmount,
      refundable_amount: record.refundableAmount,
      refunded_amount: record.refundedAmount,
      applied_at: record.appliedAt ? new Date(record.appliedAt).toISOString() : '',
      refunded_at: record.refundedAt ? new Date(record.refundedAt).toISOString() : '',
      note: record.note || '',
    },
  };
};

const exportTaxRefunds = async (filters = {}) => {
  const records = await prisma.taxRefund.findMany({
    where: buildWhere(filters),
    orderBy: { createdAt: 'desc' },
  });

  const purchaseContractMap = await buildPurchaseContractMap();
  const evaluations = records.map((record) => evaluateRecord(record, purchaseContractMap));
  const invoiceRelationConflicts = findInvoiceRelationConflicts(evaluations);

  invoiceRelationConflicts.forEach((conflict) => {
    evaluations
      .filter((item) => item.normalizedInvoiceNumbers.includes(conflict.invoice_no))
      .forEach((item) => {
        item.errors.push({
          ...conflict,
          taxRefundId: item.record.id,
          refundNo: item.record.refundNo,
          message: `${conflict.message}，存在重复申报风险`,
        });
      });
  });

  evaluations.forEach((item) => {
    item.match_status = item.errors.length === 0 ? MATCH_STATUS.PASSED : MATCH_STATUS.BLOCKED;
    item.exportItem.match_status = item.match_status;
  });

  for (const item of evaluations) {
    await prisma.taxRefund.update({
      where: { id: item.record.id },
      data: { match_status: item.match_status },
    });
  }

  const warnings = evaluations.flatMap((item) => item.warnings);
  const fixes = evaluations.flatMap((item) => item.fixes);
  const errors = evaluations.flatMap((item) => item.errors);

  if (warnings.length > 0) {
    console.warn(`[tax-refund-export] warnings=${warnings.length} records=${records.length}`);
  }

  if (errors.length > 0) {
    console.warn(`[tax-refund-export] blocked errors=${errors.length} records=${records.length}`);
    return {
      blocked: true,
      exportedCount: 0,
      passedCount: evaluations.filter((item) => item.match_status === MATCH_STATUS.PASSED).length,
      items: [],
      warnings,
      fixes,
      errors,
      csv: '',
    };
  }

  const items = evaluations
    .filter((item) => item.match_status === MATCH_STATUS.PASSED)
    .map((item) => item.exportItem);

  return {
    blocked: false,
    exportedCount: items.length,
    passedCount: items.length,
    items,
    warnings,
    fixes,
    errors: [],
    csv: buildCsv(items),
  };
};

module.exports = {
  exportTaxRefunds,
};
