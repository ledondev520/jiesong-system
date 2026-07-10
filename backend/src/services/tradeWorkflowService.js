/**
 * Input: 出口合同、关联采购合同、装箱/单证/退税/收付记录
 * Output: 单笔出口专项单的八阶段进度、阻塞原因和唯一下一动作
 * Pos: 经营中台与详情页共享的出口专项单主线路 Module
 */

const prisma = require('../utils/prisma');
const { evaluateShipmentReadiness } = require('./shipmentReadinessService');
const { normalizePurchaseStatus, PURCHASE_STATUS } = require('./purchaseStateMachine');
const { normalizeSalesStatus, SALES_STATUS } = require('./salesStateMachine');

const PURCHASE_RANK = Object.freeze({
  [PURCHASE_STATUS.DRAFT]: 0,
  [PURCHASE_STATUS.SIGNED]: 1,
  [PURCHASE_STATUS.PRODUCING]: 2,
  [PURCHASE_STATUS.READY]: 3,
  [PURCHASE_STATUS.SHIPPED]: 4,
  [PURCHASE_STATUS.RECEIVED]: 5,
  [PURCHASE_STATUS.COMPLETED]: 6,
  [PURCHASE_STATUS.CANCELLED]: -1,
});

const SALES_RANK = Object.freeze({
  [SALES_STATUS.DRAFT]: 0,
  [SALES_STATUS.CONFIRMED]: 1,
  [SALES_STATUS.PACKING]: 2,
  [SALES_STATUS.SHIPPED]: 3,
  [SALES_STATUS.ARRIVED]: 4,
  [SALES_STATUS.COMPLETED]: 5,
  [SALES_STATUS.CANCELLED]: -1,
});

const unique = (values) => Array.from(new Set(values.filter(Boolean)));
const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const getTaxPreparationDate = (shippedAt) => {
  if (!shippedAt) return null;
  const date = new Date(shippedAt);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 5))
    .toISOString()
    .slice(0, 10);
};

const getPurchaseByNo = (purchaseMap, contractNo) => {
  if (!contractNo) return null;
  return purchaseMap.get(contractNo)
    || purchaseMap.get(contractNo.replace(/^PO/, 'CG'))
    || purchaseMap.get(contractNo.replace(/^CG/, 'PO'))
    || null;
};

const hasSignedContractArchive = (purchase) => (purchase.files || []).some((file) => {
  if (file.category === 'SIGNED_CONTRACT') return true;
  const isLegacyUnclassified = !file.category || file.category === 'OTHER';
  return isLegacyUnclassified && /\.(pdf|docx?)$/i.test(file.fileName || '');
});

