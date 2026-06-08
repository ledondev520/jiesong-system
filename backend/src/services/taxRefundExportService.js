/**
 * Input: 退税记录筛选条件
 * Output: 导出前校验结果、告警、可修复提示与 passed-only 导出数据
 * Pos: 税退模块服务层，负责出口退税申报前校验与导出构建
 */

const prisma = require('../utils/prisma');

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
      suggestion: '去除空格与前导0后重新保存发票号',
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

const buildRelationInvoiceWarnings = (evaluations) => {
  const grouped = new Map();

  evaluations.forEach((item) => {
    if (!item.normalizedRelationNo || !item.normalizedInvoiceNo) {
      return;
    }

    if (!grouped.has(item.normalizedRelationNo)) {
      grouped.set(item.normalizedRelationNo, new Set());
    }

    grouped.get(item.normalizedRelationNo).add(item.normalizedInvoiceNo);
  });

  return Array.from(grouped.entries())
    .filter(([, invoices]) => invoices.size > 1)
    .map(([relationNo, invoices]) => ({
      code: 'relation_invoice_conflict',
      relation_no: relationNo,
      invoice_nos: Array.from(invoices),
      message: `关联号 ${relationNo} 对应多个发票号`,
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

    map.set(key, {
      id: contract.id,
      contractNo: contract.contractNo,
      invoiceNo: contract.invoiceNo,
      normalizedInvoiceNo: normalizeIdentifier(contract.invoiceNo),
      taxRate: contract.taxRate,
    });
  });

  return map;
};

const evaluateRecord = (record, purchaseContractMap) => {
  const normalizedRelationNo = normalizeIdentifier(record.relation_no);
  const normalizedInvoiceNo = normalizeIdentifier(record.invoice_no);
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

  if (normalizedVatRateType !== 1 && normalizedVatRateType !== 13) {
    errors.push({
      code: 'invalid_vat_rate_type',
      taxRefundId: record.id,
      refundNo: record.refundNo,
      message: 'vat_rate_type 仅支持 1 或 13',
    });
  }

  const purchaseContract = normalizedRelationNo ? purchaseContractMap.get(normalizedRelationNo) : null;
  if (normalizedRelationNo && !purchaseContract) {
    warnings.push({
      code: 'relation_not_found',
      taxRefundId: record.id,
      refundNo: record.refundNo,
      relation_no: normalizedRelationNo,
      message: '未找到关联采购合同，无法进行主数据比对',
    });
  }

  if (
    purchaseContract
    && (normalizedVatRateType === 1 || normalizedVatRateType === 13)
    && Number(purchaseContract.taxRate) !== normalizedVatRateType
  ) {
    errors.push({
      code: 'vat_rate_mismatch',
      taxRefundId: record.id,
      refundNo: record.refundNo,
      relation_no: normalizedRelationNo,
      invoice_no: normalizedInvoiceNo,
      expected: Number(purchaseContract.taxRate),
      actual: normalizedVatRateType,
      message: `税率不一致，采购合同税率 ${purchaseContract.taxRate}，退税记录税率 ${normalizedVatRateType}`,
    });
  }

  const match_status = errors.length === 0 ? MATCH_STATUS.PASSED : MATCH_STATUS.BLOCKED;

  return {
    record,
    normalizedRelationNo,
    normalizedInvoiceNo,
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

  for (const item of evaluations) {
    await prisma.taxRefund.update({
      where: { id: item.record.id },
      data: { match_status: item.match_status },
    });
  }

  const warnings = [
    ...buildRelationInvoiceWarnings(evaluations),
    ...evaluations.flatMap((item) => item.warnings),
  ];
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
