/**
 * Input: Prisma client、BankTransaction / InvoiceRecord / PurchaseContract / SalesContract 模型
 * Output: 智能关联引擎：银行流水↔合同、发票↔合同的自动匹配与人工核对
 * Pos: 财务模块-智能关联业务逻辑层
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');

// ==================== 常量配置 ====================

const MATCH_STATUS = {
  PENDING: 'PENDING',
  MATCHED: 'MATCHED',
  IGNORED: 'IGNORED',
};

const CONTRACT_TYPE = {
  PURCHASE: 'PURCHASE',
  SALES: 'SALES',
};

const SCORE_THRESHOLD = 70; // 高置信度阈值
const AMOUNT_TOLERANCE = 0.001; // ±0.1%
const AMOUNT_LOOSE_TOLERANCE = 0.01; // ±1%
const DATE_MATCH_WINDOW_DAYS = 30; // 日期匹配窗口
const PURCHASE_KEYWORDS = ['货款', '采购', '购货', '材料款', '设备款', '商品款'];

// ==================== 字符串工具 ====================

function normalizeName(name) {
  return (name || '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/[\s,，.。;；]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * 职责：计算 Levenshtein 距离
 */
function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

/**
 * 职责：计算字符串相似度（0-100）
 * 思路：优先包含匹配，其次 Levenshtein 距离
 */