const buildTradeWorkflow = (salesContract, purchaseMap = new Map()) => {
  const packingItems = salesContract.packingItems || [];
  const purchaseContractNos = unique(packingItems.map((item) => item.purchaseContractNo));
  const linkedPurchases = purchaseContractNos
    .map((contractNo) => getPurchaseByNo(purchaseMap, contractNo))
    .filter(Boolean);
  const missingPurchaseNos = purchaseContractNos.filter(
    (contractNo) => !getPurchaseByNo(purchaseMap, contractNo),
  );
  const purchaseTotal = linkedPurchases.reduce((sum, contract) => sum + (Number(contract.totalAmount) || 0), 0);
  const purchasePaid = linkedPurchases.reduce((sum, contract) => sum + (Number(contract.paidAmount) || 0), 0);
  const allPurchasesPaid = linkedPurchases.length > 0
    && purchaseTotal > 0
    && purchasePaid >= purchaseTotal - 0.01;
  const allProductionReady = linkedPurchases.length > 0 && linkedPurchases.every((contract) => (
    (PURCHASE_RANK[normalizePurchaseStatus(contract.status)] ?? -1) >= PURCHASE_RANK[PURCHASE_STATUS.READY]
  ));
  const allPurchasesSigned = linkedPurchases.length > 0 && linkedPurchases.every((contract) => (
    (PURCHASE_RANK[normalizePurchaseStatus(contract.status)] ?? -1) >= PURCHASE_RANK[PURCHASE_STATUS.SIGNED]
  ));
  const purchaseMissingSignedArchive = linkedPurchases.find((contract) => !hasSignedContractArchive(contract));
  const salesStatus = normalizeSalesStatus(salesContract.status);
  const salesRank = SALES_RANK[salesStatus] ?? 0;
  const readiness = evaluateShipmentReadiness(salesContract);
  const salesFiles = salesContract.files || [];
  const hasExportWorkbook = salesFiles.some((file) => /\.xlsx?$/i.test(file.fileName || ''));
  const hasCarrierPdf = salesFiles.some((file) => /\.pdf$/i.test(file.fileName || ''));
  const hasDeclaration = (salesContract.customsDeclarations || []).length > 0;
  const taxRefunds = salesContract.taxRefunds || [];
  const taxCompleted = taxRefunds.some((refund) => ['APPLIED', 'APPROVED', 'REFUNDED'].includes(refund.status));
  const invoicesComplete = linkedPurchases.length > 0 && linkedPurchases.every((purchase) => (
    Boolean(purchase.invoiceNo)
    || packingItems.some((item) => (
      Boolean(item.invoiceNo)
      && getPurchaseByNo(purchaseMap, item.purchaseContractNo)?.contractNo === purchase.contractNo
    ))
  ));
  const receivableComplete = Number(salesContract.totalAmount) > 0
    && Number(salesContract.receivedAmount) >= Number(salesContract.totalAmount) - 0.01;
  const prepareOn = getTaxPreparationDate(salesContract.shippedAt);
  const firstPurchase = linkedPurchases[0];

  const procurementStage = purchaseContractNos.length === 0
    ? {
        key: 'procurement', label: '采购签约', status: 'blocked', reason: '装箱明细未关联购销合同',
        action: { label: '关联购销合同', href: `/dashboard/sales/${salesContract.id}` },
      }
    : missingPurchaseNos.length > 0
      ? {
          key: 'procurement', label: '采购签约', status: 'blocked', reason: `找不到购销合同 ${missingPurchaseNos.join('、')}`,
          action: { label: '修正合同关联', href: `/dashboard/sales/${salesContract.id}` },
        }
      : !allPurchasesSigned
        ? {
            key: 'procurement', label: '采购签约', status: 'current', reason: '仍有购销合同待签约',
            action: { label: '完成购销合同签约', href: `/dashboard/purchase/${firstPurchase?.id}` },
          }
        : purchaseMissingSignedArchive
          ? {
              key: 'procurement', label: '采购签约', status: 'current', reason: '已签约，仍有供应商盖章件未归档',
              action: { label: '上传供应商盖章件', href: `/dashboard/purchase/${purchaseMissingSignedArchive.id}` },
            }
          : {
              key: 'procurement', label: '采购签约', status: 'completed',
              reason: `已关联 ${linkedPurchases.length} 份购销合同，盖章件已归档`,
            };

  const paymentStage = linkedPurchases.length === 0
    ? { key: 'payment', label: '采购付款', status: 'pending', reason: '先关联购销合同' }
    : allPurchasesPaid
      ? { key: 'payment', label: '采购付款', status: 'completed', reason: `已付清 ¥${roundMoney(purchasePaid).toLocaleString('zh-CN')}` }
      : {
          key: 'payment', label: '采购付款', status: 'current',
          reason: `已付 ¥${roundMoney(purchasePaid).toLocaleString('zh-CN')}，待付 ¥${roundMoney(Math.max(purchaseTotal - purchasePaid, 0)).toLocaleString('zh-CN')}`,
          action: {
            label: purchasePaid > 0 ? '登记采购尾款' : '登记采购定金',
            href: `/dashboard/purchase/${firstPurchase?.id}`,
          },
        };

  const productionStage = linkedPurchases.length === 0
    ? { key: 'production', label: '生产与资料', status: 'pending', reason: '先关联购销合同' }
    : allProductionReady
      ? { key: 'production', label: '生产与资料', status: 'completed', reason: '供应商已确认生产完成' }
      : {
          key: 'production', label: '生产与资料', status: 'current', reason: '待确认生产完成并补充实物图、箱规和重量',
          action: { label: '更新生产状态', href: `/dashboard/purchase/${firstPurchase?.id}` },
        };

  let loadingStage;
  if (readiness.overloaded) {
    loadingStage = {
      key: 'loading', label: '排柜与出货', status: 'blocked',
      reason: readiness.overloadReasons.includes('weight') ? '毛重超过 22 吨安全上限' : '体积超过 68 立方米安全上限',
      action: { label: '调整装箱明细', href: `/dashboard/sales/${salesContract.id}` },
    };
  } else if (readiness.unplacedBoxCount > 0) {
    loadingStage = {
      key: 'loading', label: '排柜与出货', status: 'blocked', reason: `3D 排柜仍有 ${readiness.unplacedBoxCount} 箱无法装入`,
      action: { label: '调整排柜', href: `/dashboard/sales/${salesContract.id}` },
    };
  } else if (readiness.missingBoxItemCount > 0 || packingItems.length === 0) {
    loadingStage = {
      key: 'loading', label: '排柜与出货', status: 'blocked', reason: '箱数或装箱明细未填写完整',
      action: { label: '补充箱规数据', href: `/dashboard/sales/${salesContract.id}` },
    };
  } else if (salesRank >= SALES_RANK[SALES_STATUS.SHIPPED]) {
    loadingStage = { key: 'loading', label: '排柜与出货', status: 'completed', reason: '已确认发运' };
  } else if (readiness.ready) {
    loadingStage = {
      key: 'loading', label: '排柜与出货', status: 'current', reason: '利用率达标且全部箱件可装下',
      action: { label: '确认发运', href: `/dashboard/sales/${salesContract.id}` },
    };
  } else {
    loadingStage = {
      key: 'loading', label: '排柜与出货', status: 'current', reason: '毛重和体积均未达到 80% 出柜标准',
      action: { label: '继续排柜', href: `/dashboard/sales/${salesContract.id}` },
    };
  }

  const documentsComplete = hasExportWorkbook && hasCarrierPdf && hasDeclaration;
  const documentsStage = documentsComplete
    ? { key: 'documents', label: '出口单证', status: 'completed', reason: '工作簿、船司文件与报关记录已齐' }
    : salesRank < SALES_RANK[SALES_STATUS.PACKING]
      ? { key: 'documents', label: '出口单证', status: 'pending', reason: '进入装柜后准备出口单证' }
      : {
          key: 'documents', label: '出口单证', status: 'current',
          reason: `待补：${[!hasExportWorkbook && '出口工作簿', !hasCarrierPdf && '船司 PDF', !hasDeclaration && '报关记录'].filter(Boolean).join('、')}`,
          action: { label: '完善出口单证', href: `/dashboard/sales/${salesContract.id}` },
        };

  const invoiceStage = invoicesComplete
    ? { key: 'invoice', label: '供应商发票', status: 'completed', reason: '关联采购发票号码已齐' }
    : salesRank < SALES_RANK[SALES_STATUS.SHIPPED]
      ? { key: 'invoice', label: '供应商发票', status: 'pending', reason: '发运后催供应商开票' }
      : {
          key: 'invoice', label: '供应商发票', status: 'current', reason: '仍有供应商发票号码未登记',
          action: { label: '催票并登记号码', href: `/dashboard/purchase/${firstPurchase?.id || ''}` },
        };

  const taxStage = taxCompleted
    ? { key: 'tax-refund', label: '退税准备', status: 'completed', reason: '退税记录已进入申报或后续状态', prepareOn }
    : salesRank < SALES_RANK[SALES_STATUS.SHIPPED]
      ? { key: 'tax-refund', label: '退税准备', status: 'pending', reason: '发运后按次月 5 日内部准备提醒跟进', prepareOn }
      : {
          key: 'tax-refund', label: '退税准备', status: 'current',
          reason: prepareOn ? `${prepareOn} 为内部准备提醒；法定期限以当前税务规则和申报期为准` : '内部准备提醒待生成',
          prepareOn,
          action: { label: '检查退税材料', href: '/dashboard/tax-refunds' },
        };

  const financeStage = allPurchasesPaid && receivableComplete
    ? { key: 'finance', label: '财务结清', status: 'completed', reason: '采购成本已付清、美元货款已收齐' }
    : {
        key: 'finance', label: '财务结清', status: salesRank >= SALES_RANK[SALES_STATUS.SHIPPED] ? 'current' : 'pending',
        reason: `采购${allPurchasesPaid ? '已付清' : '未付清'}，货款${receivableComplete ? '已收齐' : '未收齐'}`,
        action: { label: '查看收付与单柜毛利', href: `/dashboard/sales/${salesContract.id}` },
      };

  const stages = [
    procurementStage,
    paymentStage,
    productionStage,
    loadingStage,
    documentsStage,
    invoiceStage,
    taxStage,
    financeStage,
  ];
  const nextStage = stages.find((stage) => stage.status === 'blocked' || stage.status === 'current')
    || stages.find((stage) => stage.status !== 'completed');
  const issues = [];
  if (purchasePaid > purchaseTotal + 0.01) issues.push('采购已付金额超过合同金额');
  if (readiness.overloaded) issues.push('货柜超过 40HQ 安全上限');
  if (readiness.unplacedBoxCount > 0) issues.push(`仍有 ${readiness.unplacedBoxCount} 箱无法装入`);
  if (salesContract.shippedAt && salesContract.createdAt && new Date(salesContract.shippedAt) < new Date(salesContract.createdAt)) {
    issues.push('发运时间早于系统创建时间，请确认是否为历史补录');
  }

  return {
    id: salesContract.id,
    contractNo: salesContract.contractNo,
    status: salesStatus,
    purchaseContractNos,
    stages,
    completedStageCount: stages.filter((stage) => stage.status === 'completed').length,
    stageCount: stages.length,
    nextAction: nextStage?.action || { label: '查看专项单', href: `/dashboard/sales/${salesContract.id}` },
    issues,
    readiness,
    finance: {
      purchaseTotal: roundMoney(purchaseTotal),
      purchasePaid: roundMoney(purchasePaid),
      salesTotalUsd: roundMoney(salesContract.totalAmount),
      receivedUsd: roundMoney(salesContract.receivedAmount),
      exchangeRate: Number(salesContract.exchangeRate) || 0,
    },
  };
};

