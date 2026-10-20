/**
 * Input: 出口合同、装箱明细、报关/退税记录、采购主数据与发票台账
 * Output: 出口退税工作台、按申报月份逐次出货的准备状态与确认版本
 * Pos: 出口退税网页工作台聚合 Module；复用既有退税、采购和发票 Module，不直接提交税局
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const { roundMoney } = require('./purchaseAmountService');
const { normalizeInvoiceNumbers } = require('./purchaseInvoiceService');
const { verifyShipmentInvoices } = require('./invoiceVerificationService');

const READY_TO_EXPORT_STATUS = new Set(['SHIPPED', 'ARRIVED', 'COMPLETED']);
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const unique = (values) => [...new Set(values.filter(Boolean))];

const normalizeContractAliases = (contractNo) => unique([
  contractNo,
  contractNo?.replace(/^PO/i, 'CG'),
  contractNo?.replace(/^CG/i, 'PO'),
]);

const mapPurchasesByContractNo = (purchases) => {
  const map = new Map();
  purchases.forEach((purchase) => {
    normalizeContractAliases(purchase.contractNo).forEach((alias) => map.set(alias, purchase));
  });
  return map;
};

const getLatestByDate = (items, fields) => [...items].sort((left, right) => {
  const leftDate = fields.map((field) => left?.[field]).find(Boolean);
  const rightDate = fields.map((field) => right?.[field]).find(Boolean);
  return new Date(rightDate || 0).getTime() - new Date(leftDate || 0).getTime();
})[0] || null;

const buildShipmentInvoiceRows = (contract, purchasesByContractNo) => contract.packingItems
  .filter((item) => item.isOwnedByJiesong !== false)
  .flatMap((item, index) => {
    const purchase = purchasesByContractNo.get(item.purchaseContractNo);
    const invoiceNumbers = normalizeInvoiceNumbers(item.invoiceNo || purchase?.invoiceNo);
    if (invoiceNumbers.length === 0) {
      return [{
        sourceRow: index + 1,
        contractNo: contract.contractNo,
        invoiceNo: null,
        expectedSeller: purchase?.supplier?.name || item.manufacturer || null,
        itemName: item.product?.customsName || null,
        supplement: item.supplement || null,
        expectedTotal: item.purchaseCost ?? null,
      }];
    }
    const expectedTotal = invoiceNumbers.length === 1 ? (item.purchaseCost ?? purchase?.totalAmount ?? null) : null;
    return invoiceNumbers.map((invoiceNo) => ({
      sourceRow: index + 1,
      contractNo: contract.contractNo,
      invoiceNo,
      expectedSeller: purchase?.supplier?.name || item.manufacturer || null,
      itemName: item.product?.customsName || null,
      supplement: item.supplement || null,
      expectedTotal,
    }));
  });

const collectIssues = ({ contract, purchases, invoiceVerification, declaration, taxRefund }) => {
  const issues = [];
  if (!READY_TO_EXPORT_STATUS.has(contract.status)) issues.push('出口合同尚未发运');
  if (!contract.shippedAt) issues.push('缺少出货日期');
  if (!declaration) issues.push('系统尚未关联报关单');
  if (declaration && declaration.status !== 'RELEASED') issues.push('报关单尚未放行');
  if (purchases.length === 0) issues.push('装箱明细尚未关联采购合同');
  if (purchases.some((purchase) => !purchase.supplier?.taxId)) issues.push('关联供应商税号不完整');
  if (invoiceVerification.summary.missing > 0) issues.push(`有 ${invoiceVerification.summary.missing} 张发票未命中台账`);
  if (invoiceVerification.summary.review > 0) issues.push(`有 ${invoiceVerification.summary.review} 张发票需要复核`);
  if (invoiceVerification.summary.invalidInvoiceNumber > 0) issues.push('存在发票号码格式异常');
  if (!taxRefund) issues.push('尚未生成退税草稿');
  if (taxRefund?.match_status === 'blocked') issues.push('退税草稿关联校验未通过');
  return unique(issues);
};

const resolveStage = ({ issues, declaration, taxRefund, invoiceVerification }) => {
  if (taxRefund?.status === 'REFUNDED') return 'REFUNDED';
  if (['APPLIED', 'APPROVED'].includes(taxRefund?.status)) return 'SUBMITTED';
  if (issues.length === 0 && taxRefund?.match_status === 'passed') return 'READY_TO_EXPORT';
  if (taxRefund) return 'DRAFT';
  if (declaration && invoiceVerification.summary.missing === 0) return 'VERIFICATION';
  return 'PREPARATION';
};

const buildContractItem = ({ contract, purchasesByContractNo, invoiceVerification }) => {
  const purchaseContractNos = unique(contract.packingItems.map((item) => item.purchaseContractNo));
  const purchases = purchaseContractNos.map((contractNo) => purchasesByContractNo.get(contractNo)).filter(Boolean);
  const declaration = getLatestByDate(contract.customsDeclarations, ['exportDate', 'declaredAt', 'createdAt']);
  const taxRefund = getLatestByDate(contract.taxRefunds, ['appliedAt', 'createdAt']);
  const issues = collectIssues({ contract, purchases, invoiceVerification, declaration, taxRefund });
  return {
    salesContractId: contract.id,
    contractNo: contract.contractNo,
    shippedAt: contract.shippedAt,
    customsBroker: contract.customsBroker,
    contractStatus: contract.status,
    stage: resolveStage({ issues, declaration, taxRefund, invoiceVerification }),
    ready: issues.length === 0 && taxRefund?.match_status === 'passed',
    declaration: declaration ? {
      id: declaration.id,
      declarationNo: declaration.declarationNo,
      status: declaration.status,
      exportDate: declaration.exportDate,
    } : null,
    taxRefund: taxRefund ? {
      id: taxRefund.id,
      refundNo: taxRefund.refundNo,
      status: taxRefund.status,
      matchStatus: taxRefund.match_status,
      refundableAmount: Number(taxRefund.refundableAmount || 0),
    } : null,
    purchaseContractNos,
    invoiceSummary: invoiceVerification.summary,
    // 只展示已由退税草稿 Module 算出的金额，不拿采购征税率冒充出口退税率。
    estimatedRefundableAmount: roundMoney(Number(taxRefund?.refundableAmount || 0)),
    issues,
  };
};

const filterItems = (items, { keyword, stage }) => items.filter((item) => {
  if (stage && stage !== 'ALL' && item.stage !== stage) return false;
  if (!keyword) return true;
  const haystack = [
    item.contractNo,
    item.declaration?.declarationNo,
    item.taxRefund?.refundNo,
    ...item.purchaseContractNos,
    ...item.issues,
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(String(keyword).trim().toLowerCase());
});

const buildSummary = (items, latestInvoiceBatch) => ({
  contracts: items.length,
  readyToExport: items.filter((item) => item.stage === 'READY_TO_EXPORT').length,
  needsReview: items.filter((item) => item.invoiceSummary.review > 0).length,
  missingInvoices: items.reduce((sum, item) => sum + item.invoiceSummary.missing, 0),
  draftCount: items.filter((item) => item.taxRefund?.status === 'DRAFT').length,
  submittedCount: items.filter((item) => ['APPLIED', 'APPROVED'].includes(item.taxRefund?.status)).length,
  estimatedRefundableAmount: roundMoney(items.reduce((sum, item) => sum + item.estimatedRefundableAmount, 0)),
  latestInvoiceBatch: latestInvoiceBatch ? {
    fileName: latestInvoiceBatch.fileName,
    dataStartDate: latestInvoiceBatch.dataStartDate,
    dataEndDate: latestInvoiceBatch.dataEndDate,
    importedAt: latestInvoiceBatch.importedAt,
    recordCount: latestInvoiceBatch.recordCount,
  } : null,
});

const getTaxRefundWorkbench = async ({
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  keyword,
  stage,
  filingMonth,
} = {}, prismaClient = prisma) => {
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safePageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(pageSize, 10) || DEFAULT_PAGE_SIZE));
  if (filingMonth) {
    const preparations = await require('./taxRefundShipmentService').listShipmentPreparations({ filingMonth }, { prismaClient });
    const items = preparations.map((preparation) => ({
      shipmentKey: preparation.shipmentKey,
      salesContractId: preparation.salesContractId,
      contractNo: preparation.contractNo,
      shippedAt: preparation.shippedAt,
      contractStatus: preparation.contractStatus,
      stage: !preparation.materialReady ? 'PREPARATION' : preparation.confirmationStatus === 'CONFIRMED' ? 'DRAFT' : 'VERIFICATION',
      // 内部材料确认不代表官方申报明细已经可导入。
      ready: false,
      declaration: preparation.customsDeclarationId ? { id: preparation.customsDeclarationId, declarationNo: preparation.declarationNo, status: preparation.declarationStatus, exportDate: preparation.exportDate } : null,
      taxRefund: null,
      purchaseContractNos: preparation.invoiceLinks.map((link) => link.purchaseContractNo),
      invoiceSummary: preparation.invoiceVerification.summary,
      estimatedRefundableAmount: 0,
      materialReady: preparation.materialReady,
      confirmationStatus: preparation.confirmationStatus,
      confirmedFile: preparation.confirmedFile,
      issues: preparation.materialBlockers,
    }));
    const filtered = filterItems(items, { keyword, stage });
    const start = (safePage - 1) * safePageSize;
    return { items: filtered.slice(start, start + safePageSize), total: filtered.length, page: safePage, pageSize: safePageSize,
      filingMonth, summary: { ...buildSummary(items, null), materialReadyCount: items.filter((item) => item.materialReady).length,
        confirmedCount: items.filter((item) => item.confirmationStatus === 'CONFIRMED').length },
      disclaimer: '自动汇总本期及历史待申报出货；资料确认与归档不代表税务机关受理。' };
  }
  const [contracts, latestInvoiceBatch] = await Promise.all([
    prismaClient.salesContract.findMany({
      where: {
        status: { in: [...READY_TO_EXPORT_STATUS] },
        OR: [
          { hasTaxRefund: true },
          { customsBroker: { contains: '捷淞' } },
          { taxRefunds: { some: {} } },
        ],
      },
      include: {
        packingItems: {
          include: { product: { select: { id: true, customsName: true } } },
          orderBy: { createdAt: 'asc' },
        },
        customsDeclarations: { orderBy: { createdAt: 'desc' } },
        taxRefunds: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: [{ shippedAt: 'desc' }, { contractNo: 'desc' }],
    }),
    prismaClient.financeDataBatch.findFirst({
      where: { type: 'INVOICE' },
      orderBy: { importedAt: 'desc' },
    }),
  ]);

  const purchaseContractNos = unique(contracts.flatMap((contract) => (
    contract.packingItems.flatMap((item) => normalizeContractAliases(item.purchaseContractNo))
  )));
  const purchases = purchaseContractNos.length === 0 ? [] : await prismaClient.purchaseContract.findMany({
    where: { contractNo: { in: purchaseContractNos } },
    include: { supplier: { select: { id: true, name: true, taxId: true } } },
  });
  const purchasesByContractNo = mapPurchasesByContractNo(purchases);
  const shipmentRowsByContract = new Map();
  contracts.forEach((contract) => shipmentRowsByContract.set(
    contract.id,
    buildShipmentInvoiceRows(contract, purchasesByContractNo),
  ));
  const invoiceNumbers = unique([...shipmentRowsByContract.values()].flat().map((row) => row.invoiceNo));
  const invoiceRecords = invoiceNumbers.length === 0 ? [] : await prismaClient.invoiceRecord.findMany({
    where: { invNo: { in: invoiceNumbers } },
    orderBy: [{ invNo: 'asc' }, { invDate: 'desc' }],
  });
  const items = contracts.map((contract) => {
    const invoiceVerification = verifyShipmentInvoices({
      shipmentRows: shipmentRowsByContract.get(contract.id) || [],
      invoiceRecords: invoiceRecords.map((record) => ({ ...record, lookupSource: 'database' })),
    });
    return buildContractItem({ contract, purchasesByContractNo, invoiceVerification });
  });
  const filtered = filterItems(items, { keyword, stage });
  const start = (safePage - 1) * safePageSize;
  return {
    items: filtered.slice(start, start + safePageSize),
    total: filtered.length,
    page: safePage,
    pageSize: safePageSize,
    summary: buildSummary(items, latestInvoiceBatch),
    disclaimer: '本工作台用于内部准备、核验和生成申报明细，不代表税务机关已受理或完成退税。',
  };
};

const getContractInvoiceVerification = async (salesContractId, prismaClient = prisma) => {
  const contract = await prismaClient.salesContract.findUnique({
    where: { id: salesContractId },
    include: {
      packingItems: {
        include: { product: { select: { id: true, customsName: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!contract) {
    const error = new Error('出口合同不存在');
    error.statusCode = 404;
    throw error;
  }
  const aliases = unique(contract.packingItems.flatMap((item) => normalizeContractAliases(item.purchaseContractNo)));
  const purchases = aliases.length === 0 ? [] : await prismaClient.purchaseContract.findMany({
    where: { contractNo: { in: aliases } },
    include: { supplier: { select: { id: true, name: true, taxId: true } } },
  });
  const purchasesByContractNo = mapPurchasesByContractNo(purchases);
  const shipmentRows = buildShipmentInvoiceRows(contract, purchasesByContractNo);
  const invoiceNumbers = unique(shipmentRows.map((row) => row.invoiceNo));
  const invoiceRecords = invoiceNumbers.length === 0 ? [] : await prismaClient.invoiceRecord.findMany({
    where: { invNo: { in: invoiceNumbers } },
    orderBy: [{ invNo: 'asc' }, { invDate: 'desc' }],
  });
  return {
    salesContractId,
    contractNo: contract.contractNo,
    ...verifyShipmentInvoices({
      shipmentRows,
      invoiceRecords: invoiceRecords.map((record) => ({ ...record, lookupSource: 'database' })),
    }),
  };
};

module.exports = {
  buildContractItem,
  buildShipmentInvoiceRows,
  getContractInvoiceVerification,
  getTaxRefundWorkbench,
};
