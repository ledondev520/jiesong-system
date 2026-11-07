/**
 * Input: 合同号与业务服务层
 * Output: 销售/采购/贸易合规诊断（纯读取）及其数组、计数辅助函数
 * Pos: openAgentService 的诊断子模块；由 openAgentService.js 门面原样重新导出
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../../utils/prisma');
const financeService = require('../financeService');
const customsDeclarationService = require('../customsDeclarationService');
const taxRefundService = require('../taxRefundService');
const forexVerificationService = require('../forexVerificationService');
const { outstandingOf } = require('../payablesService');
const { buildActionRecommendation, summarizeActionRecommendations } = require('./recommendations');

const buildStatusBreakdown = (items = []) => items.reduce((acc, item) => {
  const key = String(item?.status || 'UNKNOWN');
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

const buildQuantityBreakdown = (items = []) => items.reduce((acc, item) => {
  const key = String(item?.status || 'UNKNOWN');
  acc[key] = (acc[key] || 0) + Number(item?.quantity || 0);
  return acc;
}, {});

const uniqueMessages = (items = []) => Array.from(new Set((Array.isArray(items) ? items : []).filter(Boolean)));

const uniqueActionRecommendations = (items = []) => summarizeActionRecommendations(items.filter(Boolean));

const RECEIVABLE_CONTRACT_REF_REGEX = /EXP\d{5,}/g;
const ALLOCATION_AMOUNT_TOLERANCE = 0.01;

const extractContractRefsFromNote = (note) => {
  if (typeof note !== 'string') return [];
  return Array.from(new Set(note.toUpperCase().match(RECEIVABLE_CONTRACT_REF_REGEX) || []));
};

const findHighConfidenceAllocationCandidate = async ({ contractNo, outstandingAmount }) => {
  const normalizedContractNo = String(contractNo || '').trim().toUpperCase();
  const targetAmount = Number(outstandingAmount || 0);
  if (!normalizedContractNo || !(targetAmount > 0)) return null;

  const pool = await financeService.listUnallocatedPayments();
  const candidates = (Array.isArray(pool) ? pool : []).filter((payment) => {
    const refs = extractContractRefsFromNote(payment?.note);
    if (refs.length !== 1 || refs[0] !== normalizedContractNo) return false;
    const remainingAmount = Number(payment?.remainingAmount ?? payment?.amount ?? 0);
    return Math.abs(remainingAmount - targetAmount) <= ALLOCATION_AMOUNT_TOLERANCE;
  });

  return candidates.length === 1 ? candidates[0] : null;
};

const buildSalesContractFlowDiagnostic = async ({ contractNo }) => {
  const keyword = String(contractNo || '').trim();
  const contract = await prisma.salesContract.findFirst({
    where: { contractNo: keyword },
    include: {
      items: {
        select: { id: true, quantity: true, sellingPrice: true },
      },
      packingItems: {
        select: { id: true, boxes: true, volume: true },
      },
    },
  });
  if (!contract) return { error: `出口合同 ${keyword} 不存在` };

  const [inventories, customs, forex, taxRefunds] = await Promise.all([
    prisma.inventory.findMany({
      where: { salesContractId: contract.id },
      select: { id: true, status: true, quantity: true, inboundAt: true, outboundAt: true },
    }),
    customsDeclarationService.listCustomsDeclarations({ page: 1, pageSize: 10, salesContractId: contract.id }),
    forexVerificationService.listForexVerifications({ page: 1, pageSize: 10, salesContractId: contract.id }),
    taxRefundService.listTaxRefunds({ page: 1, pageSize: 10, salesContractId: contract.id }),
  ]);

  const outstandingAmount = Math.max(Number(contract.totalAmount || 0) - Number(contract.receivedAmount || 0), 0);
  const allocationCandidate = outstandingAmount > 0
    ? await findHighConfidenceAllocationCandidate({ contractNo: contract.contractNo, outstandingAmount })
    : null;
  const inventoryStatusBreakdown = buildStatusBreakdown(inventories);
  const inventoryQuantityBreakdown = buildQuantityBreakdown(inventories);
  const blockers = uniqueMessages([
    outstandingAmount > 0 ? `合同尚有 ${outstandingAmount} 未收款` : null,
    !customs.total && ['SHIPPED', 'ARRIVED', 'COMPLETED'].includes(contract.status) ? '合同已进入出运阶段但尚无报关单' : null,
    customs.total > 0 && !forex.total ? '已有报关记录但尚未形成收汇核销记录' : null,
    Boolean(contract.hasTaxRefund) && customs.total > 0 && !taxRefunds.total ? '退税链路尚未落单，需补退税记录' : null,
    Object.keys(inventoryStatusBreakdown).some((status) => status !== 'OUTBOUND')
      ? '仍有库存未完全出库，需核对履约与出运节奏'
      : null,
  ]);
  const nextActions = uniqueMessages([
    outstandingAmount > 0 ? '继续核对回款与应收差额，确认收款节奏' : null,
    !customs.total ? '先补报关单或确认报关草稿生成情况' : null,
    customs.total > 0 && !forex.total ? '补齐收汇核销资料，推进核销登记' : null,
    Boolean(contract.hasTaxRefund) && customs.total > 0 && !taxRefunds.total ? '整理退税资料并发起退税单' : null,
    Object.keys(inventoryStatusBreakdown).some((status) => status !== 'OUTBOUND')
      ? '核对未出库库存与装箱/发货状态，确认是否存在履约卡点'
      : null,
  ]);
  const latestCustoms = (customs.items || [])[0] || null;
  const latestForex = (forex.items || [])[0] || null;
  const totalQuantity = Number((contract.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0));
  const canCreateForexDraft = Number(contract.receivedAmount || 0) > 0 && Boolean(latestCustoms?.id);
  const canCreateTaxRefundDraft = Boolean(contract.hasTaxRefund) && Boolean(latestCustoms?.id) && Boolean(latestForex?.id);
  const recommendedActions = uniqueActionRecommendations([
    outstandingAmount > 0 ? buildActionRecommendation({
      code: 'finance.follow-up-receivable',
      title: allocationCandidate ? '确认收款挂账' : '跟进合同回款',
      domain: 'finance',
      priority: 'high',
      executionMode: allocationCandidate ? 'confirmable_write' : 'manual',
      reason: `合同尚有 ${outstandingAmount} 未收款`,
      actionType: allocationCandidate ? 'AllocatePayment' : null,
      params: allocationCandidate ? {
        paymentId: allocationCandidate.id,
        contractNo: contract.contractNo,
        amount: Number(allocationCandidate.remainingAmount ?? allocationCandidate.amount ?? outstandingAmount),
      } : null,
      sourceTool: 'DiagnoseSalesContractFlow',
    }) : null,
    !customs.total ? buildActionRecommendation({
      code: 'trade-compliance.prepare-customs-declaration',
      title: '生成报关草稿',
      domain: 'trade-compliance',
      priority: ['SHIPPED', 'ARRIVED', 'COMPLETED'].includes(contract.status) ? 'high' : 'medium',
      executionMode: 'confirmable_write',
      reason: '合同已进入出运阶段但尚无报关单',
      actionType: 'CreateCustomsDeclarationDraft',
      params: {
        salesContractId: contract.id,
        contractNo: contract.contractNo,
        totalAmount: Number(contract.totalAmount || 0),
        totalQuantity,
        currency: 'USD',
        note: 'Agent 根据销售合同流程诊断生成报关草稿',
      },
      sourceTool: 'DiagnoseSalesContractFlow',
    }) : null,
    customs.total > 0 && !forex.total ? buildActionRecommendation({
      code: 'trade-compliance.prepare-forex-verification',
      title: '推进收汇核销登记',
      domain: 'trade-compliance',
      priority: 'high',
      executionMode: canCreateForexDraft ? 'confirmable_write' : 'manual',
      reason: '已有报关记录但尚未形成收汇核销记录',
      actionType: canCreateForexDraft ? 'CreateForexVerificationDraft' : null,
      params: canCreateForexDraft ? {
        salesContractId: contract.id,
        contractNo: contract.contractNo,
        customsDeclarationId: latestCustoms.id,
        receivedAmount: Number(contract.receivedAmount || 0),
        currency: 'USD',
        note: 'Agent 根据销售合同流程诊断生成收汇核销草稿',
      } : null,
      sourceTool: 'DiagnoseSalesContractFlow',
    }) : null,
    Boolean(contract.hasTaxRefund) && customs.total > 0 && !taxRefunds.total ? buildActionRecommendation({
      code: 'trade-compliance.create-tax-refund-record',
      title: canCreateTaxRefundDraft ? '补建退税草稿' : '补建退税记录',
      domain: 'trade-compliance',
      priority: 'medium',
      executionMode: canCreateTaxRefundDraft ? 'confirmable_write' : 'manual',
      reason: '退税链路尚未落单，需补退税记录',
      actionType: canCreateTaxRefundDraft ? 'CreateTaxRefundDraft' : null,
      params: canCreateTaxRefundDraft ? {
        salesContractId: contract.id,
        contractNo: contract.contractNo,
        customsDeclarationId: latestCustoms.id,
        forexVerificationId: latestForex.id,
        note: 'Agent 根据销售合同流程诊断生成退税草稿',
      } : null,
      sourceTool: 'DiagnoseSalesContractFlow',
    }) : null,
    Object.keys(inventoryStatusBreakdown).some((status) => status !== 'OUTBOUND') ? buildActionRecommendation({
      code: 'inventory.verify-fulfillment-stock',
      title: '核对未出库库存',
      domain: 'inventory',
      priority: 'medium',
      executionMode: 'manual',
      reason: '仍有库存未完全出库，需核对履约与出运节奏',
      sourceTool: 'DiagnoseSalesContractFlow',
    }) : null,
  ]);

  return {
    contractId: contract.id,
    contractNo: contract.contractNo,
    sales: {
      status: contract.status,
      totalAmount: Number(contract.totalAmount || 0),
      receivedAmount: Number(contract.receivedAmount || 0),
      itemCount: contract.items?.length || 0,
      packingItemCount: contract.packingItems?.length || 0,
    },
    finance: {
      outstandingAmount,
      collectionProgress: contract.totalAmount ? Number((Number(contract.receivedAmount || 0) / Number(contract.totalAmount || 1)).toFixed(4)) : 0,
    },
    inventory: {
      recordCount: inventories.length,
      statusBreakdown: inventoryStatusBreakdown,
      quantityBreakdown: inventoryQuantityBreakdown,
    },
    tradeCompliance: {
      customs: {
        total: customs.total || 0,
        latestStatuses: (customs.items || []).slice(0, 3).map((item) => item.status),
      },
      forex: {
        total: forex.total || 0,
        latestStatuses: (forex.items || []).slice(0, 3).map((item) => item.status),
      },
      taxRefund: {
        total: taxRefunds.total || 0,
        latestStatuses: (taxRefunds.items || []).slice(0, 3).map((item) => item.status),
      },
    },
    blockers,
    nextActions,
    recommendedActions,
  };
};

const buildPurchaseExecutionDiagnostic = async ({ contractNo }) => {
  const keyword = String(contractNo || '').trim();
  const contract = await prisma.purchaseContract.findFirst({
    where: { contractNo: keyword },
    include: {
      supplier: {
        select: { id: true, name: true, shortName: true, hasQualityIssue: true, qualityNote: true },
      },
      items: {
        select: { id: true, quantity: true, totalPrice: true },
      },
    },
  });
  if (!contract) return { error: `采购合同 ${keyword} 不存在` };

  const inventories = await prisma.inventory.findMany({
    where: {
      purchaseItem: {
        purchaseContractId: contract.id,
      },
    },
    select: { id: true, status: true, quantity: true, inboundAt: true },
  });

  // 与应付列表同口径：草稿/已取消合同没有应付余额
  const unpaidAmount = outstandingOf(contract);
  const inventoryStatusBreakdown = buildStatusBreakdown(inventories);
  const blockers = uniqueMessages([
    unpaidAmount > 0 ? `采购合同尚有 ${unpaidAmount} 未付款` : null,
    contract.supplier?.hasQualityIssue ? `供应商存在质量风险: ${contract.supplier.qualityNote || contract.supplier.name}` : null,
    Object.keys(inventoryStatusBreakdown).some((status) => !['INBOUND', 'AVAILABLE'].includes(status))
      ? '仍有采购对应库存未完成入库'
      : null,
  ]);
  const nextActions = uniqueMessages([
    unpaidAmount > 0 ? '核对付款计划与账期，确认是否需要催款或补付款' : null,
    contract.supplier?.hasQualityIssue ? '复核供应商质量问题并确认本批次验收策略' : null,
    Object.keys(inventoryStatusBreakdown).some((status) => !['INBOUND', 'AVAILABLE'].includes(status))
      ? '跟进入库和生产状态，避免采购到货脱节'
      : null,
  ]);
  const recommendedActions = uniqueActionRecommendations([
    unpaidAmount > 0 ? buildActionRecommendation({
      code: 'finance.align-purchase-payment-plan',
      title: '核对采购付款计划',
      domain: 'finance',
      priority: 'high',
      executionMode: 'manual',
      reason: `采购合同尚有 ${unpaidAmount} 未付款`,
      sourceTool: 'DiagnosePurchaseExecution',
    }) : null,
    contract.supplier?.hasQualityIssue ? buildActionRecommendation({
      code: 'procurement.review-supplier-quality-risk',
      title: '复核供应商质量风险',
      domain: 'procurement',
      priority: 'high',
      executionMode: 'manual',
      reason: `供应商存在质量风险: ${contract.supplier.qualityNote || contract.supplier.name}`,
      sourceTool: 'DiagnosePurchaseExecution',
    }) : null,
    Object.keys(inventoryStatusBreakdown).some((status) => !['INBOUND', 'AVAILABLE'].includes(status)) ? buildActionRecommendation({
      code: 'inventory.follow-up-inbound-progress',
      title: '跟进入库与生产进度',
      domain: 'inventory',
      priority: 'medium',
      executionMode: 'manual',
      reason: '仍有采购对应库存未完成入库',
      sourceTool: 'DiagnosePurchaseExecution',
    }) : null,
  ]);

  return {
    contractId: contract.id,
    contractNo: contract.contractNo,
    procurement: {
      status: contract.status,
      totalAmount: Number(contract.totalAmount || 0),
      paidAmount: Number(contract.paidAmount || 0),
      itemCount: contract.items?.length || 0,
    },
    finance: {
      unpaidAmount,
      paymentProgress: contract.totalAmount ? Number((Number(contract.paidAmount || 0) / Number(contract.totalAmount || 1)).toFixed(4)) : 0,
    },
    supplier: contract.supplier || null,
    inventory: {
      recordCount: inventories.length,
      statusBreakdown: inventoryStatusBreakdown,
      quantityBreakdown: buildQuantityBreakdown(inventories),
    },
    blockers,
    nextActions,
    recommendedActions,
  };
};

const buildTradeComplianceReadinessDiagnostic = async ({ contractNo }) => {
  const keyword = String(contractNo || '').trim();
  const contract = await prisma.salesContract.findFirst({
    where: { contractNo: keyword },
    select: {
      id: true,
      contractNo: true,
      status: true,
      totalAmount: true,
      receivedAmount: true,
      hasTaxRefund: true,
    },
  });
  if (!contract) return { error: `出口合同 ${keyword} 不存在` };

  const [customs, forex, taxRefunds] = await Promise.all([
    customsDeclarationService.listCustomsDeclarations({ page: 1, pageSize: 10, salesContractId: contract.id }),
    forexVerificationService.listForexVerifications({ page: 1, pageSize: 10, salesContractId: contract.id }),
    taxRefundService.listTaxRefunds({ page: 1, pageSize: 10, salesContractId: contract.id }),
  ]);

  const customsReady = Number(customs.total || 0) > 0;
  const forexReady = customsReady && Number(forex.total || 0) > 0;
  const taxRefundReady = Boolean(contract.hasTaxRefund) && customsReady && forexReady;
  const blockers = uniqueMessages([
    !customsReady ? '缺少报关单，税退链路尚未起步' : null,
    customsReady && !forexReady ? '已有报关记录，但尚未完成收汇核销' : null,
    taxRefundReady && !taxRefunds.total ? '已具备退税前置条件，但尚未创建退税记录' : null,
  ]);
  const nextActions = uniqueMessages([
    !customsReady ? '先补报关单或生成报关草稿' : null,
    customsReady && !forexReady ? '推进收汇核销资料准备与录入' : null,
    taxRefundReady && !taxRefunds.total ? '补建退税单并核对关联号、发票号与税率' : null,
  ]);
  const latestCustoms = (customs.items || [])[0] || null;
  const latestForex = (forex.items || [])[0] || null;
  const canCreateForexDraft = Number(contract.receivedAmount || 0) > 0 && Boolean(latestCustoms?.id);
  const recommendedActions = uniqueActionRecommendations([
    !customsReady ? buildActionRecommendation({
      code: 'trade-compliance.prepare-customs-declaration',
      title: '生成报关草稿',
      domain: 'trade-compliance',
      priority: 'high',
      executionMode: 'confirmable_write',
      reason: '缺少报关单，税退链路尚未起步',
      actionType: 'CreateCustomsDeclarationDraft',
      params: {
        salesContractId: contract.id,
        contractNo: contract.contractNo,
        totalAmount: Number(contract.totalAmount || 0),
        currency: 'USD',
        note: 'Agent 根据税退链路诊断生成报关草稿',
      },
      sourceTool: 'DiagnoseTradeComplianceReadiness',
    }) : null,
    customsReady && !forexReady ? buildActionRecommendation({
      code: 'trade-compliance.prepare-forex-verification',
      title: '推进收汇核销登记',
      domain: 'trade-compliance',
      priority: 'high',
      executionMode: canCreateForexDraft ? 'confirmable_write' : 'manual',
      reason: '已有报关记录，但尚未完成收汇核销',
      actionType: canCreateForexDraft ? 'CreateForexVerificationDraft' : null,
      params: canCreateForexDraft ? {
        salesContractId: contract.id,
        contractNo: contract.contractNo,
        customsDeclarationId: latestCustoms.id,
        receivedAmount: Number(contract.receivedAmount || 0),
        currency: 'USD',
        note: 'Agent 根据税退链路诊断生成收汇核销草稿',
      } : null,
      sourceTool: 'DiagnoseTradeComplianceReadiness',
    }) : null,
    taxRefundReady && !taxRefunds.total ? buildActionRecommendation({
      code: 'trade-compliance.create-tax-refund-record',
      title: '补建退税草稿',
      domain: 'trade-compliance',
      priority: 'medium',
      executionMode: 'confirmable_write',
      reason: '已具备退税前置条件，但尚未创建退税记录',
      actionType: 'CreateTaxRefundDraft',
      params: {
        salesContractId: contract.id,
        contractNo: contract.contractNo,
        customsDeclarationId: latestCustoms.id,
        forexVerificationId: latestForex?.id || null,
        note: 'Agent 根据税退链路诊断生成退税草稿',
      },
      sourceTool: 'DiagnoseTradeComplianceReadiness',
    }) : null,
  ]);

  return {
    contractId: contract.id,
    contractNo: contract.contractNo,
    salesStatus: contract.status,
    readiness: {
      customsReady,
      forexReady,
      taxRefundReady,
    },
    coverage: {
      customsCount: Number(customs.total || 0),
      forexCount: Number(forex.total || 0),
      taxRefundCount: Number(taxRefunds.total || 0),
    },
    blockers,
    nextActions,
    recommendedActions,
  };
};


module.exports = {
  buildStatusBreakdown,
  buildQuantityBreakdown,
  uniqueMessages,
  uniqueActionRecommendations,
  buildSalesContractFlowDiagnostic,
  buildPurchaseExecutionDiagnostic,
  buildTradeComplianceReadinessDiagnostic,
};