const listTradeWorkflows = async ({ limit = 20 } = {}) => {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  const salesContracts = await prisma.salesContract.findMany({
    where: { status: { not: SALES_STATUS.CANCELLED } },
    take: safeLimit,
    orderBy: [{ updatedAt: 'desc' }, { contractNo: 'desc' }],
    include: {
      packingItems: { include: { product: true } },
      files: true,
      customsDeclarations: { select: { id: true, status: true } },
      taxRefunds: { select: { id: true, status: true } },
    },
  });
  const purchaseNos = unique(salesContracts.flatMap((contract) => (
    contract.packingItems.map((item) => item.purchaseContractNo)
  )));
  const aliases = unique(purchaseNos.flatMap((contractNo) => [
    contractNo,
    contractNo?.replace(/^PO/, 'CG'),
    contractNo?.replace(/^CG/, 'PO'),
  ]));
  const purchases = aliases.length > 0
    ? await prisma.purchaseContract.findMany({
        where: { contractNo: { in: aliases } },
        include: { files: true },
      })
    : [];
  const purchaseMap = new Map();
  purchases.forEach((contract) => {
    purchaseMap.set(contract.contractNo, contract);
    purchaseMap.set(contract.contractNo.replace(/^PO/, 'CG'), contract);
    purchaseMap.set(contract.contractNo.replace(/^CG/, 'PO'), contract);
  });

  return salesContracts.map((contract) => buildTradeWorkflow(contract, purchaseMap));
};

module.exports = {
  buildTradeWorkflow,
  getTaxPreparationDate,
  listTradeWorkflows,
};