function stringSimilarity(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 85;

  const dist = levenshteinDistance(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 100;
  return Math.round((1 - dist / maxLen) * 100);
}

/**
 * 职责：计算多名称中的最高相似度
 */
function maxStringSimilarity(name, candidates) {
  if (!candidates || candidates.length === 0) return 0;
  return Math.max(...candidates.map((c) => stringSimilarity(name, c)));
}

// ==================== 评分工具 ====================

/**
 * 职责：金额匹配评分（0-40）
 */
function scoreAmount(txnAmount, contractAmount, paidOrReceived = 0) {
  const unpaid = Math.max(contractAmount - paidOrReceived, 0);
  if (unpaid <= 0) return 0;

  const diff = Math.abs(Math.abs(txnAmount) - unpaid);
  const ratio = diff / unpaid;

  if (ratio <= AMOUNT_TOLERANCE) return 40;
  if (ratio <= AMOUNT_LOOSE_TOLERANCE) return 35;
  if (ratio <= 0.05) return 25;
  if (ratio <= 0.1) return 15;
  if (ratio <= 0.2) return 5;
  return 0;
}

/**
 * 职责：日期匹配评分（0-20）
 * 思路：银行流水/发票日期在合同签订后 30 天内得满分，之后递减
 */
function scoreDate(txnDateStr, signedAt) {
  if (!signedAt || !txnDateStr) return 10; // 无合同日期给中性分

  const txnDate = new Date(txnDateStr);
  const signDate = new Date(signedAt);
  const diffMs = txnDate.getTime() - signDate.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (diffDays < -30) return 0; // 早于合同 30 天以上，基本不可能
  if (diffDays <= 30) return 20;
  if (diffDays <= 60) return 15;
  if (diffDays <= 90) return 10;
  if (diffDays <= 180) return 5;
  return 2;
}

/**
 * 职责：摘要关键词加分（0-10）
 */
function scoreSummary(summary) {
  if (!summary) return 0;
  const text = summary.toLowerCase();
  for (const kw of PURCHASE_KEYWORDS) {
    if (text.includes(kw)) return 10;
  }
  return 0;
}

// ==================== 数据加载 ====================

/**
 * 职责：批量加载待匹配银行流水
 */
async function loadPendingBankTxns(limit = 500) {
  return prisma.bankTransaction.findMany({
    where: { matchStatus: MATCH_STATUS.PENDING },
    orderBy: { txnDate: 'desc' },
    take: limit,
  });
}

/**
 * 职责：批量加载待匹配发票
 */
async function loadPendingInvoices(limit = 500) {
  return prisma.invoiceRecord.findMany({
    where: { matchStatus: MATCH_STATUS.PENDING },
    orderBy: { invDate: 'desc' },
    take: limit,
  });
}

/**
 * 职责：加载所有有效采购合同（含供应商）
 */
async function loadPurchaseContracts() {
  const contracts = await prisma.purchaseContract.findMany({
    where: { NOT: { status: 'CANCELLED' } },
    take: 1000,
    include: { supplier: true },
  });
  return contracts.map((c) => ({
    ...c,
    nameCandidates: [
      c.supplier?.name,
      c.supplier?.shortName,
    ].filter(Boolean),
    unpaidAmount: Math.max(c.totalAmount - c.paidAmount, 0),
  }));
}

/**
 * 职责：加载所有有效销售合同（含门店）
 */
async function loadSalesContracts() {
  const contracts = await prisma.salesContract.findMany({
    where: { NOT: { status: 'CANCELLED' } },
    take: 1000,
    include: {
      packingItems: { include: { store: true } },
      port: true,
    },
  });

  return contracts.map((c) => {
    const storeNames = Array.from(
      new Set(
        c.packingItems
          ?.map((p) => p.store?.name)
          .filter(Boolean) || []
      )
    );
    return {
      ...c,
      nameCandidates: storeNames.length > 0 ? storeNames : [c.port?.name].filter(Boolean),
      unpaidAmount: Math.max(c.totalAmount - c.receivedAmount, 0),
    };
  });
}

// ==================== 匹配核心 ====================

/**
 * 职责：银行流水→采购合同匹配
 */
function matchBankToPurchase(txn, contracts) {
  const best = { score: 0, contract: null, details: null };

  for (const contract of contracts) {
    if (contract.unpaidAmount <= 0) continue;

    const nameSim = maxStringSimilarity(txn.counterpart, contract.nameCandidates);
    if (nameSim < 50) continue;

    const nameScore = Math.round((nameSim / 100) * 40);
    const amountScore = txn.direction === 'OUT'
      ? scoreAmount(txn.amount, contract.totalAmount, contract.paidAmount)
      : 0;
    const dateScore = scoreDate(txn.txnDate, contract.signedAt);
    const summaryScore = txn.direction === 'OUT' ? scoreSummary(txn.summary) : 0;

    const totalScore = nameScore + amountScore + dateScore + summaryScore;

    if (totalScore > best.score) {
      best.score = totalScore;
      best.contract = contract;
      best.details = { nameScore, amountScore, dateScore, summaryScore };
    }
  }

  return best;
}

/**
 * 职责：银行流水→销售合同匹配
 */
function matchBankToSales(txn, contracts) {
  const best = { score: 0, contract: null, details: null };

  for (const contract of contracts) {
    if (contract.unpaidAmount <= 0) continue;

    const nameSim = maxStringSimilarity(txn.counterpart, contract.nameCandidates);
    if (nameSim < 50) continue;

    const nameScore = Math.round((nameSim / 100) * 40);
    const amountScore = txn.direction === 'IN'
      ? scoreAmount(txn.amount, contract.totalAmount, contract.receivedAmount)
      : 0;
    const dateScore = scoreDate(txn.txnDate, contract.signedAt);

    const totalScore = nameScore + amountScore + dateScore;

    if (totalScore > best.score) {
      best.score = totalScore;
      best.contract = contract;
      best.details = { nameScore, amountScore, dateScore };
    }
  }

  return best;
}

/**
 * 职责：发票→采购合同匹配（进项）
 */
function matchInvoiceToPurchase(inv, contracts) {
  const best = { score: 0, contract: null, details: null };

  for (const contract of contracts) {
    const nameSim = maxStringSimilarity(inv.seller, contract.nameCandidates);
    if (nameSim < 50) continue;

    const nameScore = Math.round((nameSim / 100) * 40);
    const amountScore = scoreAmount(inv.total, contract.totalAmount, contract.paidAmount);
    const dateScore = scoreDate(inv.invDate, contract.signedAt);

    const totalScore = nameScore + amountScore + dateScore;

    if (totalScore > best.score) {
      best.score = totalScore;
      best.contract = contract;
      best.details = { nameScore, amountScore, dateScore };
    }
  }

  return best;
}

/**
 * 职责：发票→销售合同匹配（销项）
 */
function matchInvoiceToSales(inv, contracts) {
  const best = { score: 0, contract: null, details: null };

  for (const contract of contracts) {
    const nameSim = maxStringSimilarity(inv.buyer, contract.nameCandidates);
    if (nameSim < 50) continue;

    const nameScore = Math.round((nameSim / 100) * 40);
    const amountScore = scoreAmount(inv.total, contract.totalAmount, contract.receivedAmount);
    const dateScore = scoreDate(inv.invDate, contract.signedAt);

    const totalScore = nameScore + amountScore + dateScore;

    if (totalScore > best.score) {
      best.score = totalScore;
      best.contract = contract;
      best.details = { nameScore, amountScore, dateScore };
    }
  }

  return best;
}

// ==================== 对外服务接口 ====================

/**
 * 职责：触发自动匹配（银行流水 + 发票）
 * 思路：
 *   1. 批量加载待匹配数据与合同
 *   2. 对每条银行流水分别尝试采购/销售合同匹配
 *   3. 对每张发票分别尝试采购/销售合同匹配
 *   4. 总分 ≥ 70 的自动写入 MATCHED，其余保持 PENDING
 *   5. 更新关联合同的已付/已收金额
 */
async function runAutoMatch() {
  const [bankTxns, invoices, purchaseContracts, salesContracts] = await Promise.all([
    loadPendingBankTxns(),
    loadPendingInvoices(),
    loadPurchaseContracts(),
    loadSalesContracts(),
  ]);

  const bankResults = [];
  const invoiceResults = [];

  // 1. 匹配银行流水
  for (const txn of bankTxns) {
    let best;
    let contractType;

    if (txn.direction === 'OUT') {
      best = matchBankToPurchase(txn, purchaseContracts);
      contractType = CONTRACT_TYPE.PURCHASE;
    } else {
      best = matchBankToSales(txn, salesContracts);
      contractType = CONTRACT_TYPE.SALES;
    }

    if (best.score >= SCORE_THRESHOLD) {
      await prisma.bankTransaction.update({
        where: { id: txn.id },
        data: {
          matchedContractId: best.contract.id,
          matchedContractType: contractType,
          matchScore: best.score,
          matchStatus: MATCH_STATUS.MATCHED,
          matchedAt: new Date(),
        },
      });

      bankResults.push({
        id: txn.id,
        matched: true,
        contractId: best.contract.id,
        contractType,
        score: best.score,
      });
    } else {
      bankResults.push({
        id: txn.id,
        matched: false,
        score: best.score,
      });
    }
  }

  // 2. 匹配发票
  for (const inv of invoices) {
    const pBest = matchInvoiceToPurchase(inv, purchaseContracts);
    const sBest = matchInvoiceToSales(inv, salesContracts);

    let best;
    let contractType;

    if (pBest.score >= sBest.score) {
      best = pBest;
      contractType = CONTRACT_TYPE.PURCHASE;
    } else {
      best = sBest;
      contractType = CONTRACT_TYPE.SALES;
    }

    if (best.score >= SCORE_THRESHOLD) {
      await prisma.invoiceRecord.update({
        where: { id: inv.id },
        data: {
          matchedContractId: best.contract.id,
          matchedContractType: contractType,
          matchScore: best.score,
          matchStatus: MATCH_STATUS.MATCHED,
          matchedAt: new Date(),
        },
      });

      invoiceResults.push({
        id: inv.id,
        matched: true,
        contractId: best.contract.id,
        contractType,
        score: best.score,
      });
    } else {
      invoiceResults.push({
        id: inv.id,
        matched: false,
        score: best.score,
      });
    }
  }

  return {
    bankMatched: bankResults.filter((r) => r.matched).length,
    bankTotal: bankResults.length,
    invoiceMatched: invoiceResults.filter((r) => r.matched).length,
    invoiceTotal: invoiceResults.length,
    details: {
      bank: bankResults,
      invoices: invoiceResults,
    },
  };
}

/**
 * 职责：获取未匹配项列表（分页）
 */
async function getUnmatchedItems({ page = 1, pageSize = 20, type } = {}) {
  const skip = (page - 1) * pageSize;
  const where = { matchStatus: MATCH_STATUS.PENDING };

  let bankItems = [];
  let invoiceItems = [];
  let bankTotal = 0;
  let invoiceTotal = 0;

  if (!type || type === 'BANK') {
    [bankItems, bankTotal] = await Promise.all([
      prisma.bankTransaction.findMany({
        where,
        orderBy: { txnDate: 'desc' },
        skip,
        take: pageSize,
        include: { batch: { select: { fileName: true } } },
      }),
      prisma.bankTransaction.count({ where }),
    ]);
  }

  if (!type || type === 'INVOICE') {
    [invoiceItems, invoiceTotal] = await Promise.all([
      prisma.invoiceRecord.findMany({
        where,
        orderBy: { invDate: 'desc' },
        skip,
        take: pageSize,
        include: { batch: { select: { fileName: true } } },
      }),
      prisma.invoiceRecord.count({ where }),
    ]);
  }

  return {
    bankItems,
    invoiceItems,
    bankTotal,
    invoiceTotal,
    page,
    pageSize,
  };
}

/**
 * 职责：人工确认关联
 * @param {string} entityType - 'BANK' | 'INVOICE'
 * @param {string} entityId
 * @param {string} contractId
 * @param {string} contractType - 'PURCHASE' | 'SALES'
 */
async function manualMatch(entityType, entityId, contractId, contractType) {
  const model = entityType === 'BANK' ? prisma.bankTransaction : prisma.invoiceRecord;

  const updated = await model.update({
    where: { id: entityId },
    data: {
      matchedContractId: contractId,
      matchedContractType: contractType,
      matchScore: 100,
      matchStatus: MATCH_STATUS.MATCHED,
      matchedAt: new Date(),
    },
  });

  return updated;
}

/**
 * 职责：解除关联
 */
async function unmatch(entityType, entityId) {
  const model = entityType === 'BANK' ? prisma.bankTransaction : prisma.invoiceRecord;

  const updated = await model.update({
    where: { id: entityId },
    data: {
      matchedContractId: null,
      matchedContractType: null,
      matchScore: null,
      matchStatus: MATCH_STATUS.PENDING,
      matchedAt: null,
    },
  });

  return updated;
}

/**
 * 职责：忽略该项（不关联）
 */
async function ignore(entityType, entityId) {
  const model = entityType === 'BANK' ? prisma.bankTransaction : prisma.invoiceRecord;

  const updated = await model.update({
    where: { id: entityId },
    data: {
      matchedContractId: null,
      matchedContractType: null,
      matchScore: null,
      matchStatus: MATCH_STATUS.IGNORED,
      matchedAt: null,
    },
  });

  return updated;
}

/**
 * 职责：获取可用于人工匹配的合同列表（按类型筛选）
 */
async function listContractsForMatch(contractType, search = '') {
  if (contractType === CONTRACT_TYPE.PURCHASE) {
    const where = {
      NOT: { status: 'CANCELLED' },
      ...(search
        ? {
            OR: [
              { contractNo: { contains: search } },
              { supplier: { name: { contains: search } } },
            ],
          }
        : {}),
    };

    return prisma.purchaseContract.findMany({
      where,
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: { supplier: true },
    });
  }

  if (contractType === CONTRACT_TYPE.SALES) {
    const where = {
      NOT: { status: 'CANCELLED' },
      ...(search
        ? {
            OR: [
              { contractNo: { contains: search } },
              { packingItems: { some: { store: { name: { contains: search } } } } },
            ],
          }
        : {}),
    };

    return prisma.salesContract.findMany({
      where,
      take: 50,
      orderBy: { contractNo: 'desc' },
      include: {
        packingItems: { include: { store: true } },
        port: true,
      },
    });
  }

  return [];
}

module.exports = {
  runAutoMatch,
  getUnmatchedItems,
  manualMatch,
  unmatch,
  ignore,
  listContractsForMatch,
};
